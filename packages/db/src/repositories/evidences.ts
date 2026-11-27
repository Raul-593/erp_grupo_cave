import type { EvidenceMimeType } from '../domain.ts';
import type { StorageProvider } from './documents.ts';
import type { Queryable } from './shared.ts';

/** Fotografía de evidencia de un ítem (sin la referencia interna al archivo). */
export interface Evidence {
  id: string;
  itemId: string;
  originalFilename: string;
  mimeType: EvidenceMimeType;
  sizeBytes: number;
  description: string | null;
  uploadedAt: Date;
  /** Usuario que la subió; null en las fotografías anteriores a la existencia de usuarios. */
  uploadedBy: string | null;
  uploadedByName: string | null;
}

/** Referencia completa al archivo, solo para el servidor. */
export interface EvidenceFile extends Evidence {
  storageProvider: StorageProvider;
  storageKey: string;
}

export interface EvidenceInput {
  itemId: string;
  storageProvider: StorageProvider;
  storageKey: string;
  originalFilename: string;
  mimeType: EvidenceMimeType;
  sizeBytes: number;
  sha256: string;
  description: string | null;
  uploadedBy: string | null;
}

const COLUMNS = `e.id, e.tdr_item_id AS "itemId", e.original_filename AS "originalFilename", e.mime_type AS "mimeType",
  e.size_bytes::float8 AS "sizeBytes", e.description, e.uploaded_at AS "uploadedAt",
  e.uploaded_by AS "uploadedBy", u.full_name AS "uploadedByName"`;
const FROM = `item_evidences e LEFT JOIN app_users u ON u.id = e.uploaded_by`;

export async function listItemEvidences(db: Queryable, itemId: string): Promise<Evidence[]> {
  const { rows } = await db.query<Evidence>(
    `SELECT ${COLUMNS} FROM ${FROM} WHERE e.tdr_item_id = $1 ORDER BY e.uploaded_at DESC, e.id`,
    [itemId],
  );
  return rows;
}

export async function getEvidenceFile(db: Queryable, id: string): Promise<EvidenceFile | null> {
  const { rows } = await db.query<EvidenceFile>(
    `SELECT ${COLUMNS}, e.storage_provider AS "storageProvider", e.storage_key AS "storageKey" FROM ${FROM} WHERE e.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Busca la misma fotografía (mismo hash) ya cargada en el ítem. */
export async function findEvidenceByHash(
  db: Queryable,
  itemId: string,
  sha256: string,
): Promise<{ id: string; originalFilename: string } | null> {
  const { rows } = await db.query<{ id: string; originalFilename: string }>(
    `SELECT id, original_filename AS "originalFilename" FROM item_evidences WHERE tdr_item_id = $1 AND sha256 = $2`,
    [itemId, sha256],
  );
  return rows[0] ?? null;
}

/** Registra una fotografía. La base solo la admite sobre ítems de una matriz confirmada. */
export async function createEvidence(db: Queryable, input: EvidenceInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO item_evidences (tdr_item_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256, description, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      input.itemId,
      input.storageProvider,
      input.storageKey,
      input.originalFilename,
      input.mimeType,
      input.sizeBytes,
      input.sha256,
      input.description,
      input.uploadedBy,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de fotografía sin resultado');
  return id;
}

/**
 * Elimina el registro de una fotografía. Devuelve la referencia del archivo para borrarlo del
 * almacenamiento, o null si ya no existía.
 */
export async function deleteEvidence(
  db: Queryable,
  id: string,
): Promise<Pick<EvidenceFile, 'storageProvider' | 'storageKey'> | null> {
  const { rows } = await db.query<Pick<EvidenceFile, 'storageProvider' | 'storageKey'>>(
    `DELETE FROM item_evidences WHERE id = $1 RETURNING storage_provider AS "storageProvider", storage_key AS "storageKey"`,
    [id],
  );
  return rows[0] ?? null;
}
