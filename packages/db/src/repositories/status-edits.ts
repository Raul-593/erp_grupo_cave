/**
 * Edición de estados: actividades, montaje por ítem y checklist previo. Cada operación
 * comprueba la versión leída (VersionConflictError si el registro cambió o ya no existe).
 */
import type { ActivityStatus, CheckResult, MountStatus } from '../domain.ts';
import { getPgErrorCode, PgErrorCode } from '../errors.ts';
import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

export interface ActivityPatch {
  /** null = sin estado registrado. */
  status: ActivityStatus | null;
  /** null = sin responsable. La base rechaza un responsable en actividades de equipo completo. */
  workerId: string | null;
}

const ACTIVITY_COLUMNS: Readonly<Record<keyof ActivityPatch, string>> = { status: 'status', workerId: 'worker_id' };

export async function updateActivity(
  db: Queryable,
  id: string,
  expectedVersion: number,
  patch: Partial<ActivityPatch>,
): Promise<void> {
  const set = buildSet(patch, ACTIVITY_COLUMNS, 3);
  if (set.values.length === 0) return;
  const { rowCount } = await db.query(`UPDATE activities SET ${set.sql} WHERE id = $1 AND version = $2`, [
    id,
    expectedVersion,
    ...set.values,
  ]);
  if (rowCount !== 1) throw new VersionConflictError('activities', id);
}

/**
 * Estado de montaje de un ítem. `expectedVersion` es la versión leída, o null si el ítem
 * todavía no tenía registro de ejecución (se crea).
 */
export async function setItemMountStatus(
  db: Queryable,
  itemId: string,
  expectedVersion: number | null,
  status: MountStatus,
): Promise<void> {
  if (expectedVersion === null) {
    try {
      await db.query(`INSERT INTO item_execution (tdr_item_id, mount_status) VALUES ($1, $2)`, [itemId, status]);
    } catch (error) {
      if (getPgErrorCode(error) === PgErrorCode.uniqueViolation) throw new VersionConflictError('item_execution', itemId);
      throw error;
    }
    return;
  }
  const { rowCount } = await db.query(`UPDATE item_execution SET mount_status = $3 WHERE tdr_item_id = $1 AND version = $2`, [
    itemId,
    expectedVersion,
    status,
  ]);
  if (rowCount !== 1) throw new VersionConflictError('item_execution', itemId);
}

export async function setPreEventCheckResult(db: Queryable, id: string, expectedVersion: number, result: CheckResult): Promise<void> {
  const { rowCount } = await db.query(`UPDATE pre_event_checks SET result = $3 WHERE id = $1 AND version = $2`, [
    id,
    expectedVersion,
    result,
  ]);
  if (rowCount !== 1) throw new VersionConflictError('pre_event_checks', id);
}
