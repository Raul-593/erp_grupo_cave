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

/**
 * Resume una lista de códigos para mostrarla: los consecutivos de un mismo rubro se agrupan
 * como rango («2.1 – 2.3») y el resto se separa con comas. Espera los códigos en orden.
 */
export function compactCodes(codes: readonly string[]): string {
  const groups: { rubro: string; from: number; to: number }[] = [];
  for (const code of codes) {
    const [rubro = '', position = ''] = code.split('.');
    const number = Number(position);
    const last = groups.at(-1);
    if (last && last.rubro === rubro && number === last.to + 1) last.to = number;
    else groups.push({ rubro, from: number, to: number });
  }
  return groups
    .map((group) => (group.from === group.to ? `${group.rubro}.${group.from}` : `${group.rubro}.${group.from} – ${group.rubro}.${group.to}`))
    .join(', ');
}
