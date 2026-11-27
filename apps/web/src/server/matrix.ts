import {
  DEMO_PROVIDER,
  getConfirmedMatrix,
  getMatrixTotals,
  listMatrixItems,
  listProjectEvents,
  type ConfirmedMatrix,
  type MatrixItem,
  type MatrixTotals,
  type ProjectEvent,
} from '@erp/db';
import { scopeOf } from '@/domain/access/permissions';
import { ALL_EVENTS, pickEvent } from '@/lib/events';
import { matrixCodes } from '@/lib/numbering';
import type { SessionUser } from './auth';
import { db } from './db';

export { ALL_EVENTS };

/** Ítem de la matriz con su numeración de pantalla (1.1, 1.2…). */
export type MatrixRow = MatrixItem & { code: string };

export interface MatrixView {
  matrix: ConfirmedMatrix;
  items: MatrixRow[];
  /** id del ítem → código de pantalla. */
  codes: ReadonlyMap<string, string>;
  totals: MatrixTotals;
  /** Datos de demostración (AGENTS.md §2): se rotulan como tales en pantalla. */
  demo: boolean;
  /** Solo los ítems del responsable (empleado de campo): ítems e indicadores van filtrados. */
  scoped: boolean;
  /** Eventos del proyecto (vacío si no distingue eventos). */
  events: ProjectEvent[];
  /** Evento que se está viendo: ítems e indicadores son solo los suyos. null = todos. */
  event: ProjectEvent | null;
}

/**
 * Matriz confirmada vigente del proyecto, de la que cuelgan Planificación, Abastecimiento y
 * Ejecución. Devuelve null si el proyecto todavía no tiene una matriz confirmada.
 *
 * Con `user`, aplica su alcance: un empleado de campo recibe solo sus ítems y los indicadores
 * de esos ítems. La numeración (1.1, 2.3…) se calcula siempre sobre la matriz completa, para
 * que un ítem tenga el mismo código para todos.
 *
 * En un proyecto con eventos, `evento` (el valor de `?evento=`) elige cuál se muestra: sin
 * valor, el primero; `ALL_EVENTS`, todos a la vez.
 */
export async function loadMatrixView(projectId: string, user?: SessionUser, evento?: string | string[]): Promise<MatrixView | null> {
  const matrix = await getConfirmedMatrix(db(), projectId);
  if (!matrix) return null;
  const events = await listProjectEvents(db(), projectId);
  const scope = user ? scopeOf(user) : ({ kind: 'all' } as const);
  const workerId = scope.kind === 'worker' ? scope.workerId : null;
  const rows = await listMatrixItems(db(), matrix.extractionId);
  // Sin evento pedido, el empleado de campo empieza en el primer evento donde tiene ítems.
  const requested = Array.isArray(evento) ? evento[0] : evento;
  const own = workerId && !requested ? new Set(rows.filter((row) => row.workerId === workerId).map((row) => row.eventId)) : null;
  const event = pickEvent(own ? [...events.filter((candidate) => own.has(candidate.id)), ...events] : events, evento);
  const totals = await getMatrixTotals(db(), matrix.extractionId, { workerId, eventId: event?.id ?? null });
  const numbering = matrixCodes(rows);
  const all = rows.map((row, index) => ({ ...row, code: numbering[index] ?? String(row.itemNumber) }));
  const inEvent = event ? all.filter((item) => item.eventId === event.id) : all;
  const items = scope.kind === 'all' ? inEvent : inEvent.filter((item) => scope.kind === 'worker' && item.workerId === scope.workerId);
  return {
    matrix,
    items,
    codes: new Map(all.map((item) => [item.id, item.code])),
    totals,
    demo: matrix.provider === DEMO_PROVIDER,
    scoped: scope.kind !== 'all',
    events,
    event,
  };
}
