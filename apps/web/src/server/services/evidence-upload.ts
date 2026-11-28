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
  | { ok: false; code: ImageValidationError | 'duplicate' | 'missing' | 'invalid_key'; message: string };

const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const EXTENSIONS = [...new Set(Object.values(IMAGE_TYPES))].join('|');

/** Clave opaca de una fotografía: nunca el nombre original ni una ruta del sistema de archivos. */
export function newEvidenceKey(projectId: string, itemId: string, extension: string): string {
  return `evidencias/${projectId}/${itemId}/${randomUUID()}.${extension}`;
}

/** ¿La clave es la de una fotografía nueva de ese ítem? Impide registrar archivos ajenos. */
export function isEvidenceKeyFor(key: string, projectId: string, itemId: string): boolean {
  return new RegExp(`^evidencias/${projectId}/${itemId}/${UUID_PART}\\.(${EXTENSIONS})$`).test(key);
}

/**
 * Valida la fotografía por su contenido, la guarda en el almacenamiento privado y registra sus
 * metadatos. Si el registro en la base falla, borra el archivo para no dejar huérfanos.
 */
export async function uploadEvidence(
  deps: EvidenceUploadDeps,
  input: {
    projectId: string;
    itemId: string;
    name: string;
    bytes: Uint8Array;
    description: string | null;
    /** Usuario que sube la fotografía. */
    uploadedBy: string | null;
  },
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
  const storageKey = newEvidenceKey(input.projectId, input.itemId, IMAGE_TYPES[checked.mime]);
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
      uploadedBy: input.uploadedBy,
    });
    return { ok: true, evidenceId, filename };
  } catch (error) {
    await deps.storage.remove(storageKey).catch(() => undefined);
    // Carga simultánea de la misma foto: la restricción única de la base lo detecta.
    if (deps.isUniqueViolation(error)) return duplicateResult(filename);
    throw error;
  }
}

/**
 * Registra una fotografía que el navegador ya subió directamente al almacenamiento (subida
 * firmada). La valida por su contenido como `uploadEvidence`; si no es válida, está repetida o
 * el registro falla, borra el archivo para no dejar huérfanos.
 */
export async function registerStoredEvidence(
  deps: EvidenceUploadDeps,
  input: {
    projectId: string;
    itemId: string;
    key: string;
    name: string;
    description: string | null;
    uploadedBy: string | null;
  },
): Promise<EvidenceUploadResult> {
  if (!isEvidenceKeyFor(input.key, input.projectId, input.itemId)) {
    return { ok: false, code: 'invalid_key', message: 'La fotografía no corresponde a este ítem.' };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await deps.storage.read(input.key));
  } catch {
    return { ok: false, code: 'missing', message: 'La fotografía no llegó al almacenamiento. Vuelve a intentarlo.' };
  }
  const discard = () => deps.storage.remove(input.key).catch(() => undefined);
  const checked = validateImage(bytes, deps.maxBytes);
  if (!checked.ok) {
    await discard();
    return { ok: false, code: checked.error, message: IMAGE_ERROR_MESSAGES[checked.error](deps.maxBytes) };
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const filename = sanitizeImageFilename(input.name, checked.mime);
  const duplicate = await deps.findByHash(input.itemId, sha256);
  if (duplicate) {
    await discard();
    return { ok: false, code: 'duplicate', message: `Esta fotografía ya está cargada en el ítem como «${duplicate.originalFilename}».` };
  }
  try {
    const evidenceId = await deps.create({
      itemId: input.itemId,
      storageProvider: deps.storage.provider,
      storageKey: input.key,
      originalFilename: filename,
      mimeType: checked.mime,
      sizeBytes: bytes.length,
      sha256,
      description: input.description,
      uploadedBy: input.uploadedBy,
    });
    return { ok: true, evidenceId, filename };
  } catch (error) {
    await discard();
    if (deps.isUniqueViolation(error)) {
      return { ok: false, code: 'duplicate', message: `Esta fotografía ya está cargada en el ítem como «${filename}».` };
    }
    throw error;
  }
}
