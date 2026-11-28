import type { UserRole } from '../domain.ts';
import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

/** Usuario del sistema con los nombres de su trabajador o proveedor vinculado. */
export interface AppUser {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  workerId: string | null;
  workerName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  active: boolean;
  lastLoginAt: Date | null;
  /** Id del usuario en Supabase Auth; null en desarrollo local. */
  authSubject: string | null;
  version: number;
}

/** Campos editables. El correo se guarda en minúsculas (la base lo exige). */
export interface AppUserInput {
  fullName: string;
  email: string | null;
  role: UserRole;
  workerId: string | null;
  supplierId: string | null;
  active: boolean;
}

const EDITABLE_COLUMNS: Readonly<Record<keyof AppUserInput, string>> = {
  fullName: 'full_name',
  email: 'email',
  role: 'role',
  workerId: 'worker_id',
  supplierId: 'supplier_id',
  active: 'active',
};

const SELECT = `
  SELECT u.id, u.full_name AS "fullName", u.email, u.role, u.worker_id AS "workerId", w.full_name AS "workerName",
         u.supplier_id AS "supplierId", s.name AS "supplierName", u.active, u.last_login_at AS "lastLoginAt", u.auth_subject AS "authSubject", u.version
    FROM app_users u
    LEFT JOIN workers w ON w.id = u.worker_id
    LEFT JOIN suppliers s ON s.id = u.supplier_id`;

const normalizeEmail = (email: string | null | undefined) => (email == null ? email : email.trim().toLowerCase() || null);

export async function listUsers(db: Queryable, options: { onlyActive?: boolean } = {}): Promise<AppUser[]> {
  const where = options.onlyActive ? 'WHERE u.active' : '';
  const { rows } = await db.query<AppUser>(
    `${SELECT} ${where}
      ORDER BY u.active DESC, array_position(ARRAY['admin','accounting','field','supplier'], u.role), lower(u.full_name), u.id`,
  );
  return rows;
}

export async function getUser(db: Queryable, id: string): Promise<AppUser | null> {
  const { rows } = await db.query<AppUser>(`${SELECT} WHERE u.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createUser(db: Queryable, input: AppUserInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO app_users (full_name, email, role, worker_id, supplier_id, active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.fullName, normalizeEmail(input.email), input.role, input.workerId, input.supplierId, input.active],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de usuario sin resultado');
  return id;
}

export async function updateUser(
  db: Queryable,
  id: string,
  expectedVersion: number,
  patch: Partial<AppUserInput>,
): Promise<void> {
  const normalized = 'email' in patch ? { ...patch, email: normalizeEmail(patch.email) } : patch;
  const set = buildSet(normalized, EDITABLE_COLUMNS, 3);
  if (set.values.length === 0) return;
  const { rowCount } = await db.query(`UPDATE app_users SET ${set.sql} WHERE id = $1 AND version = $2`, [
    id,
    expectedVersion,
    ...set.values,
  ]);
  if (rowCount !== 1) throw new VersionConflictError('app_users', id);
}

/** Anota el último inicio de sesión (como todo UPDATE, sube la versión del usuario). */
export async function recordLogin(db: Queryable, id: string): Promise<void> {
  await db.query(`UPDATE app_users SET last_login_at = now() WHERE id = $1 AND active`, [id]);
}

/** Usuario vinculado a una identidad de Supabase Auth. */
export async function getUserByAuthSubject(db: Queryable, authSubject: string): Promise<AppUser | null> {
  const { rows } = await db.query<AppUser>(`${SELECT} WHERE u.auth_subject = $1`, [authSubject]);
  return rows[0] ?? null;
}

/** Vincula (o desvincula con null) la identidad de Supabase Auth de un usuario. */
export async function setUserAuthSubject(db: Queryable, id: string, authSubject: string | null): Promise<void> {
  const { rowCount } = await db.query(`UPDATE app_users SET auth_subject = $2 WHERE id = $1`, [id, authSubject]);
  if (rowCount !== 1) throw new VersionConflictError('app_users', id);
}
