/**
 * Conversión de lo pagado escrito a mano antes de la migración 0008 (PLAN.md, «reparto de
 * pagos», decisión R-1): pone lo pagado en cero y reparte cada pago que todavía no tiene reparto
 * entre los ítems de su orden, en el orden de la matriz y hasta el saldo de cada uno (R-5).
 * No es una migración y nunca toca erp_test.
 *
 *   pnpm db:convert:paid            simula: muestra el antes y el después; no escribe
 *   pnpm db:convert:paid --apply    ejecuta la conversión en una sola transacción
 *
 * Es idempotente: solo actúa en los proyectos que aún tienen ítems con lo pagado escrito a mano.
 * No crea pagos ni modifica los existentes; lo que un pago no alcanza a repartir queda
 * «sin repartir».
 */
import { parseArgs } from 'node:util';
import {
  allocateExistingPayment,
  createPool,
  getConfirmedMatrix,
  listManualPaidLines,
  listMatrixItems,
  listOrderLines,
  listPayments,
  loadDbConfig,
  resetManualPaidAmounts,
  summarizeConnection,
  withTransaction,
  type Queryable,
} from '@erp/db';
import { proposeAllocation, type ProposedAllocation } from '../src/lib/allocation.ts';
import { compareAmounts, subtractAmounts, sumAmounts } from '../src/lib/money.ts';
import { itemCodes } from '../src/lib/numbering.ts';

interface ItemState {
  itemId: string;
  label: string;
  orderId: string;
  orderCode: string;
  amount: string;
  before: string;
  after: string;
}

interface PaymentPlan {
  paymentId: string;
  summary: string;
  amount: string;
  allocations: ProposedAllocation[];
}

interface ProjectPlan {
  items: ItemState[];
  payments: PaymentPlan[];
  /** Pagos que ya tenían reparto: no se tocan. */
  untouched: number;
  paymentsTotal: string;
  unallocatedAfter: string;
}

const status = (paid: string, amount: string) =>
  compareAmounts(paid, '0') === 0 ? 'sin pagar' : compareAmounts(paid, amount) < 0 ? 'parcial' : 'pagado';

const money = (amount: string) => {
  const [int = '0', frac = '00'] = amount.split('.');
  return `$${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac.padEnd(2, '0')}`;
};

/** Calcula la conversión de un proyecto sin escribir nada; null si no hay nada que convertir. */
async function planProject(db: Queryable, projectId: string): Promise<ProjectPlan | null> {
  const manual = await listManualPaidLines(db, projectId);
  if (manual.length === 0) return null;

  // En serie: dentro de una transacción todas las consultas van por la misma conexión.
  const lines = await listOrderLines(db, projectId);
  const payments = await listPayments(db, projectId);
  const matrix = await getConfirmedMatrix(db, projectId);
  const matrixItems = matrix ? await listMatrixItems(db, matrix.extractionId) : [];
  const codes = itemCodes(matrixItems);
  const codeOf = new Map(matrixItems.map((item, index) => [item.id, codes[index] ?? String(item.itemNumber)]));
  const orderCodeOf = new Map(payments.map((payment) => [payment.orderId, payment.orderCode]));
  for (const item of matrixItems) if (item.orderId && item.orderCode) orderCodeOf.set(item.orderId, item.orderCode);
  const allocatedOf = new Map(manual.map((line) => [line.itemId, line.allocatedAmount]));

  // Estado de partida tras poner lo escrito a mano en lo que respaldan los repartos existentes.
  const items: ItemState[] = lines.map((line) => ({
    itemId: line.itemId,
    label: `${codeOf.get(line.itemId) ?? line.itemNumber} ${line.producto}`,
    orderId: line.orderId,
    orderCode: orderCodeOf.get(line.orderId) ?? '—',
    amount: line.amount,
    before: line.paidAmount,
    after: allocatedOf.get(line.itemId) ?? line.paidAmount,
  }));

  const plans: PaymentPlan[] = [];
  let untouched = 0;
  for (const payment of payments) {
    if (compareAmounts(payment.allocatedAmount, '0') !== 0) {
      untouched += 1;
      continue;
    }
    const orderItems = items.filter((item) => item.orderId === payment.orderId);
    const allocations = proposeAllocation(
      payment.amount,
      orderItems.map((item) => ({ itemId: item.itemId, balance: subtractAmounts(item.amount, item.after) })),
    );
    for (const allocation of allocations) {
      const item = orderItems.find((candidate) => candidate.itemId === allocation.itemId);
      if (item) item.after = sumAmounts([item.after, allocation.amount]);
    }
    plans.push({
      paymentId: payment.id,
      summary: `${payment.paidOn}  ${payment.orderCode.padEnd(9)} ${payment.concept}`,
      amount: payment.amount,
      allocations,
    });
  }

  const paymentsTotal = sumAmounts(payments.map((payment) => payment.amount));
  return {
    items,
    payments: plans,
    untouched,
    paymentsTotal,
    unallocatedAfter: subtractAmounts(paymentsTotal, sumAmounts(items.map((item) => item.after))),
  };
}

