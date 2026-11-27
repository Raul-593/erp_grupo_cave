/**
 * Utilidades puras del borrador de la matriz (etapa D). Sin dependencias de servidor.
 */

export const DRAFT_FIELDS = ['rubro', 'producto', 'subproducto', 'descripcion', 'cant', 'unidad', 'dias', 'observacion'] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

/** Valores de una fila tal como los guarda la base (`numeric` como texto exacto). */
export type DraftValues = Record<DraftField, string | null>;

/** Ítem de la propuesta de la IA (contrato `tdr-v1`). */
export interface ProposalValues {
  rubro: string;
  producto: string;
  subproducto: string | null;
  descripcion: string;
  cant: number | null;
  unidad: string | null;
  dias: number | null;
  observacion: string | null;
}

const text = (value: string | null | undefined) => (value ?? '').trim();

/**
 * Campos de la fila que siguen tal como los propuso la IA (D-5): se muestran en violeta hasta
 * confirmar. Una fila manual, o sin propuesta, no tiene ninguno.
 */
export function unchangedFromProposal(row: DraftValues, proposal: ProposalValues | undefined): Set<DraftField> {
  const result = new Set<DraftField>();
  if (!proposal) return result;
  for (const field of DRAFT_FIELDS) {
    const current = row[field];
    const proposed = proposal[field];
    const same =
      typeof proposed === 'number' || (proposed === null && (field === 'cant' || field === 'dias'))
        ? (current === null && proposed === null) || (current !== null && proposed !== null && Number(current) === proposed)
        : text(current) === text(proposed as string | null);
    if (same) result.add(field);
  }
  return result;
}

/**
 * Rubros en el orden en que aparecen y sus filas, para mostrar la matriz agrupada. La clave
 * ignora mayúsculas y espacios, igual que la numeración (`lib/numbering.ts`).
 */
export function groupByRubro<T extends { rubro: string }>(rows: readonly T[]): { rubro: string; rows: T[] }[] {
  const groups = new Map<string, { rubro: string; rows: T[] }>();
  for (const row of rows) {
    const key = row.rubro.trim().toLocaleLowerCase('es');
    const group = groups.get(key) ?? { rubro: row.rubro.trim(), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}
