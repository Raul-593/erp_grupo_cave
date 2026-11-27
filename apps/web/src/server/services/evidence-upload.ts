import { createHash, randomUUID } from 'node:crypto';
import type { EvidenceInput } from '@erp/db';
import type { FileStorage } from '@/integrations/storage/types';
import { IMAGE_ERROR_MESSAGES, IMAGE_TYPES, sanitizeImageFilename, validateImage, type ImageValidationError } from '@/lib/image';

export interface EvidenceUploadDeps {
  storage: FileStorage;
  maxBytes: number;
  findByHash(itemId: string, sha256: string): Promise<{ id: string; originalFilename: string } | null>;
  create(input: EvidenceInput): Promise<string>;
  isUniqueViolation(error: unknown): boolean;
}

export type EvidenceUploadResult =
  | { ok: true; evidenceId: string; filename: string }
  | { ok: false; code: ImageValidationError | 'duplicate'; message: string };

/**
 * Valida la fotografía por su contenido, la guarda en el almacenamiento privado y registra sus
 * metadatos. Si el registro en la base falla, borra el archivo para no dejar huérfanos.
 */
export async function uploadEvidence(
  deps: EvidenceUploadDeps,
  input: { projectId: string; itemId: string; name: string; bytes: Uint8Array; description: string | null },
): Promise<EvidenceUploadResult> {
  const checked = validateImage(input.bytes, deps.maxBytes);
  if (!checked.ok) return { ok: false, code: checked.error, message: IMAGE_ERROR_MESSAGES[checked.error](deps.maxBytes) };

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const duplicateResult = (filename: string): EvidenceUploadResult => ({
    ok: false,
    code: 'duplicate',
    message: `Esta fotografía ya está cargada en el ítem como «${filename}».`,
  });
  const duplicate = await deps.findByHash(input.itemId, sha256);
  if (duplicate) return duplicateResult(duplicate.originalFilename);

  const filename = sanitizeImageFilename(input.name, checked.mime);
  // Clave opaca: nunca el nombre original ni una ruta del sistema de archivos.
  const storageKey = `evidencias/${input.projectId}/${input.itemId}/${randomUUID()}.${IMAGE_TYPES[checked.mime]}`;
  await deps.storage.put(storageKey, input.bytes);
  try {
    const evidenceId = await deps.create({
      itemId: input.itemId,
      storageProvider: deps.storage.provider,
      storageKey,
      originalFilename: filename,
      mimeType: checked.mime,
      sizeBytes: input.bytes.length,
      sha256,
      description: input.description,
    });
    return { ok: true, evidenceId, filename };
  } catch (error) {
    await deps.storage.remove(storageKey).catch(() => undefined);
    // Carga simultánea de la misma foto: la restricción única de la base lo detecta.
    if (deps.isUniqueViolation(error)) return duplicateResult(filename);
    throw error;
  }
}
