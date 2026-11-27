/**
 * Edición de órdenes de compra y pagos (modelo provisional hasta la Fase 6). Lo pagado de cada
 * ítem no se escribe: es la suma de lo que los pagos le reparten (`payment_allocations`,
 * migración 0008) y lo mantiene la base con un trigger.
 */
import type { PaymentMethod, PaymentSupport } from '../domain.ts';
import { getPgErrorCode, PgErrorCode } from '../errors.ts';
import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

/** Regla de negocio incumplida; `rule` identifica el mensaje para el usuario. */
export class BusinessRuleError extends Error {
  override name = 'BusinessRuleError';
  readonly rule:
    | 'paid_exceeds_amount'
    | 'line_has_payments'
    | 'allocation_exceeds_balance'
    | 'allocation_exceeds_payment'
    | 'allocation_other_order'
    | 'payment_has_allocations';
  /** Ítem al que se refiere la regla, cuando aplica. */
  readonly itemId: string | null;
  constructor(rule: BusinessRuleError['rule'], itemId: string | null = null) {
    super(rule);
    this.rule = rule;
    this.itemId = itemId;
  }
}

export interface PurchaseOrder {
  id: string;
  code: string;
  lineCount: number;
  paymentCount: number;
}

export async function listPurchaseOrders(db: Queryable, projectId: string): Promise<PurchaseOrder[]> {
  const { rows } = await db.query<PurchaseOrder>(
    `SELECT o.id, o.code,
            (SELECT count(*)::int FROM purchase_order_lines l WHERE l.purchase_order_id = o.id) AS "lineCount",
            (SELECT count(*)::int FROM payments p WHERE p.purchase_order_id = o.id) AS "paymentCount"
       FROM purchase_orders o
      WHERE o.project_id = $1
      ORDER BY o.code, o.id`,
    [projectId],
  );
  return rows;
}

/** Proyecto de una orden, o null si no existe. */
export async function getPurchaseOrderProjectId(db: Queryable, orderId: string): Promise<string | null> {
  const { rows } = await db.query<{ projectId: string }>(`SELECT project_id AS "projectId" FROM purchase_orders WHERE id = $1`, [orderId]);
  return rows[0]?.projectId ?? null;
}

export async function createPurchaseOrder(db: Queryable, projectId: string, code: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`INSERT INTO purchase_orders (project_id, code) VALUES ($1, $2) RETURNING id`, [
    projectId,
    code,
  ]);
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de orden sin resultado');
  return id;
}

/** Ítem dentro de una orden, con lo que ya tiene pagado. `numeric` llega como texto exacto. */
export interface OrderLine {
  orderId: string;
  itemId: string;
  itemNumber: number;
  producto: string;
  /** Costo del ítem en la orden. */
  amount: string;
  /** Suma de lo que los pagos le han repartido. */
  paidAmount: string;
}

/** Ítems de las órdenes del proyecto, en el orden de la matriz (para repartir un pago). */
export async function listOrderLines(db: Queryable, projectId: string): Promise<OrderLine[]> {
  const { rows } = await db.query<OrderLine>(
    `SELECT l.purchase_order_id AS "orderId", i.id AS "itemId", i.item_number AS "itemNumber", i.producto,
            l.amount, l.paid_amount AS "paidAmount"
       FROM purchase_order_lines l
       JOIN purchase_orders o ON o.id = l.purchase_order_id
       JOIN tdr_items i ON i.id = l.tdr_item_id
      WHERE o.project_id = $1
      ORDER BY i.item_number, i.id`,
    [projectId],
  );
  return rows;
}

/** La línea existe con esa versión (el fallo fue por una regla) o no (conflicto de versión). */
async function lineMatches(db: Queryable, itemId: string, version: number): Promise<boolean> {
  const { rowCount } = await db.query(`SELECT 1 FROM purchase_order_lines WHERE tdr_item_id = $1 AND version = $2`, [itemId, version]);
  return rowCount === 1;
}

