import type { Queryable } from './shared.ts';

export interface Client {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  version: number;
}

export interface ClientInput {
  name: string;
  taxId: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

const COLUMNS = `id, name, tax_id AS "taxId", email, phone, notes, version`;

export async function listClients(db: Queryable): Promise<Client[]> {
  const { rows } = await db.query<Client>(`SELECT ${COLUMNS} FROM clients ORDER BY lower(name), id`);
  return rows;
}

export async function getClient(db: Queryable, id: string): Promise<Client | null> {
  const { rows } = await db.query<Client>(`SELECT ${COLUMNS} FROM clients WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createClient(db: Queryable, input: ClientInput): Promise<Client> {
  const { rows } = await db.query<Client>(
    `INSERT INTO clients (name, tax_id, email, phone, notes) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [input.name, input.taxId, input.email ?? null, input.phone ?? null, input.notes ?? null],
  );
  const client = rows[0];
  if (!client) throw new Error('INSERT de cliente sin resultado');
  return client;
}
