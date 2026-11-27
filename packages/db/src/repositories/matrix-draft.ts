/**
 * Borrador de la matriz de entregables y su confirmación (etapa D, PLAN.md D-1…D-10).
 *
 * El borrador son las filas de `tdr_items` de un intento en `processed`: la base solo deja
 * crearlas, editarlas o borrarlas en ese estado y las vuelve inmutables al confirmar. El JSON
 * original de la IA (`raw_response`) nunca cambia. El orden se guarda en `item_number` y se
 * normaliza para que los ítems de un mismo rubro queden juntos (la numeración 1.1, 1.2… se
 * calcula en la presentación). Las funciones que tocan varias filas deben ir en una transacción.
 */
import { randomUUID } from 'node:crypto';
import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

/** Proveedor con el que se registra una matriz empezada a mano (D-1). */
export const MANUAL_PROVIDER = 'manual';

export type DraftRuleCode =
  | 'draft_not_editable'
  | 'project_has_confirmed_matrix'
  | 'draft_empty'
  | 'document_has_active_extraction';

/** Regla de la etapa D incumplida; la aplicación la traduce a un mensaje en español. */
export class DraftRuleError extends Error {
  override name = 'DraftRuleError';
  readonly code: DraftRuleCode;
  constructor(code: DraftRuleCode) {
    super(code);
    this.code = code;
  }
}

export interface DraftExtraction {
  id: string;
  documentId: string;
  projectId: string;
  status: string;
  provider: string;
  version: number;
}

/** Campos editables de una fila (las ocho columnas de la matriz más el rubro). */
export interface DraftItemInput {
  rubro: string;
  producto: string;
  subproducto: string | null;
  descripcion: string;
  cant: string | null;
  unidad: string | null;
  dias: string | null;
  observacion: string | null;
}

export type DraftItemField = keyof DraftItemInput;

const ITEM_COLUMNS: Readonly<Record<DraftItemField, string>> = {
  rubro: 'rubro',
  producto: 'producto',
  subproducto: 'subproducto',
  descripcion: 'descripcion',
  cant: 'cant',
  unidad: 'unidad',
  dias: 'dias',
  observacion: 'observacion',
};

/** Fila del borrador con su procedencia, para comparar con la propuesta de la IA (D-5). */
export interface DraftItem extends DraftItemInput {
  id: string;
  itemNumber: number;
  source: 'ai' | 'manual';
  sourceIndex: number | null;
  workerId: string | null;
  workerName: string | null;
  version: number;
}

export async function getDraftExtraction(db: Queryable, extractionId: string): Promise<DraftExtraction | null> {
  const { rows } = await db.query<DraftExtraction>(
    `SELECT x.id, x.tdr_document_id AS "documentId", d.project_id AS "projectId", x.status, x.provider, x.version
       FROM tdr_extractions x JOIN tdr_documents d ON d.id = x.tdr_document_id
      WHERE x.id = $1`,
    [extractionId],
  );
  return rows[0] ?? null;
}

/** Intento al que pertenece un ítem (para comprobar estado y proyecto antes de cambiarlo). */
export async function getItemExtraction(db: Queryable, itemId: string): Promise<DraftExtraction | null> {
  const { rows } = await db.query<{ extractionId: string }>(`SELECT extraction_id AS "extractionId" FROM tdr_items WHERE id = $1`, [itemId]);
  return rows[0] ? getDraftExtraction(db, rows[0].extractionId) : null;
}

