'use server';

import { revalidatePath } from 'next/cache';
import { getDocumentFile, projectHasConfirmedMatrix, recordAudit } from '@erp/db';
import { authorize } from '../auth';
import { db } from '../db';
import { DRAFT_MESSAGES, toUserMessage } from '../errors';
import { startExtraction } from '../extraction-runner';
import { idSchema } from '../schemas';

/**
 * «Procesar TDR con IA». El navegador genera `idempotencyKey` una vez por clic, de modo que
 * un doble envío o un reintento devuelve el mismo intento en lugar de crear otro. Si el
 * proyecto ya tiene una matriz confirmada no se procesa: el resultado no podría confirmarse
 * (una matriz por proyecto, D-7).
 */
export async function processTdr(documentId: string, idempotencyKey: string): Promise<{ ok: boolean; message: string }> {
  const id = idSchema('Documento').safeParse(documentId);
  const key = idSchema('Operación').safeParse(idempotencyKey);
  if (!id.success || !key.success) return { ok: false, message: 'Solicitud no válida.' };
  const auth = await authorize('tdr.manage');
  if (!auth.ok) return auth;
  try {
    const document = await getDocumentFile(db(), id.data);
    if (document && (await projectHasConfirmedMatrix(db(), document.projectId))) {
      return { ok: false, message: DRAFT_MESSAGES.project_has_confirmed_matrix };
    }
    const result = await startExtraction(id.data, key.data);
    if (result.ok) {
      await recordAudit(db(), { userId: auth.user.id, action: 'tdr_document.process', entity: 'tdr_documents', entityId: id.data });
    }
    revalidatePath('/operacion', 'layout');
    return result.ok ? { ok: true, message: 'Procesamiento iniciado.' } : { ok: false, message: result.message };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