function printPlan(name: string, plan: ProjectPlan): void {
  const labelOf = new Map(plan.items.map((item) => [item.itemId, item.label]));
  console.log(`\nProyecto «${name}»`);
  console.log('\n  Lo pagado por ítem');
  console.log(`  ${'Ítem'.padEnd(36)} ${'Orden'.padEnd(9)} ${'Costo'.padStart(12)} ${'Antes'.padStart(12)} ${'Después'.padStart(12)}  Estado`);
  for (const item of plan.items) {
    const before = status(item.before, item.amount);
    const after = status(item.after, item.amount);
    const changed = compareAmounts(item.before, item.after) !== 0;
    console.log(
      `  ${item.label.slice(0, 36).padEnd(36)} ${item.orderCode.padEnd(9)} ${money(item.amount).padStart(12)} ` +
        `${money(item.before).padStart(12)} ${money(item.after).padStart(12)}  ${before === after ? after : `${before} → ${after}`}${changed ? '  *' : ''}`,
    );
  }
  console.log('\n  Reparto propuesto de cada pago');
  for (const payment of plan.payments) {
    const allocated = sumAmounts(payment.allocations.map((allocation) => allocation.amount));
    const rest = subtractAmounts(payment.amount, allocated);
    console.log(`  ${payment.summary}  ${money(payment.amount)}${compareAmounts(rest, '0') > 0 ? `  (sin repartir ${money(rest)})` : ''}`);
    for (const allocation of payment.allocations) {
      console.log(`      → ${(labelOf.get(allocation.itemId) ?? allocation.itemId).slice(0, 40).padEnd(40)} ${money(allocation.amount).padStart(12)}`);
    }
    if (payment.allocations.length === 0) console.log('      → ningún ítem de su orden tiene saldo: queda sin repartir');
  }
  if (plan.untouched > 0) console.log(`  (${plan.untouched} pago(s) ya tenían reparto y no se tocan)`);

  const before = sumAmounts(plan.items.map((item) => item.before));
  const after = sumAmounts(plan.items.map((item) => item.after));
  console.log('\n  Totales');
  console.log(`    Pagado por ítem, antes:    ${money(before).padStart(12)}`);
  console.log(`    Pagado por ítem, después:  ${money(after).padStart(12)}`);
  console.log(`    Total de pagos:            ${money(plan.paymentsTotal).padStart(12)}`);
  console.log(`    Pagos sin repartir:        ${money(plan.unallocatedAfter).padStart(12)}`);
  console.log(`    Comprobación: pagos = pagado + sin repartir → ${compareAmounts(plan.paymentsTotal, sumAmounts([after, plan.unallocatedAfter])) === 0 ? 'sí' : 'NO'}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
  const config = loadDbConfig('dev');
  const { host, port, database, user } = summarizeConnection(config.connectionString);
  console.log(`Base "${database}" en ${host}:${port}, usuario "${user}", esquema "${config.schema}".`);
  console.log(values.apply ? 'Modo: EJECUCIÓN (--apply).' : 'Modo: simulación; no se escribe nada. Para ejecutar: --apply.');

  const pool = createPool(config, { max: 2 });
  try {
    const projects = await pool.query<{ id: string; name: string }>(
      `SELECT p.id, p.name FROM projects p
        WHERE EXISTS (SELECT 1 FROM purchase_orders o WHERE o.project_id = p.id)
        ORDER BY p.created_at, p.id`,
    );
    let converted = 0;
    for (const project of projects.rows) {
      if (!values.apply) {
        const plan = await planProject(pool, project.id);
        if (plan) {
          printPlan(project.name, plan);
          converted += 1;
        }
        continue;
      }
      const done = await withTransaction(pool, async (tx) => {
        // El plan se calcula dentro de la transacción, con el proyecto bloqueado.
        await tx.query(`SELECT id FROM projects WHERE id = $1 FOR UPDATE`, [project.id]);
        const plan = await planProject(tx, project.id);
        if (!plan) return false;
        printPlan(project.name, plan);
        const reset = await resetManualPaidAmounts(tx, project.id);
        for (const payment of plan.payments) {
          if (payment.allocations.length > 0) await allocateExistingPayment(tx, payment.paymentId, payment.allocations);
        }
        // Lo guardado debe coincidir con lo calculado; si no, se revierte todo.
        const saved = new Map((await listOrderLines(tx, project.id)).map((line) => [line.itemId, line.paidAmount]));
        for (const item of plan.items) {
          if (compareAmounts(saved.get(item.itemId) ?? '-1', item.after) !== 0) {
            throw new Error(`El ítem ${item.label} quedó con ${saved.get(item.itemId)} y se esperaba ${item.after}. No se guardó nada.`);
          }
        }
        if ((await listManualPaidLines(tx, project.id)).length > 0) throw new Error('Quedan ítems con lo pagado sin respaldo. No se guardó nada.');
        console.log(`\n  Hecho: ${reset} ítem(s) recalculados y ${plan.payments.filter((p) => p.allocations.length > 0).length} pago(s) repartidos.`);
        return true;
      });
      if (done) converted += 1;
    }
    if (converted === 0) console.log('\nNada que convertir: ningún ítem tiene lo pagado escrito a mano.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nError en la conversión: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
