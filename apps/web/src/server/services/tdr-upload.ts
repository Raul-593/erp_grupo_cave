import { createHash, randomUUID } from 'node:crypto';
import type { TdrDocumentInput } from '@erp/db';
import type { FileStorage } from '@/integrations/storage/types';
import { PDF_ERROR_MESSAGES, sanitizeFilename, validatePdf, type PdfValidationError } from '@/lib/pdf';

export interface UploadDeps {
  storage: FileStorage;
  maxBytes: number;
  findByHash(projectId: string, sha256: string): Promise<{ id: string; originalFilename: string } | null>;
  create(input: TdrDocumentInput): Promise<string>;
  isUniqueViolation(error: unknown): boolean;
}

export type UploadResult =
  | { ok: true; documentId: string; filename: string }
  | { ok: false; code: PdfValidationError | 'duplicate'; message: string };

/**
 * Valida el PDF, lo guarda en el almacenamiento privado y registra sus metadatos.
 * Si el registro en la base falla, borra el archivo para no dejar huérfanos.
 */
export async function uploadTdr(
  deps: UploadDeps,
  input: { projectId: string; name: string; type: string; bytes: Uint8Array },
): Promise<UploadResult> {
  const invalid = validatePdf(input, deps.maxBytes);
  if (invalid) return { ok: false, code: invalid, message: PDF_ERROR_MESSAGES[invalid](deps.maxBytes) };

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const duplicate = await deps.findByHash(input.projectId, sha256);
  const duplicateResult = (filename: string): UploadResult => ({
    ok: false,
    code: 'duplicate',
    message: `Este PDF ya está cargado en el proyecto como «${filename}».`,
  });
  if (duplicate) return duplicateResult(duplicate.originalFilename);

  const filename = sanitizeFilename(input.name);
  const storageKey = `tdr/${input.projectId}/${randomUUID()}.pdf`;
  await deps.storage.put(storageKey, input.bytes);
  try {
    const documentId = await deps.create({
      projectId: input.projectId,
      storageProvider: deps.storage.provider,
      storageKey,
      originalFilename: filename,
      sizeBytes: input.bytes.length,
      sha256,
      pageCount: null,
    });
    return { ok: true, documentId, filename };
  } catch (error) {
    await deps.storage.remove(storageKey).catch(() => undefined);
    // Carga simultánea del mismo archivo: la restricción única de la base lo detecta.
    if (deps.isUniqueViolation(error)) return duplicateResult(filename);
    throw error;
  }
}
