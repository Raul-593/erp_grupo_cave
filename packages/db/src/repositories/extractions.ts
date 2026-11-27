import type { ExtractionStatus } from '../domain.ts';
import type { Queryable } from './shared.ts';

export interface ExtractionInput {
  documentId: string;
  idempotencyKey: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface ExtractionSummary {
  id: string;
  documentId: string;
  status: ExtractionStatus;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  rawResponse: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  /** Versión de la fila (control de concurrencia al confirmar la matriz). */
  version: number;
}

const SELECT = `
  SELECT id, tdr_document_id AS "documentId", status, provider, model, prompt_version AS "promptVersion",
         schema_version AS "schemaVersion", raw_response AS "rawResponse", error_code AS "errorCode",
         error_message AS "errorMessage", input_tokens AS "inputTokens", output_tokens AS "outputTokens",
         total_tokens AS "totalTokens", duration_ms AS "durationMs", created_at AS "createdAt",
         started_at AS "startedAt", finished_at AS "finishedAt", version
    FROM tdr_extractions`;

/**
 * Crea un intento `pending`. Si la clave de idempotencia ya existe (doble clic o reintento),
 * devuelve el intento existente sin crear otro. Si el documento ya tiene un procesamiento
 * activo, PostgreSQL rechaza la inserción (tdr_extractions_one_active_per_document).
 */
export async function createExtraction(
  db: Queryable,
  input: ExtractionInput,
): Promise<{ id: string; documentId: string; created: boolean }> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [input.documentId, input.idempotencyKey, input.provider, input.model, input.promptVersion, input.schemaVersion],
  );
  if (rows[0]) return { id: rows[0].id, documentId: input.documentId, created: true };
  const existing = await db.query<{ id: string; documentId: string }>(
    `SELECT id, tdr_document_id AS "documentId" FROM tdr_extractions WHERE idempotency_key = $1`,
    [input.idempotencyKey],
  );
  const row = existing.rows[0];
  if (!row) throw new Error('Intento no encontrado tras conflicto de idempotencia');
  return { ...row, created: false };
}

export async function getExtraction(db: Queryable, id: string): Promise<ExtractionSummary | null> {
  const { rows } = await db.query<ExtractionSummary>(`${SELECT} WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getLatestExtraction(db: Queryable, documentId: string): Promise<ExtractionSummary | null> {
  const { rows } = await db.query<ExtractionSummary>(
    `${SELECT} WHERE tdr_document_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [documentId],
  );
  return rows[0] ?? null;
}

/** Pasa de `pending` a `processing`. Devuelve false si otro proceso ya lo tomó. */
export async function claimExtraction(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE tdr_extractions SET status = 'processing', started_at = now() WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return rowCount === 1;
}

export interface ExtractionMetadata {
  providerRequestId?: string | null;
  providerResponseId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  durationMs?: number | null;
}

const tokens = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/** Guarda el JSON validado (inmutable desde ese momento) y pasa a `processed`. */
export async function completeExtraction(
  db: Queryable,
  id: string,
  rawResponse: Record<string, unknown>,
  meta: ExtractionMetadata,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE tdr_extractions
        SET status = 'processed', raw_response = $2, provider_request_id = $3, provider_response_id = $4,
            input_tokens = $5, output_tokens = $6, total_tokens = $7, duration_ms = $8, finished_at = now()
      WHERE id = $1 AND status = 'processing'`,
    [
      id,
      JSON.stringify(rawResponse),
      meta.providerRequestId ?? null,
      meta.providerResponseId ?? null,
      tokens(meta.inputTokens),
      tokens(meta.outputTokens),
      tokens(meta.totalTokens),
      tokens(meta.durationMs),
    ],
  );
  return rowCount === 1;
}

/**
 * Marca el intento como `failed` con un código y un mensaje seguro. `rawResponse` conserva,
 * si existe, la respuesta que no cumplió el contrato (para ajustar el prompt).
 */
export async function failExtraction(
  db: Queryable,
  id: string,
  error: { code: string; message: string; rawResponse?: Record<string, unknown> | null },
  meta: ExtractionMetadata = {},
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE tdr_extractions
        SET status = 'failed', error_code = $2, error_message = $3, raw_response = COALESCE(raw_response, $4),
            provider_request_id = COALESCE($5, provider_request_id), provider_response_id = COALESCE($6, provider_response_id),
            input_tokens = $7, output_tokens = $8, total_tokens = $9, duration_ms = $10, finished_at = now()
      WHERE id = $1 AND status IN ('pending', 'processing')`,
    [
      id,
      error.code,
      error.message,
      error.rawResponse ? JSON.stringify(error.rawResponse) : null,
      meta.providerRequestId ?? null,
      meta.providerResponseId ?? null,
      tokens(meta.inputTokens),
      tokens(meta.outputTokens),
      tokens(meta.totalTokens),
      tokens(meta.durationMs),
    ],
  );
  return rowCount === 1;
}

/**
 * Marca como interrumpidos los intentos activos más antiguos que `olderThanSeconds` que no
 * estén en `runningIds` (por ejemplo, tras reiniciar el servidor). Devuelve los ids marcados.
 */
export async function failStaleExtractions(
  db: Queryable,
  options: { olderThanSeconds: number; runningIds: string[]; message: string },
): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE tdr_extractions
        SET status = 'failed', error_code = 'interrupted', error_message = $3, finished_at = now()
      WHERE status IN ('pending', 'processing')
        AND COALESCE(started_at, created_at) < now() - make_interval(secs => $1)
        AND NOT (id = ANY($2::uuid[]))
      RETURNING id`,
    [options.olderThanSeconds, options.runningIds, options.message],
  );
  return rows.map((row) => row.id);
}
