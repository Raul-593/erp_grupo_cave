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
}

const COLUMNS = `id, tdr_item_id AS "itemId", original_filename AS "originalFilename", mime_type AS "mimeType",
  size_bytes::float8 AS "sizeBytes", description, uploaded_at AS "uploadedAt"`;

export async function listItemEvidences(db: Queryable, itemId: string): Promise<Evidence[]> {
  const { rows } = await db.query<Evidence>(
    `SELECT ${COLUMNS} FROM item_evidences WHERE tdr_item_id = $1 ORDER BY uploaded_at DESC, id`,
    [itemId],
  );
  return rows;
}

export async function getEvidenceFile(db: Queryable, id: string): Promise<EvidenceFile | null> {
  const { rows } = await db.query<EvidenceFile>(
    `SELECT ${COLUMNS}, storage_provider AS "storageProvider", storage_key AS "storageKey" FROM item_evidences WHERE id = $1`,
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
    `INSERT INTO item_evidences (tdr_item_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      input.itemId,
      input.storageProvider,
      input.storageKey,
      input.originalFilename,
      input.mimeType,
      input.sizeBytes,
      input.sha256,
      input.description,
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
