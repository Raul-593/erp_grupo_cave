import {
  DEMO_PROVIDER,
  getConfirmedMatrix,
  getMatrixTotals,
  listMatrixItems,
  type ConfirmedMatrix,
  type MatrixItem,
  type MatrixTotals,
} from '@erp/db';
import { scopeOf } from '@/domain/access/permissions';
import { itemCodes } from '@/lib/numbering';
import type { SessionUser } from './auth';
import { db } from './db';

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
}

/**
 * Matriz confirmada vigente del proyecto, de la que cuelgan Planificación, Abastecimiento y
 * Ejecución. Devuelve null si el proyecto todavía no tiene una matriz confirmada.
 *
 * Con `user`, aplica su alcance: un empleado de campo recibe solo sus ítems y los indicadores
 * de esos ítems. La numeración (1.1, 2.3…) se calcula siempre sobre la matriz completa, para
 * que un ítem tenga el mismo código para todos.
 */
export async function loadMatrixView(projectId: string, user?: SessionUser): Promise<MatrixView | null> {
  const matrix = await getConfirmedMatrix(db(), projectId);
  if (!matrix) return null;
  const scope = user ? scopeOf(user) : ({ kind: 'all' } as const);
  const workerId = scope.kind === 'worker' ? scope.workerId : null;
  const [rows, totals] = await Promise.all([
    listMatrixItems(db(), matrix.extractionId),
    getMatrixTotals(db(), matrix.extractionId, { workerId }),
  ]);
  const numbering = itemCodes(rows);
  const all = rows.map((row, index) => ({ ...row, code: numbering[index] ?? String(row.itemNumber) }));
  const items = scope.kind === 'all' ? all : all.filter((item) => scope.kind === 'worker' && item.workerId === scope.workerId);
  return {
    matrix,
    items,
    codes: new Map(all.map((item) => [item.id, item.code])),
    totals,
    demo: matrix.provider === DEMO_PROVIDER,
    scoped: scope.kind !== 'all',
  };
}
