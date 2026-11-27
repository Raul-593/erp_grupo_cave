/**
 * Edición de lo que cuelga de un ítem de la matriz: responsable y planificación.
 * Cada operación comprueba que el dato no cambió desde que se leyó (VersionConflictError).
 */
import type { ContractStatus } from '../domain.ts';
import { getPgErrorCode, PgErrorCode } from '../errors.ts';
import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

/** Proyecto al que pertenece un ítem, o null si el ítem no existe. */
export async function getItemProjectId(db: Queryable, itemId: string): Promise<string | null> {
  const { rows } = await db.query<{ projectId: string | null }>(`SELECT tdr_item_project_id($1) AS "projectId"`, [itemId]);
  return rows[0]?.projectId ?? null;
}

/**
 * Asigna, cambia o quita (workerId = null) el responsable de un ítem. `expectedWorkerId` es el
 * responsable que el usuario veía: si ya no coincide, no se pisa el cambio de otra persona.
 * La base solo admite trabajadores activos (trigger de tdr_item_assignments).
 */
export async function setItemResponsible(
  db: Queryable,
  itemId: string,
  expectedWorkerId: string | null,
  workerId: string | null,
): Promise<void> {
  if (expectedWorkerId === workerId) return;
  if (expectedWorkerId === null) {
    try {
      await db.query(`INSERT INTO tdr_item_assignments (tdr_item_id, worker_id) VALUES ($1, $2)`, [itemId, workerId]);
    } catch (error) {
      // Otra persona asignó un responsable mientras tanto.
      if (getPgErrorCode(error) === PgErrorCode.uniqueViolation) throw new VersionConflictError('tdr_item_assignments', itemId);
      throw error;
    }
    return;
  }
  const { rowCount } =
    workerId === null
      ? await db.query(`DELETE FROM tdr_item_assignments WHERE tdr_item_id = $1 AND worker_id = $2`, [itemId, expectedWorkerId])
      : await db.query(`UPDATE tdr_item_assignments SET worker_id = $3 WHERE tdr_item_id = $1 AND worker_id = $2`, [
          itemId,
          expectedWorkerId,
          workerId,
        ]);
  if (rowCount !== 1) throw new VersionConflictError('tdr_item_assignments', itemId);
}

export interface ItemPlanInput {
  supplierId: string | null;
  /** Texto decimal exacto, o null si no hay costo asignado. */
  plannedCost: string | null;
  contractStatus: ContractStatus;
}

const PLAN_COLUMNS: Readonly<Record<keyof ItemPlanInput, string>> = {
  supplierId: 'supplier_id',
  plannedCost: 'planned_cost',
  contractStatus: 'contract_status',
};

/**
 * Guarda los campos indicados de la planificación de un ítem. `expectedVersion` es la versión
 * leída, o null si el ítem todavía no tenía planificación (se crea).
 */
export async function saveItemPlan(
  db: Queryable,
  itemId: string,
  expectedVersion: number | null,
  patch: Partial<ItemPlanInput>,
): Promise<void> {
  if (expectedVersion === null) {
    try {
      await db.query(
        `INSERT INTO item_plans (tdr_item_id, supplier_id, planned_cost, contract_status) VALUES ($1, $2, $3, $4)`,
        [itemId, patch.supplierId ?? null, patch.plannedCost ?? null, patch.contractStatus ?? 'pending'],
      );
    } catch (error) {
      if (getPgErrorCode(error) === PgErrorCode.uniqueViolation) throw new VersionConflictError('item_plans', itemId);
      throw error;
    }
    return;
  }
  // buildSet omite los campos ausentes; null sí se guarda (quitar proveedor o costo).
  const set = buildSet(patch, PLAN_COLUMNS, 3);
  if (set.values.length === 0) return;
  const { rowCount } = await db.query(`UPDATE item_plans SET ${set.sql} WHERE tdr_item_id = $1 AND version = $2`, [
    itemId,
    expectedVersion,
    ...set.values,
  ]);
  if (rowCount !== 1) throw new VersionConflictError('item_plans', itemId);
}
