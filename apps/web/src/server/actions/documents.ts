'use server';

import { revalidatePath } from 'next/cache';
import { deleteUnprocessedDocument, withTransaction } from '@erp/db';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { idSchema } from '../schemas';
import { fileStorage } from '../storage';

/**
 * Elimina un TDR cargado por error, solo si todavía no tiene intentos de extracción.
 * El archivo se borra dentro de la transacción: si falla, el registro se conserva.
 */
export async function deleteTdrDocument(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const id = idSchema('Documento').safeParse(formData.get('id'));
  if (!id.success) return { ok: false, message: 'Documento no válido.' };
  const auth = await authorize('tdr.manage');
  if (!auth.ok) return auth;
  try {
    const deleted = await withTransaction(db(), async (tx) => {
      const file = await deleteUnprocessedDocument(tx, id.data);
      if (!file) return false;
      await audit(tx, auth.user, 'tdr_document.delete', 'tdr_documents', id.data);
      const storage = fileStorage();
      if (file.storageProvider !== storage.provider) throw new Error('Proveedor de almacenamiento distinto');
      await storage.remove(file.storageKey);
      return true;
    });
    revalidatePath('/operacion', 'layout');
    return deleted
      ? { ok: true, message: 'Documento eliminado.' }
      : { ok: false, message: 'No se puede eliminar: el documento ya tiene procesamientos o no existe.' };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
