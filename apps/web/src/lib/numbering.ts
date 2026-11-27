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

/**
 * Numeración de una matriz repartida en eventos (migración 0011). Cada evento se numera por
 * separado. Si sus filas traen el número del ítem en el TDR, el código es «ítem TDR.posición»
 * (9.1, 9.2…), para que coincida con el documento; los productos sin número (solicitudes
 * adicionales) usan letras (A.1, A.2…). Sin eventos ni números de TDR equivale a `itemCodes`.
 */
export function matrixCodes(rows: readonly { rubro: string; eventId: string | null; tdrRef: string | null }[]): string[] {
  const codes = new Array<string>(rows.length);
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = row.eventId ?? '';
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  for (const indexes of groups.values()) {
    const group = indexes.map((index) => rows[index]!);
    if (!group.some((row) => row.tdrRef)) {
      itemCodes(group).forEach((code, position) => (codes[indexes[position]!] = code));
      continue;
    }
    const letters = new Map<string, string>();
    const counters = new Map<string, number>();
    group.forEach((row, position) => {
      const rubro = row.rubro.trim().toLocaleLowerCase('es');
      let prefix = row.tdrRef?.trim();
      if (!prefix) {
        if (!letters.has(rubro)) letters.set(rubro, String.fromCharCode(65 + (letters.size % 26)));
        prefix = letters.get(rubro)!;
      }
      const counterKey = `${prefix}|${rubro}`;
      const next = (counters.get(counterKey) ?? 0) + 1;
      counters.set(counterKey, next);
      codes[indexes[position]!] = `${prefix}.${next}`;
    });
  }
  return codes;
}