/**
 * Pone un ítem en una orden, lo cambia de orden o lo quita (orderId = null).
 * - Sin línea previa (`expectedVersion` null): se crea con el costo asignado del ítem como monto.
 * - Cambiarlo de orden o quitarlo solo se permite si el ítem no tiene nada pagado: antes hay
 *   que quitar el reparto de sus pagos.
 * La base exige que la orden y el ítem sean del mismo proyecto.
 */
export async function setItemOrder(db: Queryable, itemId: string, expectedVersion: number | null, orderId: string | null): Promise<void> {
  if (expectedVersion === null) {
    if (orderId === null) return;
    try {
      await db.query(
        `INSERT INTO purchase_order_lines (purchase_order_id, tdr_item_id, amount)
         VALUES ($1, $2, COALESCE((SELECT planned_cost FROM item_plans WHERE tdr_item_id = $2), 0))`,
        [orderId, itemId],
      );
    } catch (error) {
      if (getPgErrorCode(error) === PgErrorCode.uniqueViolation) throw new VersionConflictError('purchase_order_lines', itemId);
      throw error;
    }
    return;
  }
  const { rowCount } =
    orderId === null
      ? await db.query(`DELETE FROM purchase_order_lines WHERE tdr_item_id = $1 AND version = $2 AND paid_amount = 0`, [
          itemId,
          expectedVersion,
        ])
      : await db.query(
          `UPDATE purchase_order_lines SET purchase_order_id = $3
            WHERE tdr_item_id = $1 AND version = $2 AND (paid_amount = 0 OR purchase_order_id = $3)`,
          [itemId, expectedVersion, orderId],
        );
  if (rowCount === 1) return;
  if (await lineMatches(db, itemId, expectedVersion)) throw new BusinessRuleError('line_has_payments', itemId);
  throw new VersionConflictError('purchase_order_lines', itemId);
}

export interface OrderLinePatch {
  /** Monto comprometido del ítem en la orden (texto decimal exacto); no puede quedar por debajo de lo pagado. */
  amount: string;
  paymentWorkerId: string | null;
}

const LINE_COLUMNS: Readonly<Record<keyof OrderLinePatch, string>> = {
  amount: 'amount',
  paymentWorkerId: 'payment_worker_id',
};

export async function updateOrderLine(
  db: Queryable,
  itemId: string,
  expectedVersion: number,
  patch: Partial<OrderLinePatch>,
): Promise<void> {
  const set = buildSet(patch, LINE_COLUMNS, 4);
  if (set.values.length === 0) return;
  const { rowCount } = await db.query(
    `UPDATE purchase_order_lines SET ${set.sql}
      WHERE tdr_item_id = $1 AND version = $2
        AND paid_amount <= COALESCE($3::numeric, amount)`,
    [itemId, expectedVersion, patch.amount ?? null, ...set.values],
  );
  if (rowCount === 1) return;
  if (await lineMatches(db, itemId, expectedVersion)) throw new BusinessRuleError('paid_exceeds_amount', itemId);
  throw new VersionConflictError('purchase_order_lines', itemId);
}

/** Parte de un pago que corresponde a un ítem de su orden (importe mayor que cero). */
export interface PaymentAllocation {
  itemId: string;
  amount: string;
}

export interface PaymentData {
  orderId: string;
  paidOn: string;
  concept: string;
  method: PaymentMethod;
  amount: string;
  support: PaymentSupport;
}

export interface PaymentInput extends PaymentData {
  /** Reparto entre ítems de la orden. Puede sumar menos que el monto (pago repartido en parte). */
  allocations: PaymentAllocation[];
}

export interface PaymentDetail extends PaymentData {
  id: string;
  projectId: string;
  version: number;
  /** En el orden de la matriz. */
  allocations: PaymentAllocation[];
}

