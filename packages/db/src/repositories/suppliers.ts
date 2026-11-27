import type { SupplierKind } from '../domain.ts';
import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

export interface Supplier {
  id: string;
  name: string;
  kind: SupplierKind;
  taxId: string | null;
  notes: string | null;
  active: boolean;
  /** Ítems planificados y solicitudes de cotización que lo usan. */
  usageCount: number;
  version: number;
}

export interface SupplierInput {
  name: string;
  kind: SupplierKind;
  taxId: string | null;
  notes: string | null;
  active: boolean;
}

const EDITABLE_COLUMNS: Readonly<Record<keyof SupplierInput, string>> = {
  name: 'name',
  kind: 'kind',
  taxId: 'tax_id',
  notes: 'notes',
  active: 'active',
};

const SELECT = `
  SELECT s.id, s.name, s.kind, s.tax_id AS "taxId", s.notes, s.active,
         ((SELECT count(*) FROM item_plans p WHERE p.supplier_id = s.id)
          + (SELECT count(*) FROM quote_requests q WHERE q.supplier_id = s.id))::int AS "usageCount",
         s.version
    FROM suppliers s`;

export async function listSuppliers(db: Queryable, options: { onlyActive?: boolean } = {}): Promise<Supplier[]> {
  const where = options.onlyActive ? 'WHERE s.active' : '';
  const { rows } = await db.query<Supplier>(`${SELECT} ${where} ORDER BY s.active DESC, lower(s.name), s.id`);
  return rows;
}

export async function getSupplier(db: Queryable, id: string): Promise<Supplier | null> {
  const { rows } = await db.query<Supplier>(`${SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createSupplier(db: Queryable, input: SupplierInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO suppliers (name, kind, tax_id, notes, active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.name, input.kind, input.taxId, input.notes, input.active],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de proveedor sin resultado');
  return id;
}

export async function updateSupplier(
  db: Queryable,
  id: string,
  expectedVersion: number,
  patch: Partial<SupplierInput>,
): Promise<void> {
  const set = buildSet(patch, EDITABLE_COLUMNS, 3);
  if (set.values.length === 0) return;
  const { rowCount } = await db.query(`UPDATE suppliers SET ${set.sql} WHERE id = $1 AND version = $2`, [
    id,
    expectedVersion,
    ...set.values,
  ]);
  if (rowCount !== 1) throw new VersionConflictError('suppliers', id);
}
