import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

/** Proyecto con su ficha. `date` y `numeric` llegan como texto exacto (ver client.ts). */
export interface Project {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  clientTaxId: string | null;
  companyId: string | null;
  companyName: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  processCode: string | null;
  purpose: string | null;
  contractAmount: string | null;
  currency: string | null;
  amountIncludesVat: boolean | null;
  venues: string[];
  termText: string | null;
  contractAdministrator: string | null;
  fichaExtractionId: string | null;
  documentCount: number;
  version: number;
  createdAt: Date;
}

/** Campos editables de un proyecto (alta y ficha). */
export interface ProjectInput {
  name: string;
  clientId: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  processCode: string | null;
  purpose: string | null;
  contractAmount: string | null;
  currency: string | null;
  amountIncludesVat: boolean | null;
  venues: string[];
  termText: string | null;
  contractAdministrator: string | null;
}

const EDITABLE_COLUMNS: Readonly<Record<keyof ProjectInput, string>> = {
  name: 'name',
  clientId: 'client_id',
  startDate: 'start_date',
  endDate: 'end_date',
  notes: 'notes',
  processCode: 'process_code',
  purpose: 'purpose',
  contractAmount: 'contract_amount',
  currency: 'currency',
  amountIncludesVat: 'amount_includes_vat',
  venues: 'venues',
  termText: 'term_text',
  contractAdministrator: 'contract_administrator',
};

const SELECT = `
  SELECT p.id, p.name, p.client_id AS "clientId", c.name AS "clientName", c.tax_id AS "clientTaxId",
         p.company_id AS "companyId", co.name AS "companyName", p.start_date AS "startDate", p.end_date AS "endDate", p.notes,
         p.process_code AS "processCode", p.purpose, p.contract_amount AS "contractAmount", p.currency,
         p.amount_includes_vat AS "amountIncludesVat", p.venues, p.term_text AS "termText",
         p.contract_administrator AS "contractAdministrator", p.ficha_extraction_id AS "fichaExtractionId",
         (SELECT count(*)::int FROM tdr_documents d WHERE d.project_id = p.id) AS "documentCount",
         p.version, p.created_at AS "createdAt"
    FROM projects p
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN companies co ON co.id = p.company_id`;

export async function listProjects(db: Queryable): Promise<Project[]> {
  const { rows } = await db.query<Project>(`${SELECT} ORDER BY p.created_at DESC, p.id`);
  return rows;
}

export async function getProject(db: Queryable, id: string): Promise<Project | null> {
  const { rows } = await db.query<Project>(`${SELECT} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createProject(db: Queryable, input: ProjectInput): Promise<string> {
  const keys = Object.keys(EDITABLE_COLUMNS) as (keyof ProjectInput)[];
  const columns = keys.map((key) => EDITABLE_COLUMNS[key]).join(', ');
  const params = keys.map((_, index) => `$${index + 1}`).join(', ');
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO projects (${columns}) VALUES (${params}) RETURNING id`,
    keys.map((key) => input[key]),
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de proyecto sin resultado');
  return id;
}

/**
 * Actualiza solo los campos presentes en `patch`, si la versión coincide. Con
 * `fichaExtractionId` registra además de qué intento se aplicó la ficha propuesta (etapa D).
 */
export async function updateProject(
  db: Queryable,
  id: string,
  expectedVersion: number,
  patch: Partial<ProjectInput>,
  options: { fichaExtractionId?: string } = {},
): Promise<void> {
  const set = buildSet(patch, EDITABLE_COLUMNS, 3);
  if (options.fichaExtractionId !== undefined) {
    set.values.push(options.fichaExtractionId);
    set.sql = [set.sql, `ficha_extraction_id = $${set.values.length + 2}`].filter(Boolean).join(', ');
  }
  if (set.values.length === 0) return;
  const { rowCount } = await db.query(`UPDATE projects SET ${set.sql} WHERE id = $1 AND version = $2`, [
    id,
    expectedVersion,
    ...set.values,
  ]);
  if (rowCount !== 1) throw new VersionConflictError('projects', id);
}
