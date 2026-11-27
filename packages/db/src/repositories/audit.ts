import type { Queryable } from './shared.ts';

/** Entrada del historial de cambios (migración 0009). Solo se agregan filas. */
export interface AuditEntry {
  userId: string;
  /** Formato modulo.accion, por ejemplo item_plan.update. */
  action: string;
  /** Tabla principal afectada. */
  entity: string;
  entityId: string | null;
  /** Valores enviados. Nunca contraseñas, claves ni contenido de archivos. */
  details?: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  occurredAt: Date;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
}

export async function recordAudit(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(`INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)`, [
    entry.userId,
    entry.action,
    entry.entity,
    entry.entityId,
    JSON.stringify(entry.details ?? {}),
  ]);
}

/** Últimos cambios de un registro, del más reciente al más antiguo. */
export async function listAuditForEntity(db: Queryable, entity: string, entityId: string, limit = 50): Promise<AuditRecord[]> {
  const { rows } = await db.query<AuditRecord>(
    `SELECT a.id, a.occurred_at AS "occurredAt", a.user_id AS "userId", u.full_name AS "userName", a.action, a.entity,
            a.entity_id AS "entityId", a.details
       FROM audit_log a JOIN app_users u ON u.id = a.user_id
      WHERE a.entity = $1 AND a.entity_id = $2
      ORDER BY a.occurred_at DESC, a.id
      LIMIT $3`,
    [entity, entityId, limit],
  );
  return rows;
}
