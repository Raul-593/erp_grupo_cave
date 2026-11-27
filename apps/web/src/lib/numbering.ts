/**
 * Numeración jerárquica de la matriz (AGENTS.md §8): rubro.ítem (1.1, 1.2, 2.1…), según el
 * orden de aparición de cada rubro. Es solo de presentación; no se guarda.
 */
export function itemCodes(rows: readonly { rubro: string }[]): string[] {
  const rubroIndex = new Map<string, number>();
  const counters = new Map<string, number>();
  return rows.map((row) => {
    const key = row.rubro.trim().toLocaleLowerCase('es');
    if (!rubroIndex.has(key)) rubroIndex.set(key, rubroIndex.size + 1);
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return `${rubroIndex.get(key)}.${next}`;
  });
}
