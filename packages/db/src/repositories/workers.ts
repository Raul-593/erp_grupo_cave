import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

export interface Worker {
  id: string;
  fullName: string;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  assignmentCount: number;
  version: number;
}

export interface WorkerInput {
  fullName: string;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
}

const EDITABLE_COLUMNS: Readonly<Record<keyof WorkerInput, string>> = {
  fullName: 'full_name',
  jobTitle: 'job_title',
  phone: 'phone',
  email: 'email',
  notes: 'notes',
  active: 'active',
};

const SELECT = `
  SELECT w.id, w.full_name AS "fullName", w.job_title AS "jobTitle", w.phone, w.email, w.notes, w.active,
         (SELECT count(*)::int FROM tdr_item_assignments a WHERE a.worker_id = w.id) AS "assignmentCount",
         w.version
    FROM workers w`;

export async function listWorkers(db: Queryable, options: { onlyActive?: boolean } = {}): Promise<Worker[]> {
  const where = options.onlyActive ? 'WHERE w.active' : '';
  const { rows } = await db.query<Worker>(`${SELECT} ${where} ORDER BY w.active DESC, lower(w.full_name), w.id`);
  return rows;
}

export async function getWorker(db: Queryable, id: string): Promise<Worker | null> {
  const { rows } = await db.query<Worker>(`${SELECT} WHERE w.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createWorker(db: Queryable, input: WorkerInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO workers (full_name, job_title, phone, email, notes, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.fullName, input.jobTitle, input.phone, input.email, input.notes, input.active],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de trabajador sin resultado');
  return id;
}

export async function updateWorker(
  db: Queryable,
  id: string,
  expectedVersion: number,
  patch: Partial<WorkerInput>,
): Promise<void> {
  const set = buildSet(patch, EDITABLE_COLUMNS, 3);
  if (set.values.length === 0) return;
  const { rowCount } = await db.query(`UPDATE workers SET ${set.sql} WHERE id = $1 AND version = $2`, [
    id,
    expectedVersion,
    ...set.values,
  ]);
  if (rowCount !== 1) throw new VersionConflictError('workers', id);
}