export async function getPayment(db: Queryable, id: string): Promise<PaymentDetail | null> {
  const { rows } = await db.query<Omit<PaymentDetail, 'allocations'>>(
    `SELECT p.id, o.project_id AS "projectId", p.purchase_order_id AS "orderId", p.paid_on AS "paidOn", p.concept,
            p.method, p.amount, p.support, p.version
       FROM payments p
       JOIN purchase_orders o ON o.id = p.purchase_order_id
      WHERE p.id = $1`,
    [id],
  );
  const payment = rows[0];
  if (!payment) return null;
  const allocations = await db.query<PaymentAllocation>(
    `SELECT l.tdr_item_id AS "itemId", a.amount
       FROM payment_allocations a
       JOIN purchase_order_lines l ON l.id = a.purchase_order_line_id
       JOIN tdr_items i ON i.id = l.tdr_item_id
      WHERE a.payment_id = $1
      ORDER BY i.item_number, i.id`,
    [id],
  );
  return { ...payment, allocations: allocations.rows };
}

/** Bloquea las líneas de una orden siempre en el mismo orden, para que dos guardados no se crucen. */
async function lockOrderLines(db: Queryable, orderId: string): Promise<void> {
  await db.query(`SELECT id FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id FOR UPDATE`, [orderId]);
}

/**
 * Guarda el reparto de un pago que todavía no tiene ninguno. Comprueba antes cada regla para
 * poder decir cuál se incumple; la base las vuelve a aplicar con sus triggers.
 */
async function insertAllocations(db: Queryable, paymentId: string, orderId: string, allocations: readonly PaymentAllocation[]): Promise<void> {
  if (allocations.length === 0) return;
  const itemIds = allocations.map((allocation) => allocation.itemId);
  const amounts = allocations.map((allocation) => allocation.amount);

  const lines = await db.query<{ itemId: string; sameOrder: boolean | null; exceeds: boolean | null }>(
    `SELECT i.item_id AS "itemId", l.purchase_order_id = $1 AS "sameOrder", l.paid_amount + i.amount > l.amount AS exceeds
       FROM unnest($2::uuid[], $3::numeric[]) WITH ORDINALITY AS i(item_id, amount, position)
       LEFT JOIN purchase_order_lines l ON l.tdr_item_id = i.item_id
      ORDER BY i.position`,
    [orderId, itemIds, amounts],
  );
  for (const line of lines.rows) {
    if (line.sameOrder !== true) throw new BusinessRuleError('allocation_other_order', line.itemId);
    if (line.exceeds) throw new BusinessRuleError('allocation_exceeds_balance', line.itemId);
  }

  const total = await db.query<{ exceeds: boolean }>(
    `SELECT (SELECT sum(amount) FROM unnest($2::numeric[]) AS t(amount)) > p.amount AS exceeds FROM payments p WHERE p.id = $1`,
    [paymentId, amounts],
  );
  if (total.rows[0]?.exceeds) throw new BusinessRuleError('allocation_exceeds_payment');

  await db.query(
    `INSERT INTO payment_allocations (payment_id, purchase_order_line_id, amount)
     SELECT $1, l.id, i.amount
       FROM unnest($2::uuid[], $3::numeric[]) AS i(item_id, amount)
       JOIN purchase_order_lines l ON l.tdr_item_id = i.item_id`,
    [paymentId, itemIds, amounts],
  );
}

/**
 * Registra un pago y su reparto. Son varias sentencias: debe ejecutarse dentro de una
 * transacción del llamador (`withTransaction`), igual que `updatePayment` y `deletePayment`.
 */
export async function createPayment(db: Queryable, input: PaymentInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO payments (purchase_order_id, paid_on, concept, method, amount, support) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.orderId, input.paidOn, input.concept, input.method, input.amount, input.support],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de pago sin resultado');
  await lockOrderLines(db, input.orderId);
  await insertAllocations(db, id, input.orderId, input.allocations);
  return id;
}

/** Bloquea el pago si conserva la versión esperada; devuelve su orden y si ya tiene reparto. */
async function lockPayment(db: Queryable, id: string, expectedVersion: number): Promise<{ orderId: string; allocated: boolean }> {
  const { rows } = await db.query<{ orderId: string; allocated: boolean }>(
    `SELECT p.purchase_order_id AS "orderId",
            EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id) AS allocated
       FROM payments p
      WHERE p.id = $1 AND p.version = $2
        FOR UPDATE OF p`,
    [id, expectedVersion],
  );
  const payment = rows[0];
  if (!payment) throw new VersionConflictError('payments', id);
  return payment;
}

