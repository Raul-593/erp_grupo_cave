/**
 * Edición de órdenes de compra y pagos (modelo provisional hasta la Fase 6). Lo pagado por
 * ítem se registra a mano en la línea de la orden y no puede superar su monto; todavía no se
 * calcula a partir de los pagos.
 */
import type { PaymentMethod, PaymentSupport } from '../domain.ts';
import { getPgErrorCode, PgErrorCode } from '../errors.ts';
import { buildSet, VersionConflictError, type Queryable } from './shared.ts';

/** Regla de negocio incumplida; `rule` identifica el mensaje para el usuario. */
export class BusinessRuleError extends Error {
  override name = 'BusinessRuleError';
  readonly rule: 'paid_exceeds_amount' | 'line_has_payments';
  constructor(rule: BusinessRuleError['rule']) {
    super(rule);
    this.rule = rule;
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

/** La línea existe con esa versión (el fallo fue por una regla) o no (conflicto de versión). */
async function lineMatches(db: Queryable, itemId: string, version: number): Promise<boolean> {
  const { rowCount } = await db.query(`SELECT 1 FROM purchase_order_lines WHERE tdr_item_id = $1 AND version = $2`, [itemId, version]);
  return rowCount === 1;
}

/**
 * Pone un ítem en una orden, lo cambia de orden o lo quita (orderId = null).
 * - Sin línea previa (`expectedVersion` null): se crea con el costo asignado del ítem como monto.
 * - Quitar solo se permite si el ítem no tiene nada pagado.
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
  if (orderId === null) {
    const { rowCount } = await db.query(
      `DELETE FROM purchase_order_lines WHERE tdr_item_id = $1 AND version = $2 AND paid_amount = 0`,
      [itemId, expectedVersion],
    );
    if (rowCount === 1) return;
    if (await lineMatches(db, itemId, expectedVersion)) throw new BusinessRuleError('line_has_payments');
    throw new VersionConflictError('purchase_order_lines', itemId);
  }
  const { rowCount } = await db.query(
    `UPDATE purchase_order_lines SET purchase_order_id = $3 WHERE tdr_item_id = $1 AND version = $2`,
    [itemId, expectedVersion, orderId],
  );
  if (rowCount !== 1) throw new VersionConflictError('purchase_order_lines', itemId);
}

export interface OrderLinePatch {
  /** Monto comprometido del ítem en la orden (texto decimal exacto). */
  amount: string;
  /** Pagado del ítem, registrado a mano; no puede superar el monto. */
  paidAmount: string;
  paymentWorkerId: string | null;
}

const LINE_COLUMNS: Readonly<Record<keyof OrderLinePatch, string>> = {
  amount: 'amount',
  paidAmount: 'paid_amount',
  paymentWorkerId: 'payment_worker_id',
};

export async function updateOrderLine(
  db: Queryable,
  itemId: string,
  expectedVersion: number,
  patch: Partial<OrderLinePatch>,
): Promise<void> {
  const set = buildSet(patch, LINE_COLUMNS, 5);
  if (set.values.length === 0) return;
  // La condición final compara los valores que quedarían guardados (nuevo o, si no cambia, el actual).
  const { rowCount } = await db.query(
    `UPDATE purchase_order_lines SET ${set.sql}
      WHERE tdr_item_id = $1 AND version = $2
        AND COALESCE($4::numeric, paid_amount) <= COALESCE($3::numeric, amount)`,
    [itemId, expectedVersion, patch.amount ?? null, patch.paidAmount ?? null, ...set.values],
  );
  if (rowCount === 1) return;
  if (await lineMatches(db, itemId, expectedVersion)) throw new BusinessRuleError('paid_exceeds_amount');
  throw new VersionConflictError('purchase_order_lines', itemId);
}

export interface PaymentInput {
  orderId: string;
  paidOn: string;
  concept: string;
  method: PaymentMethod;
  amount: string;
  support: PaymentSupport;
}

export interface PaymentDetail extends PaymentInput {
  id: string;
  projectId: string;
  version: number;
}

export async function getPayment(db: Queryable, id: string): Promise<PaymentDetail | null> {
  const { rows } = await db.query<PaymentDetail>(
    `SELECT p.id, o.project_id AS "projectId", p.purchase_order_id AS "orderId", p.paid_on AS "paidOn", p.concept,
            p.method, p.amount, p.support, p.version
       FROM payments p
       JOIN purchase_orders o ON o.id = p.purchase_order_id
      WHERE p.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createPayment(db: Queryable, input: PaymentInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO payments (purchase_order_id, paid_on, concept, method, amount, support) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.orderId, input.paidOn, input.concept, input.method, input.amount, input.support],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT de pago sin resultado');
  return id;
}

export async function updatePayment(db: Queryable, id: string, expectedVersion: number, input: PaymentInput): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE payments SET purchase_order_id = $3, paid_on = $4, concept = $5, method = $6, amount = $7, support = $8
      WHERE id = $1 AND version = $2`,
    [id, expectedVersion, input.orderId, input.paidOn, input.concept, input.method, input.amount, input.support],
  );
  if (rowCount !== 1) throw new VersionConflictError('payments', id);
}

export async function deletePayment(db: Queryable, id: string, expectedVersion: number): Promise<void> {
  const { rowCount } = await db.query(`DELETE FROM payments WHERE id = $1 AND version = $2`, [id, expectedVersion]);
  if (rowCount !== 1) throw new VersionConflictError('payments', id);
}
