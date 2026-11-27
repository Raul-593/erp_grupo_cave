import {
  DEMO_PROVIDER,
  getConfirmedMatrix,
  getMatrixTotals,
  listMatrixItems,
  type ConfirmedMatrix,
  type MatrixItem,
  type MatrixTotals,
} from '@erp/db';
import { itemCodes } from '@/lib/numbering';
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
}

/**
 * Matriz confirmada vigente del proyecto, de la que cuelgan Planificación, Abastecimiento y
 * Ejecución. Devuelve null si el proyecto todavía no tiene una matriz confirmada.
 */
export async function loadMatrixView(projectId: string): Promise<MatrixView | null> {
  const matrix = await getConfirmedMatrix(db(), projectId);
  if (!matrix) return null;
  const [rows, totals] = await Promise.all([
    listMatrixItems(db(), matrix.extractionId),
    getMatrixTotals(db(), matrix.extractionId),
  ]);
  const numbering = itemCodes(rows);
  const items = rows.map((row, index) => ({ ...row, code: numbering[index] ?? String(row.itemNumber) }));
  return {
    matrix,
    items,
    codes: new Map(items.map((item) => [item.id, item.code])),
    totals,
    demo: matrix.provider === DEMO_PROVIDER,
  };
}
