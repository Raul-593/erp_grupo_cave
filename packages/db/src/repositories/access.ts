import type { Queryable } from './shared.ts';

/**
 * Consultas de alcance para los permisos de la aplicación. Un empleado de campo trabaja sobre
 * los ítems donde su trabajador es el responsable (tdr_item_assignments).
 */

/** ¿El trabajador es el responsable del ítem? */
export async function isItemAssignedTo(db: Queryable, itemId: string, workerId: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM tdr_item_assignments WHERE tdr_item_id = $1 AND worker_id = $2) AS ok`,
    [itemId, workerId],
  );
  return rows[0]?.ok ?? false;
}

/** Proyectos donde el trabajador es responsable de al menos un ítem. */
export async function listWorkerProjectIds(db: Queryable, workerId: string): Promise<string[]> {
  const { rows } = await db.query<{ projectId: string }>(
    `SELECT DISTINCT tdr_item_project_id(a.tdr_item_id) AS "projectId"
       FROM tdr_item_assignments a
      WHERE a.worker_id = $1`,
    [workerId],
  );
  return rows.map((row) => row.projectId);
}
