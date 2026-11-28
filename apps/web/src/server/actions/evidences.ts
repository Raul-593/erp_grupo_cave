'use server';

import { revalidatePath } from 'next/cache';
import { deleteEvidence, getEvidenceFile, getItemProjectId, withTransaction } from '@erp/db';
import { canDeleteEvidence } from '@/domain/access/permissions';
import type { InlineResult } from '@/lib/action-state';
import { audit, authorize, FORBIDDEN } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { IMAGE_ERROR_MESSAGES, IMAGE_TYPES, type ImageMime } from '@/lib/image';
import { idSchema } from '../schemas';
import { newEvidenceKey } from '../services/evidence-upload';
import { fileStorage, maxEvidenceBytes } from '../storage';

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

export type EvidenceUploadTarget =
  | { ok: true; mode: 'server' }
  | { ok: true; mode: 'direct'; url: string; key: string }
  | { ok: false; message: string };

/**
 * Prepara la subida de una fotografía. Con almacenamiento remoto devuelve un permiso de un solo
 * uso para que el celular la envíe directo a Supabase Storage (sin pasar por este servidor, que
 * en el hosting tiene un límite de tamaño); después se registra con la ruta de evidencias, que la
 * valida. Con almacenamiento local, la foto se envía a esa ruta como hasta ahora.
 */
export async function prepareEvidenceUpload(input: { itemId: string; size: number; type: string }): Promise<EvidenceUploadTarget> {
  const itemId = idSchema('Ítem').safeParse(input?.itemId);
  if (!itemId.success) return { ok: false, message: 'Ítem no válido.' };
  const auth = await authorize('evidence.upload', { itemId: itemId.data });
  if (!auth.ok) return auth;
  const maxBytes = maxEvidenceBytes();
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, message: IMAGE_ERROR_MESSAGES.empty(maxBytes) };
  if (input.size > maxBytes) return { ok: false, message: IMAGE_ERROR_MESSAGES.too_large(maxBytes) };
  try {
    const storage = fileStorage();
    if (!storage.signedUpload) return { ok: true, mode: 'server' };
    const projectId = await getItemProjectId(db(), itemId.data);
    if (!projectId) return { ok: false, message: 'Ítem no encontrado.' };
    // La extensión es orientativa: el tipo real se comprueba por el contenido al registrarla.
    const extension = IMAGE_TYPES[input.type as ImageMime] ?? 'jpg';
    const key = newEvidenceKey(projectId, itemId.data, extension);
    const upload = await storage.signedUpload(key);
    return { ok: true, mode: 'direct', url: upload.url, key };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