/** ¿El proyecto ya tiene una matriz confirmada? (D-7) */
export async function projectHasConfirmedMatrix(db: Queryable, projectId: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM tdr_extractions x JOIN tdr_documents d ON d.id = x.tdr_document_id
        WHERE d.project_id = $1 AND x.status = 'confirmed') AS ok`,
    [projectId],
  );
  return rows[0]?.ok ?? false;
}

export async function listDraftItems(db: Queryable, extractionId: string): Promise<DraftItem[]> {
  const { rows } = await db.query<DraftItem>(
    `SELECT i.id, i.item_number AS "itemNumber", i.rubro, i.producto, i.subproducto, i.descripcion, i.cant, i.unidad,
            i.dias, i.observacion, i.source, i.source_index AS "sourceIndex", w.id AS "workerId", w.full_name AS "workerName",
            i.version
       FROM tdr_items i
       LEFT JOIN tdr_item_assignments a ON a.tdr_item_id = i.id
       LEFT JOIN workers w ON w.id = a.worker_id
      WHERE i.extraction_id = $1
      ORDER BY i.item_number`,
    [extractionId],
  );
  return rows;
}

/**
 * Copia los ítems de la propuesta (`raw_response.items`, ya validada contra el contrato) a la
 * matriz editable, en el orden del documento. Idempotente: si ya se importaron, no hace nada.
 * Devuelve cuántas filas creó.
 */
export async function importProposalItems(db: Queryable, extractionId: string): Promise<number> {
  const { rowCount } = await db.query(
    `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, subproducto, descripcion, cant, unidad, dias,
                            observacion, source, source_index)
     SELECT x.id, row_number() OVER (ORDER BY (e.value->>'item')::int, e.ordinality),
            btrim(e.value->>'rubro'), btrim(e.value->>'producto'), NULLIF(btrim(e.value->>'subproducto'), ''),
            btrim(e.value->>'descripcion'), (e.value->>'cant')::numeric, NULLIF(btrim(e.value->>'unidad'), ''),
            (e.value->>'dias')::numeric, NULLIF(btrim(e.value->>'observacion'), ''), 'ai', (e.ordinality - 1)::int
       FROM tdr_extractions x
       CROSS JOIN LATERAL jsonb_array_elements(x.raw_response->'items') WITH ORDINALITY AS e(value, ordinality)
      WHERE x.id = $1
        AND x.status = 'processed'
        AND jsonb_typeof(x.raw_response->'items') = 'array'
        AND NOT EXISTS (SELECT 1 FROM tdr_items i WHERE i.extraction_id = x.id)`,
    [extractionId],
  );
  if ((rowCount ?? 0) > 0) await normalizeOrder(db, extractionId);
  return rowCount ?? 0;
}

/**
 * Empieza una matriz a mano sobre un TDR cargado (D-1): un intento `manual`, ya en `processed`,
 * sin filas y sin propuesta. Rechaza si el proyecto ya tiene matriz confirmada.
 */
export async function createManualDraft(db: Queryable, documentId: string): Promise<string> {
  const { rows: project } = await db.query<{ projectId: string }>(`SELECT project_id AS "projectId" FROM tdr_documents WHERE id = $1`, [documentId]);
  const projectId = project[0]?.projectId;
  if (!projectId) throw new VersionConflictError('tdr_documents', documentId);
  if (await projectHasConfirmedMatrix(db, projectId)) throw new DraftRuleError('project_has_confirmed_matrix');
  const { rows: active } = await db.query(
    `SELECT 1 FROM tdr_extractions WHERE tdr_document_id = $1 AND status IN ('pending', 'processing')`,
    [documentId],
  );
  if (active.length > 0) throw new DraftRuleError('document_has_active_extraction');
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version, status,
                                  raw_response, started_at, finished_at)
     VALUES ($1, $2, $3, 'manual', 'manual', 'tdr-v1', 'processed', '{"origen": "manual", "items": []}', now(), now())
     RETURNING id`,
    [documentId, randomUUID(), MANUAL_PROVIDER],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de matriz manual sin resultado');
  return id;
}

/**
 * Renumera las filas para que cada rubro quede junto, en el orden en que aparece por primera
 * vez y, dentro del rubro, en el orden actual. Solo toca las filas cuyo número cambia.
 */
async function normalizeOrder(db: Queryable, extractionId: string): Promise<void> {
  await db.query(
    `WITH grupos AS (
       SELECT lower(btrim(rubro)) AS clave, min(item_number) AS primero
         FROM tdr_items WHERE extraction_id = $1 GROUP BY 1
     ), orden AS (
       SELECT i.id, row_number() OVER (ORDER BY g.primero, i.item_number) AS numero
         FROM tdr_items i JOIN grupos g ON g.clave = lower(btrim(i.rubro))
        WHERE i.extraction_id = $1
     )
     UPDATE tdr_items t SET item_number = o.numero
       FROM orden o
      WHERE t.id = o.id AND t.item_number <> o.numero`,
    [extractionId],
  );
}

async function nextItemNumber(db: Queryable, extractionId: string): Promise<number> {
  const { rows } = await db.query<{ next: number }>(
    `SELECT COALESCE(max(item_number), 0) + 1 AS next FROM tdr_items WHERE extraction_id = $1`,
    [extractionId],
  );
  return rows[0]?.next ?? 1;
}

