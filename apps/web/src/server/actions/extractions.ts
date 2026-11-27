'use server';

import { revalidatePath } from 'next/cache';
import { startExtraction } from '../extraction-runner';
import { toUserMessage } from '../errors';
import { idSchema } from '../schemas';

/**
 * «Procesar TDR con IA». El navegador genera `idempotencyKey` una vez por clic, de modo que
 * un doble envío o un reintento devuelve el mismo intento en lugar de crear otro.
 */
export async function processTdr(documentId: string, idempotencyKey: string): Promise<{ ok: boolean; message: string }> {
  const id = idSchema('Documento').safeParse(documentId);
  const key = idSchema('Operación').safeParse(idempotencyKey);
  if (!id.success || !key.success) return { ok: false, message: 'Solicitud no válida.' };
  try {
    const result = await startExtraction(id.data, key.data);
    revalidatePath('/operacion', 'layout');
    return result.ok ? { ok: true, message: 'Procesamiento iniciado.' } : { ok: false, message: result.message };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
