/**
 * Eventos de un proyecto (migración 0011): ceremonias o sedes entre las que se reparten los
 * ítems de la matriz.
 */
import type { Queryable } from './shared.ts';

export interface ProjectEvent {
  id: string;
  name: string;
  /** Fechas y jornadas tal como las expresa el documento de origen. */
  scheduleText: string | null;
  sortOrder: number;
}

export interface ProjectEventInput {
  projectId: string;
  name: string;
  scheduleText: string | null;
  sortOrder: number;
}

export async function listProjectEvents(db: Queryable, projectId: string): Promise<ProjectEvent[]> {
  const { rows } = await db.query<ProjectEvent>(
    `SELECT id, name, schedule_text AS "scheduleText", sort_order AS "sortOrder"
       FROM project_events
      WHERE project_id = $1
      ORDER BY sort_order, lower(name), id`,
    [projectId],
  );
  return rows;
}

export async function createProjectEvent(db: Queryable, input: ProjectEventInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO project_events (project_id, name, schedule_text, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.projectId, input.name, input.scheduleText, input.sortOrder],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de evento sin resultado');
  return id;
}
