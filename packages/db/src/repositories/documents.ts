import type { ExtractionStatus } from '../domain.ts';
import type { Queryable } from './shared.ts';

export const STORAGE_PROVIDERS = ['local', 'supabase'] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/** Documento TDR con el estado de su último intento de extracción (si existe). */
export interface TdrDocumentSummary {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number | null;
  uploadedAt: Date;
  latestExtractionStatus: ExtractionStatus | null;
  extractionCount: number;
}

/** Referencia completa al archivo, solo para el servidor. */
export interface TdrDocumentFile {
  id: string;
  projectId: string;
  storageProvider: StorageProvider;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface TdrDocumentInput {
  projectId: string;
  storageProvider: StorageProvider;
  storageKey: string;
  originalFilename: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number | null;
}

export async function listDocumentsByProject(db: Queryable, projectId: string): Promise<TdrDocumentSummary[]> {
  const { rows } = await db.query<TdrDocumentSummary>(
    `SELECT d.id, d.original_filename AS "originalFilename", d.size_bytes::float8 AS "sizeBytes",
            d.page_count AS "pageCount", d.uploaded_at AS "uploadedAt", x.status AS "latestExtractionStatus",
            (SELECT count(*)::int FROM tdr_extractions e WHERE e.tdr_document_id = d.id) AS "extractionCount"
       FROM tdr_documents d
       LEFT JOIN LATERAL (
         SELECT status FROM tdr_extractions e
          WHERE e.tdr_document_id = d.id
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT 1
       ) x ON true
      WHERE d.project_id = $1
      ORDER BY d.uploaded_at DESC, d.id`,
    [projectId],
  );
  return rows;
}

const FILE_COLUMNS = `id, project_id AS "projectId", storage_provider AS "storageProvider", storage_key AS "storageKey",
  original_filename AS "originalFilename", mime_type AS "mimeType", size_bytes::float8 AS "sizeBytes", sha256`;

export async function getDocumentFile(db: Queryable, id: string): Promise<TdrDocumentFile | null> {
  const { rows } = await db.query<TdrDocumentFile>(`SELECT ${FILE_COLUMNS} FROM tdr_documents WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Busca un PDF idéntico (mismo hash) ya cargado en el proyecto. */
export async function findDocumentByHash(
  db: Queryable,
  projectId: string,
  sha256: string,
): Promise<{ id: string; originalFilename: string } | null> {
  const { rows } = await db.query<{ id: string; originalFilename: string }>(
    `SELECT id, original_filename AS "originalFilename" FROM tdr_documents WHERE project_id = $1 AND sha256 = $2`,
    [projectId, sha256],
  );
  return rows[0] ?? null;
}

export async function createDocument(db: Queryable, input: TdrDocumentInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO tdr_documents (project_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256, page_count)
     VALUES ($1, $2, $3, $4, 'application/pdf', $5, $6, $7) RETURNING id`,
    [
      input.projectId,
      input.storageProvider,
      input.storageKey,
      input.originalFilename,
      input.sizeBytes,
      input.sha256,
      input.pageCount,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de documento sin resultado');
  return id;
}

/**
 * Elimina el registro de un documento que todavía no tiene intentos de extracción.
 * Devuelve la referencia del archivo para borrarlo del almacenamiento, o null si no se eliminó.
 */
export async function deleteUnprocessedDocument(
  db: Queryable,
  id: string,
): Promise<Pick<TdrDocumentFile, 'storageProvider' | 'storageKey'> | null> {
  const { rows } = await db.query<Pick<TdrDocumentFile, 'storageProvider' | 'storageKey'>>(
    `DELETE FROM tdr_documents d
      WHERE d.id = $1
        AND NOT EXISTS (SELECT 1 FROM tdr_extractions e WHERE e.tdr_document_id = d.id)
      RETURNING d.storage_provider AS "storageProvider", d.storage_key AS "storageKey"`,
    [id],
  );
  return rows[0] ?? null;
}
