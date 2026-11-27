/**
 * Aritmética exacta de importes que llegan de PostgreSQL como texto decimal (`numeric(14,2)`).
 * Se opera en centavos con BigInt: nunca en coma flotante (AGENTS.md §7).
 */
const AMOUNT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

function toCents(amount: string): bigint {
  const match = AMOUNT.exec(amount.trim());
  if (!match) throw new Error(`Importe no válido: ${amount}`);
  const cents = BigInt(match[2] ?? '0') * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  return match[1] === '-' ? -cents : cents;
}

function fromCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** Suma de importes; los nulos se ignoran. Devuelve texto con dos decimales. */
export function sumAmounts(amounts: readonly (string | null)[]): string {
  return fromCents(amounts.reduce((total, amount) => (amount === null ? total : total + toCents(amount)), 0n));
}

/** Negativo, cero o positivo según `a` sea menor, igual o mayor que `b`. */
export function compareAmounts(a: string, b: string): number {
  const diff = toCents(a) - toCents(b);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/** Porcentaje entero de `part` sobre `total` (solo para mostrar); null si el total es cero. */
export function percentOf(part: string, total: string): number | null {
  const base = toCents(total);
  if (base === 0n) return null;
  return Number((toCents(part) * 1000n) / base) / 10;
}