/**
 * Corrige un pago y sustituye su reparto por el indicado. Un pago ya repartido no cambia de
 * orden: primero hay que guardarlo sin reparto. Requiere una transacción del llamador.
 */
export async function updatePayment(db: Queryable, id: string, expectedVersion: number, input: PaymentInput): Promise<void> {
  const current = await lockPayment(db, id, expectedVersion);
  if (current.allocated && current.orderId !== input.orderId) throw new BusinessRuleError('payment_has_allocations');
  await lockOrderLines(db, current.orderId);
  if (input.orderId !== current.orderId) await lockOrderLines(db, input.orderId);

  await db.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [id]);
  await db.query(
    `UPDATE payments SET purchase_order_id = $2, paid_on = $3, concept = $4, method = $5, amount = $6, support = $7 WHERE id = $1`,
    [id, input.orderId, input.paidOn, input.concept, input.method, input.amount, input.support],
  );
  await insertAllocations(db, id, input.orderId, input.allocations);
}

/** Elimina un pago y su reparto: lo pagado de sus ítems baja. Requiere una transacción del llamador. */
export async function deletePayment(db: Queryable, id: string, expectedVersion: number): Promise<void> {
  const current = await lockPayment(db, id, expectedVersion);
  await lockOrderLines(db, current.orderId);
  await db.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [id]);
  await db.query(`DELETE FROM payments WHERE id = $1`, [id]);
}

/** Línea cuyo «pagado» no coincide con sus repartos: valor escrito a mano antes de la migración 0008. */
export interface ManualPaidLine {
  itemId: string;
  orderId: string;
  paidAmount: string;
  allocatedAmount: string;
}

const MANUAL_PAID_LINES = `
  SELECT l.id, l.tdr_item_id, l.purchase_order_id, l.paid_amount,
         COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.purchase_order_line_id = l.id), 0)::numeric(14,2) AS allocated
    FROM purchase_order_lines l
    JOIN purchase_orders o ON o.id = l.purchase_order_id
   WHERE o.project_id = $1`;

/** Conversión de datos anteriores a 0008: líneas con lo pagado escrito a mano. */
export async function listManualPaidLines(db: Queryable, projectId: string): Promise<ManualPaidLine[]> {
  const { rows } = await db.query<ManualPaidLine>(
    `SELECT m.tdr_item_id AS "itemId", m.purchase_order_id AS "orderId", m.paid_amount AS "paidAmount", m.allocated AS "allocatedAmount"
       FROM (${MANUAL_PAID_LINES}) m
      WHERE m.paid_amount <> m.allocated
      ORDER BY m.id`,
    [projectId],
  );
  return rows;
}

/**
 * Conversión de datos anteriores a 0008: deja lo pagado de cada línea igual a la suma de sus
 * repartos (cero si no tiene). Devuelve cuántas líneas cambió.
 */
export async function resetManualPaidAmounts(db: Queryable, projectId: string): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE purchase_order_lines l
        SET paid_amount = m.allocated
       FROM (${MANUAL_PAID_LINES}) m
      WHERE l.id = m.id AND m.paid_amount <> m.allocated`,
    [projectId],
  );
  return rowCount ?? 0;
}

/**
 * Reparte un pago existente que todavía no tiene reparto, sin modificar el pago (su versión no
 * cambia). Lo usa la conversión de datos anteriores a 0008. Requiere una transacción del llamador.
 */
export async function allocateExistingPayment(db: Queryable, paymentId: string, allocations: readonly PaymentAllocation[]): Promise<void> {
  const { rows } = await db.query<{ orderId: string; allocated: boolean }>(
    `SELECT p.purchase_order_id AS "orderId",
            EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id) AS allocated
       FROM payments p
      WHERE p.id = $1
        FOR UPDATE OF p`,
    [paymentId],
  );
  const payment = rows[0];
  if (!payment) throw new VersionConflictError('payments', paymentId);
  if (payment.allocated) throw new BusinessRuleError('payment_has_allocations');
  await lockOrderLines(db, payment.orderId);
  await insertAllocations(db, paymentId, payment.orderId, allocations);
}