/** Añade una fila manual al final de su rubro (o de la matriz, si el rubro es nuevo). */
export async function addDraftItem(db: Queryable, extractionId: string, input: DraftItemInput): Promise<string> {
  const number = await nextItemNumber(db, extractionId);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, subproducto, descripcion, cant, unidad, dias,
                            observacion, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual') RETURNING id`,
    [
      extractionId,
      number,
      input.rubro,
      input.producto,
      input.subproducto,
      input.descripcion,
      input.cant,
      input.unidad,
      input.dias,
      input.observacion,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de ítem sin resultado');
  await normalizeOrder(db, extractionId);
  return id;
}

/**
 * Cambia un campo de una fila, si la versión coincide. Al cambiar el rubro, la fila pasa al
 * final de ese rubro (o crea un rubro nuevo al final de la matriz).
 */
export async function updateDraftItem(
  db: Queryable,
  itemId: string,
  expectedVersion: number,
  patch: Partial<DraftItemInput>,
): Promise<void> {
  const set = buildSet(patch, ITEM_COLUMNS, 3);
  if (set.values.length === 0) return;
  const { rows } = await db.query<{ extractionId: string }>(
    `UPDATE tdr_items SET ${set.sql} WHERE id = $1 AND version = $2 RETURNING extraction_id AS "extractionId"`,
    [itemId, expectedVersion, ...set.values],
  );
  const extractionId = rows[0]?.extractionId;
  if (!extractionId) throw new VersionConflictError('tdr_items', itemId);
  if (patch.rubro !== undefined) {
    const number = await nextItemNumber(db, extractionId);
    await db.query(`UPDATE tdr_items SET item_number = $2 WHERE id = $1`, [itemId, number]);
    await normalizeOrder(db, extractionId);
  }
}

/** Sube o baja una fila dentro de su rubro. No hace nada si ya está en el extremo. */
export async function moveDraftItem(db: Queryable, itemId: string, expectedVersion: number, direction: 'up' | 'down'): Promise<void> {
  const { rows } = await db.query<{ extractionId: string; itemNumber: number; rubro: string }>(
    `SELECT extraction_id AS "extractionId", item_number AS "itemNumber", rubro FROM tdr_items WHERE id = $1 AND version = $2`,
    [itemId, expectedVersion],
  );
  const item = rows[0];
  if (!item) throw new VersionConflictError('tdr_items', itemId);
  const { rows: neighbors } = await db.query<{ id: string; itemNumber: number }>(
    `SELECT id, item_number AS "itemNumber" FROM tdr_items
      WHERE extraction_id = $1 AND lower(btrim(rubro)) = lower(btrim($2))
        AND ${direction === 'up' ? 'item_number < $3' : 'item_number > $3'}
      ORDER BY item_number ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1`,
    [item.extractionId, item.rubro, item.itemNumber],
  );
  const neighbor = neighbors[0];
  if (!neighbor) return;
  // La unicidad de item_number es diferida: el intercambio se valida al confirmar la transacción.
  await db.query(`UPDATE tdr_items SET item_number = $2 WHERE id = $1`, [itemId, neighbor.itemNumber]);
  await db.query(`UPDATE tdr_items SET item_number = $2 WHERE id = $1`, [neighbor.id, item.itemNumber]);
}

/** Elimina una fila del borrador (y su responsable) y renumera las demás. */
export async function deleteDraftItem(db: Queryable, itemId: string, expectedVersion: number): Promise<void> {
  const { rows } = await db.query<{ extractionId: string }>(
    `SELECT extraction_id AS "extractionId" FROM tdr_items WHERE id = $1 AND version = $2`,
    [itemId, expectedVersion],
  );
  const extractionId = rows[0]?.extractionId;
  if (!extractionId) throw new VersionConflictError('tdr_items', itemId);
  await db.query(`DELETE FROM tdr_item_assignments WHERE tdr_item_id = $1`, [itemId]);
  await db.query(`DELETE FROM tdr_items WHERE id = $1`, [itemId]);
  await normalizeOrder(db, extractionId);
}

/**
 * Confirma la matriz (D-8): el intento pasa a `confirmed` y sus filas quedan inmutables (el
 * responsable se puede seguir cambiando). La base rechaza una matriz vacía o una segunda
 * matriz confirmada en el proyecto (migración 0010); aquí se comprueba antes para dar un
 * mensaje claro.
 */
export async function confirmMatrix(db: Queryable, extractionId: string, expectedVersion: number): Promise<void> {
  const draft = await getDraftExtraction(db, extractionId);
  if (!draft || draft.version !== expectedVersion) throw new VersionConflictError('tdr_extractions', extractionId);
  if (draft.status !== 'processed') throw new DraftRuleError('draft_not_editable');
  if (await projectHasConfirmedMatrix(db, draft.projectId)) throw new DraftRuleError('project_has_confirmed_matrix');
  const { rows } = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM tdr_items WHERE extraction_id = $1`, [extractionId]);
  if ((rows[0]?.count ?? 0) === 0) throw new DraftRuleError('draft_empty');
  const { rowCount } = await db.query(
    `UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1 AND version = $2 AND status = 'processed'`,
    [extractionId, expectedVersion],
  );
  if (rowCount !== 1) throw new VersionConflictError('tdr_extractions', extractionId);
}
