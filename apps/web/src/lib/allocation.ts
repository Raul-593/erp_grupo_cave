/**
 * Reparto de un pago entre los ítems de su orden (PLAN.md, «reparto de pagos», decisión R-5).
 * Función pura: la usan el formulario de pago y la conversión de los datos anteriores.
 */
import { compareAmounts, subtractAmounts } from './money.ts';

export interface AllocationLine {
  itemId: string;
  /** Saldo del ítem: su costo en la orden menos lo que ya le repartieron otros pagos. */
  balance: string;
}

export interface ProposedAllocation {
  itemId: string;
  amount: string;
}

/**
 * Propone el reparto de `amount`: recorre los ítems en el orden recibido (el de la matriz) y
 * asigna a cada uno hasta su saldo, hasta agotar el monto. Lo que no cabe queda sin repartir.
 * Importes en texto decimal exacto; nunca se pasa por coma flotante.
 */
export function proposeAllocation(amount: string, lines: readonly AllocationLine[]): ProposedAllocation[] {
  const proposal: ProposedAllocation[] = [];
  let remaining = subtractAmounts(amount, '0');
  for (const line of lines) {
    if (compareAmounts(remaining, '0') <= 0) break;
    if (compareAmounts(line.balance, '0') <= 0) continue;
    const part = compareAmounts(line.balance, remaining) < 0 ? subtractAmounts(line.balance, '0') : remaining;
    proposal.push({ itemId: line.itemId, amount: part });
    remaining = subtractAmounts(remaining, part);
  }
  return proposal;
}
