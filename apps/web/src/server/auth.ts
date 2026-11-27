/**
 * Sesión y autorización en el servidor (PLAN.md, parte U). Toda acción de servidor y toda ruta
 * de API llama a `authorize` (o `authorizeRequest`) antes de leer o cambiar datos; las páginas
 * llaman a `requirePageUser`. Ocultar un botón en pantalla nunca sustituye a esta comprobación.
 */
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getUser, isItemAssignedTo, listWorkerProjectIds, recordAudit, type Queryable, type UserRole } from '@erp/db';
import { can, homePath, scopeOf, type Permission } from '@/domain/access/permissions';
import { authProvider } from '@/integrations/auth/config';
import { AuthConfigError } from '@/integrations/auth/types';
import { db } from './db';

export interface SessionUser {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  workerId: string | null;
  supplierId: string | null;
}

export const NO_SESSION = 'Tu sesión terminó o no has entrado. Vuelve a entrar.';
export const FORBIDDEN = 'No tienes permiso para esta acción.';

/** Usuario activo de la petición actual (una sola consulta por petición), o null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  let userId: string | null;
  try {
    userId = await (await authProvider()).currentUserId();
  } catch (error) {
    if (error instanceof AuthConfigError) return null;
    throw error;
  }
  if (!userId) return null;
  const user = await getUser(db(), userId);
  if (!user || !user.active) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    workerId: user.workerId,
    supplierId: user.supplierId,
  };
});

/**
 * Para páginas: sin sesión lleva a «Entrar»; sin el permiso, a la página de inicio del rol.
 */
export async function requirePageUser(...permissions: Permission[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');
  if (permissions.some((permission) => !can(user.role, permission))) redirect(homePath(user.role));
  return user;
}

/** Destino que se puede pedir a `authorize`: un ítem o un proyecto, para comprobar el alcance. */
export interface AccessTarget {
  itemId?: string;
  projectId?: string;
}

export type Authorized = { ok: true; user: SessionUser } | { ok: false; message: string; status: 401 | 403 };

/** ¿El ítem o el proyecto están dentro del alcance del usuario? */
export async function inScope(user: SessionUser, target: AccessTarget): Promise<boolean> {
  const scope = scopeOf(user);
  if (scope.kind === 'all') return true;
  if (scope.kind === 'none') return false;
  if (target.itemId && !(await isItemAssignedTo(db(), target.itemId, scope.workerId))) return false;
  if (target.projectId && !(await listWorkerProjectIds(db(), scope.workerId)).includes(target.projectId)) return false;
  return true;
}

/**
 * Comprueba sesión, permiso y alcance. Para acciones de servidor y rutas de API: nunca lanza
 * por falta de permiso, devuelve el mensaje para el usuario.
 */
export async function authorize(permission: Permission, target: AccessTarget = {}): Promise<Authorized> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: NO_SESSION, status: 401 };
  if (!can(user.role, permission) || !(await inScope(user, target))) return { ok: false, message: FORBIDDEN, status: 403 };
  return { ok: true, user };
}

/** Proyectos visibles: null significa todos. */
export async function visibleProjectIds(user: SessionUser): Promise<ReadonlySet<string> | null> {
  const scope = scopeOf(user);
  if (scope.kind === 'all') return null;
  if (scope.kind === 'none') return new Set();
  return new Set(await listWorkerProjectIds(db(), scope.workerId));
}

/** Filtra filas que tienen responsable según el alcance del usuario. */
export function filterByScope<T extends { workerId: string | null }>(user: SessionUser, rows: readonly T[]): T[] {
  const scope = scopeOf(user);
  if (scope.kind === 'all') return [...rows];
  if (scope.kind === 'none') return [];
  return rows.filter((row) => row.workerId === scope.workerId);
}

/**
 * Registra el cambio en el historial (audit_log). Se llama dentro de la misma transacción que
 * el cambio, para que no quede uno sin el otro.
 */
export async function audit(
  tx: Queryable,
  user: SessionUser,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await recordAudit(tx, { userId: user.id, action, entity, entityId, details });
}
