/**
 * Consultas de solo lectura de Planificación, Abastecimiento, Ejecución y cotizaciones
 * (tablas de la migración 0007). `date` y `numeric` llegan como texto exacto.
 */
import type {
  ActivityStatus,
  CheckResult,
  PaymentMethod,
  PaymentSupport,
  QuoteStatus,
  SupplierKind,
} from '../domain.ts';
import type { Queryable } from './shared.ts';

export interface Supplier {
  id: string;
  name: string;
  kind: SupplierKind;
  taxId: string | null;
  active: boolean;
}

export async function listSuppliers(db: Queryable): Promise<Supplier[]> {
  const { rows } = await db.query<Supplier>(
    `SELECT id, name, kind, tax_id AS "taxId", active FROM suppliers ORDER BY active DESC, lower(name), id`,
  );
  return rows;
}

export interface Activity {
  id: string;
  name: string;
  workerId: string | null;
  workerName: string | null;
  wholeTeam: boolean;
  startDate: string;
  endDate: string;
  isMilestone: boolean;
  status: ActivityStatus | null;
  dependsOnId: string | null;
  dependsOnName: string | null;
  /** Ítems vinculados, en el orden de la matriz. */
  itemIds: string[];
}

export async function listActivities(db: Queryable, projectId: string): Promise<Activity[]> {
  const { rows } = await db.query<Activity>(
    `SELECT a.id, a.name, a.worker_id AS "workerId", w.full_name AS "workerName", a.whole_team AS "wholeTeam",
            a.start_date AS "startDate", a.end_date AS "endDate", a.is_milestone AS "isMilestone", a.status,
            a.depends_on_activity_id AS "dependsOnId", dep.name AS "dependsOnName",
            COALESCE((SELECT array_agg(ai.tdr_item_id ORDER BY i.item_number)
                        FROM activity_items ai
                        JOIN tdr_items i ON i.id = ai.tdr_item_id
                       WHERE ai.activity_id = a.id), '{}') AS "itemIds"
       FROM activities a
       LEFT JOIN workers w ON w.id = a.worker_id
       LEFT JOIN activities dep ON dep.id = a.depends_on_activity_id
      WHERE a.project_id = $1
      ORDER BY a.start_date, a.sort_order, a.id`,
    [projectId],
  );
  return rows;
}

export interface Payment {
  id: string;
  orderId: string;
  orderCode: string;
  paidOn: string;
  concept: string;
  method: PaymentMethod;
  amount: string;
  support: PaymentSupport;
}

export async function listPayments(db: Queryable, projectId: string): Promise<Payment[]> {
  const { rows } = await db.query<Payment>(
    `SELECT p.id, o.id AS "orderId", o.code AS "orderCode", p.paid_on AS "paidOn", p.concept, p.method, p.amount, p.support
       FROM payments p
       JOIN purchase_orders o ON o.id = p.purchase_order_id
      WHERE o.project_id = $1
      ORDER BY p.paid_on, o.code, p.id`,
    [projectId],
  );
  return rows;
}

export interface PreEventCheck {
  id: string;
  description: string;
  workerName: string | null;
  dueAt: Date | null;
  result: CheckResult;
}

export async function listPreEventChecks(db: Queryable, projectId: string): Promise<PreEventCheck[]> {
  const { rows } = await db.query<PreEventCheck>(
    `SELECT c.id, c.description, w.full_name AS "workerName", c.due_at AS "dueAt", c.result
       FROM pre_event_checks c
       LEFT JOIN workers w ON w.id = c.worker_id
      WHERE c.project_id = $1
      ORDER BY c.sort_order, c.id`,
    [projectId],
  );
  return rows;
}

/** Posición del rubro de la solicitud en la matriz confirmada del proyecto (orden del documento). */
const RUBRO_ORDER = `(
  SELECT min(i.item_number)
    FROM tdr_items i
    JOIN tdr_extractions x ON x.id = i.extraction_id
    JOIN tdr_documents d ON d.id = x.tdr_document_id
   WHERE d.project_id = q.project_id AND x.status = 'confirmed'
     AND lower(btrim(i.rubro)) = lower(btrim(q.rubro)))`;

export interface QuoteRequest {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierKind: SupplierKind;
  rubro: string;
  sentOn: string | null;
  status: QuoteStatus;
  /** Ítems con valor cotizado en esta solicitud. */
  lineCount: number;
}

export async function listQuoteRequests(db: Queryable, projectId: string): Promise<QuoteRequest[]> {
  const { rows } = await db.query<QuoteRequest>(
    `SELECT q.id, s.id AS "supplierId", s.name AS "supplierName", s.kind AS "supplierKind", q.rubro,
            q.sent_on AS "sentOn", q.status,
            (SELECT count(*)::int FROM quote_lines l WHERE l.quote_request_id = q.id) AS "lineCount"
       FROM quote_requests q
       JOIN suppliers s ON s.id = q.supplier_id
      WHERE q.project_id = $1
      ORDER BY ${RUBRO_ORDER} NULLS LAST, lower(s.name), q.id`,
    [projectId],
  );
  return rows;
}

/** Valor cotizado por un proveedor para un ítem (comparativo). */
export interface QuoteLine {
  requestId: string;
  supplierId: string;
  supplierName: string;
  rubro: string;
  itemId: string;
  itemNumber: number;
  producto: string;
  amount: string;
  awarded: boolean;
}

export async function listQuoteLines(db: Queryable, projectId: string): Promise<QuoteLine[]> {
  const { rows } = await db.query<QuoteLine>(
    `SELECT q.id AS "requestId", s.id AS "supplierId", s.name AS "supplierName", q.rubro,
            i.id AS "itemId", i.item_number AS "itemNumber", i.producto, l.amount, l.awarded
       FROM quote_lines l
       JOIN quote_requests q ON q.id = l.quote_request_id
       JOIN suppliers s ON s.id = q.supplier_id
       JOIN tdr_items i ON i.id = l.tdr_item_id
      WHERE q.project_id = $1
      ORDER BY i.item_number, lower(s.name), q.id`,
    [projectId],
  );
  return rows;
}
