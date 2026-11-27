'use server';

import { revalidatePath } from 'next/cache';
import { deleteEvidence, withTransaction } from '@erp/db';
import type { InlineResult } from '@/lib/action-state';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { idSchema } from '../schemas';
import { fileStorage } from '../storage';

/**
 * Elimina una fotografía de evidencia (la pantalla pide confirmación antes). El archivo se
 * borra dentro de la transacción: si falla, el registro se conserva.
 */
export async function removeEvidence(input: unknown): Promise<InlineResult> {
  const id = idSchema('Fotografía').safeParse(input);
  if (!id.success) return { ok: false, message: 'Fotografía no válida.' };
  try {
    const deleted = await withTransaction(db(), async (tx) => {
      const file = await deleteEvidence(tx, id.data);
      if (!file) return false;
      const storage = fileStorage();
      if (file.storageProvider !== storage.provider) throw new Error('Proveedor de almacenamiento distinto');
      await storage.remove(file.storageKey);
      return true;
    });
    revalidatePath('/operacion', 'layout');
    return deleted ? { ok: true } : { ok: false, message: 'La fotografía ya no existe. Recarga la página.' };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
