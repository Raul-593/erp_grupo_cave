'use server';

import { revalidatePath } from 'next/cache';
import { deleteEvidence, getEvidenceFile, withTransaction } from '@erp/db';
import { canDeleteEvidence } from '@/domain/access/permissions';
import type { InlineResult } from '@/lib/action-state';
import { audit, authorize, FORBIDDEN } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { idSchema } from '../schemas';
import { fileStorage } from '../storage';

const GONE = 'La fotografía ya no existe. Recarga la página.';

/**
 * Elimina una fotografía de evidencia (la pantalla pide confirmación antes). El superusuario
 * elimina cualquiera; el empleado de campo, solo las que subió en sus ítems (U-D5). El archivo
 * se borra dentro de la transacción: si falla, el registro se conserva.
 */
export async function removeEvidence(input: unknown): Promise<InlineResult> {
  const id = idSchema('Fotografía').safeParse(input);
  if (!id.success) return { ok: false, message: 'Fotografía no válida.' };
  try {
    const evidence = await getEvidenceFile(db(), id.data);
    if (!evidence) return { ok: false, message: GONE };
    const auth = await authorize('evidence.read', { itemId: evidence.itemId });
    if (!auth.ok) return auth;
    if (!canDeleteEvidence(auth.user, evidence.uploadedBy)) return { ok: false, message: FORBIDDEN };

    const deleted = await withTransaction(db(), async (tx) => {
      const file = await deleteEvidence(tx, id.data);
      if (!file) return false;
      await audit(tx, auth.user, 'evidence.delete', 'item_evidences', id.data, {
        itemId: evidence.itemId,
        filename: evidence.originalFilename,
      });
      const storage = fileStorage();
      if (file.storageProvider !== storage.provider) throw new Error('Proveedor de almacenamiento distinto');
      await storage.remove(file.storageKey);
      return true;
    });
    revalidatePath('/operacion', 'layout');
    return deleted ? { ok: true } : { ok: false, message: GONE };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
