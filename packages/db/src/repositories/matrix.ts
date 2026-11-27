import type { ContractStatus, ItemPaymentStatus, MountStatus, SupplierKind } from '../domain.ts';
import type { Queryable } from './shared.ts';

/** Extracción confirmada cuya matriz usan Planificación, Abastecimiento y Ejecución. */
export interface ConfirmedMatrix {
  extractionId: string;
  documentId: string;
  documentFilename: string;
  provider: string;
  model: string;
  confirmedAt: Date;
}

/**
 * Matriz vigente del proyecto: la extracción confirmada más reciente entre sus documentos
 * (cada documento admite como máximo una confirmada).
 */
export async function getConfirmedMatrix(db: Queryable, projectId: string): Promise<ConfirmedMatrix | null> {
  const { rows } = await db.query<ConfirmedMatrix>(
    `SELECT x.id AS "extractionId", d.id AS "documentId", d.original_filename AS "documentFilename",
            x.provider, x.model, x.confirmed_at AS "confirmedAt"
       FROM tdr_extractions x
       JOIN tdr_documents d ON d.id = x.tdr_document_id
      WHERE d.project_id = $1 AND x.status = 'confirmed'
      ORDER BY x.confirmed_at DESC, x.id
      LIMIT 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

/**
 * Ítem de la matriz con lo que cada módulo añade sobre él. `numeric` llega como texto exacto.
 * La numeración 1.1, 1.2… se calcula en la presentación a partir de `rubro` y del orden.
 */
export interface MatrixItem {
  id: string;
  itemNumber: number;
  rubro: string;
  producto: string;
  subproducto: string | null;
  descripcion: string;
  cant: string | null;
  unidad: string | null;
  dias: string | null;
  observacion: string | null;
  // Responsable (Requerimiento)
  workerId: string | null;
  workerName: string | null;
  // Planificación
  supplierId: string | null;
  supplierName: string | null;
  supplierKind: SupplierKind | null;
  plannedCost: string | null;
  contractStatus: ContractStatus | null;
  /** Versión de la planificación del ítem; null si todavía no tiene. */
  planVersion: number | null;
  activityCount: number;
  // Abastecimiento
  orderId: string | null;
  orderCode: string | null;
  orderAmount: string | null;
  /** Suma de lo que los pagos le reparten al ítem (valor calculado por la base). */
  paidAmount: string | null;
  balance: string | null;
  paymentStatus: ItemPaymentStatus;
  paymentWorkerId: string | null;
  paymentWorkerName: string | null;
  /** Versión de la línea de la orden; null si el ítem no está en ninguna orden. */
  lineVersion: number | null;
  // Ejecución
  mountStatus: MountStatus | null;
  /** Versión del registro de ejecución del ítem; null si todavía no tiene. */
  executionVersion: number | null;
  evidenceCount: number;
}

export async function listMatrixItems(db: Queryable, extractionId: string): Promise<MatrixItem[]> {
  const { rows } = await db.query<MatrixItem>(
    `SELECT i.id, i.item_number AS "itemNumber", i.rubro, i.producto, i.subproducto, i.descripcion,
            i.cant, i.unidad, i.dias, i.observacion,
            w.id AS "workerId", w.full_name AS "workerName",
            s.id AS "supplierId", s.name AS "supplierName", s.kind AS "supplierKind",
            p.planned_cost AS "plannedCost", p.contract_status AS "contractStatus", p.version AS "planVersion",
            (SELECT count(*)::int FROM activity_items ai WHERE ai.tdr_item_id = i.id) AS "activityCount",
            o.id AS "orderId", o.code AS "orderCode", l.amount AS "orderAmount", l.paid_amount AS "paidAmount",
            l.amount - l.paid_amount AS balance,
            CASE WHEN l.id IS NULL THEN 'no_order'
                 WHEN l.paid_amount = 0 THEN 'unpaid'
                 WHEN l.paid_amount < l.amount THEN 'partial'
                 ELSE 'paid' END AS "paymentStatus",
            pw.id AS "paymentWorkerId", pw.full_name AS "paymentWorkerName", l.version AS "lineVersion",
            e.mount_status AS "mountStatus", e.version AS "executionVersion",
            (SELECT count(*)::int FROM item_evidences v WHERE v.tdr_item_id = i.id) AS "evidenceCount"
       FROM tdr_items i
       LEFT JOIN tdr_item_assignments a ON a.tdr_item_id = i.id
       LEFT JOIN workers w ON w.id = a.worker_id
       LEFT JOIN item_plans p ON p.tdr_item_id = i.id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN purchase_order_lines l ON l.tdr_item_id = i.id
       LEFT JOIN purchase_orders o ON o.id = l.purchase_order_id
       LEFT JOIN workers pw ON pw.id = l.payment_worker_id
       LEFT JOIN item_execution e ON e.tdr_item_id = i.id
      WHERE i.extraction_id = $1
      ORDER BY i.item_number`,
    [extractionId],
  );
  return rows;
}

/** Indicadores calculados en la base a partir de las filas (nunca se guardan). */
export interface MatrixTotals {
  itemCount: number;
  rubroCount: number;
  responsibleCount: number;
  unassignedCount: number;
  supplierCount: number;
  holdingSupplierCount: number;
  plannedCost: string;
  orderCount: number;
  orderedAmount: string;
  paidAmount: string;
  /** Saldo de las órdenes emitidas. */
  balance: string;
  /** Costo asignado de los ítems que todavía no tienen orden. */
  unorderedCost: string;
  /** Por pagar en total: saldo de las órdenes más lo que aún no tiene orden. */
  outstandingAmount: string;
  holdingAmount: string;
  /** Total de los pagos registrados contra las órdenes del proyecto. */
  paymentsAmount: string;
  /** Parte de esos pagos que todavía no está repartida entre ítems. */
  unallocatedPayments: string;
  fullyPaidCount: number;
  mountedCount: number;
  itemsWithEvidence: number;
  evidenceCount: number;
}

/**
 * Con `workerId`, los indicadores cuentan solo los ítems de ese responsable (alcance de un
 * empleado de campo) y los pagos, que son de todo el proyecto, quedan en cero.
 */
export async function getMatrixTotals(
  db: Queryable,
  extractionId: string,
  options: { workerId?: string | null } = {},
): Promise<MatrixTotals> {
  const { rows } = await db.query<MatrixTotals>(
    `WITH item AS (
       SELECT i.id, lower(btrim(i.rubro)) AS rubro, a.worker_id, p.planned_cost, s.id AS supplier_id, s.kind,
              l.purchase_order_id, l.amount, l.paid_amount, l.id AS line_id, e.mount_status,
              (SELECT count(*)::int FROM item_evidences v WHERE v.tdr_item_id = i.id) AS evidences
         FROM tdr_items i
         LEFT JOIN tdr_item_assignments a ON a.tdr_item_id = i.id
         LEFT JOIN item_plans p ON p.tdr_item_id = i.id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN purchase_order_lines l ON l.tdr_item_id = i.id
         LEFT JOIN item_execution e ON e.tdr_item_id = i.id
        WHERE i.extraction_id = $1
          AND ($2::uuid IS NULL OR a.worker_id = $2::uuid)
     ), payment AS (
       SELECT p.amount,
              COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id), 0) AS allocated
         FROM payments p
         JOIN purchase_orders o ON o.id = p.purchase_order_id
        WHERE $2::uuid IS NULL
          AND o.project_id = (SELECT d.project_id
                                FROM tdr_extractions x
                                JOIN tdr_documents d ON d.id = x.tdr_document_id
                               WHERE x.id = $1)
     )
     SELECT count(*)::int AS "itemCount",
            count(DISTINCT rubro)::int AS "rubroCount",
            count(DISTINCT worker_id)::int AS "responsibleCount",
            (count(*) FILTER (WHERE worker_id IS NULL))::int AS "unassignedCount",
            (count(DISTINCT supplier_id) FILTER (WHERE kind <> 'payroll'))::int AS "supplierCount",
            (count(DISTINCT supplier_id) FILTER (WHERE kind = 'holding'))::int AS "holdingSupplierCount",
            COALESCE(sum(planned_cost), 0)::numeric(14,2) AS "plannedCost",
            count(DISTINCT purchase_order_id)::int AS "orderCount",
            COALESCE(sum(amount), 0)::numeric(14,2) AS "orderedAmount",
            COALESCE(sum(paid_amount), 0)::numeric(14,2) AS "paidAmount",
            COALESCE(sum(amount - paid_amount), 0)::numeric(14,2) AS balance,
            COALESCE(sum(planned_cost) FILTER (WHERE line_id IS NULL), 0)::numeric(14,2) AS "unorderedCost",
            COALESCE(sum(CASE WHEN line_id IS NULL THEN planned_cost ELSE amount - paid_amount END), 0)::numeric(14,2)
              AS "outstandingAmount",
            COALESCE(sum(amount) FILTER (WHERE kind = 'holding'), 0)::numeric(14,2) AS "holdingAmount",
            (SELECT COALESCE(sum(amount), 0)::numeric(14,2) FROM payment) AS "paymentsAmount",
            (SELECT COALESCE(sum(amount - allocated), 0)::numeric(14,2) FROM payment) AS "unallocatedPayments",
            (count(*) FILTER (WHERE line_id IS NOT NULL AND paid_amount > 0 AND paid_amount >= amount))::int AS "fullyPaidCount",
            (count(*) FILTER (WHERE mount_status IN ('mounted', 'tested', 'in_event', 'dismounted')))::int AS "mountedCount",
            (count(*) FILTER (WHERE evidences > 0))::int AS "itemsWithEvidence",
            COALESCE(sum(evidences), 0)::int AS "evidenceCount"
       FROM item`,
    [extractionId, options.workerId ?? null],
  );
  const totals = rows[0];
  if (!totals) throw new Error('Totales de la matriz sin resultado');
  return totals;
}
