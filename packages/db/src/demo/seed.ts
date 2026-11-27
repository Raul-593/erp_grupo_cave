/**
 * Carga de los datos de demostración en un proyecto (AGENTS.md §2, «Vista previa con datos de
 * demostración»). Entran como una extracción de proveedor `demo`, ya confirmada, sobre un
 * documento de demostración: no provienen de una IA ni de un TDR real.
 *
 * `seedDemo` debe ejecutarse dentro de una transacción del llamador; no escribe archivos.
 */
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../repositories/shared.ts';
import type { StorageProvider } from '../repositories/documents.ts';
import type { DemoDataset, DemoRawResponse } from './types.ts';

export const DEMO_PROVIDER = 'demo';
export const DEMO_PROMPT_VERSION = 'sin-ia';

export class DemoSeedError extends Error {
  override name = 'DemoSeedError';
}

export interface DemoSeedOptions {
  projectId: string;
  dataset: DemoDataset;
  /** Versión del contrato de extracción con la que se validó `buildDemoRawResponse`. */
  schemaVersion: string;
  /** Referencia del PDF de demostración ya guardado en el almacenamiento. */
  document: {
    storageProvider: StorageProvider;
    storageKey: string;
    originalFilename: string;
    sizeBytes: number;
    sha256: string;
  };
}

/** Valores del proyecto antes de aplicar la ficha de demostración (para poder revertir). */
export interface DemoPreviousProject {
  name: string;
  clientId: string;
  clientName: string;
  companyId: string | null;
  processCode: string | null;
  purpose: string | null;
  contractAmount: string | null;
  currency: string | null;
  amountIncludesVat: boolean | null;
  venues: string[];
  termText: string | null;
  startDate: string | null;
  endDate: string | null;
  contractAdministrator: string | null;
  fichaExtractionId: string | null;
}

export type DemoSeedResult =
  | { seeded: false; extractionId: string }
  | {
      seeded: true;
      extractionId: string;
      documentId: string;
      previousProject: DemoPreviousProject;
      /** Filas creadas por tabla. */
      counts: Record<string, number>;
    };

/** JSON que se guarda como `raw_response`: misma forma que la respuesta de la IA. */
export function buildDemoRawResponse(dataset: DemoDataset): DemoRawResponse {
  return {
    ficha: { ...dataset.ficha, sedes: [...dataset.ficha.sedes] },
    items: dataset.items.map((row, index) => ({
      item: index + 1,
      rubro: row.rubro,
      producto: row.producto,
      subproducto: row.subproducto,
      descripcion: row.descripcion,
      cant: row.cant,
      unidad: row.unidad,
      dias: row.dias,
      observacion: row.observacion,
    })),
  };
}

/** Extracción de demostración ya cargada en el proyecto, si existe. */
export async function findDemoExtraction(db: Queryable, projectId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT x.id
       FROM tdr_extractions x
       JOIN tdr_documents d ON d.id = x.tdr_document_id
      WHERE d.project_id = $1 AND x.provider = $2
      ORDER BY x.created_at
      LIMIT 1`,
    [projectId, DEMO_PROVIDER],
  );
  return rows[0]?.id ?? null;
}

const key = (value: string) => value.trim().toLocaleLowerCase('es');

async function insertId(db: Queryable, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await db.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT sin resultado');
  return id;
}

/** Devuelve el id de la fila con ese nombre (sin distinguir mayúsculas) o la crea. */
async function findOrCreate(
  db: Queryable,
  name: string,
  find: string,
  create: string,
  createParams: unknown[],
): Promise<{ id: string; created: boolean }> {
  const { rows } = await db.query<{ id: string }>(find, [name]);
  if (rows[0]) return { id: rows[0].id, created: false };
  return { id: await insertId(db, create, createParams), created: true };
}

function lookup(map: Map<string, string>, name: string, what: string): string {
  const id = map.get(key(name));
  if (!id) throw new DemoSeedError(`Datos de demostración incoherentes: ${what} «${name}» no está definido.`);
  return id;
}

/** Comprueba las referencias internas antes de escribir nada. */
function assertDataset(dataset: DemoDataset): void {
  const unique = (values: string[], what: string) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(key(value))) throw new DemoSeedError(`Datos de demostración incoherentes: ${what} «${value}» repetido.`);
      seen.add(key(value));
    }
    return seen;
  };
  const workers = unique(dataset.workers, 'trabajador');
  const suppliers = unique(dataset.suppliers.map((s) => s.name), 'proveedor');
  const items = unique(dataset.items.map((i) => i.key), 'ítem');
  const activities = unique(dataset.activities.map((a) => a.key), 'actividad');
  const orders = new Set(dataset.items.flatMap((i) => (i.order ? [key(i.order.code)] : [])));
  const need = (set: Set<string>, value: string | null, what: string) => {
    if (value !== null && !set.has(key(value))) {
      throw new DemoSeedError(`Datos de demostración incoherentes: ${what} «${value}» no está definido.`);
    }
  };
  if (dataset.items.length === 0) throw new DemoSeedError('Los datos de demostración no tienen ítems.');
  for (const item of dataset.items) {
    need(workers, item.responsible, 'trabajador');
    need(suppliers, item.plan?.supplier ?? null, 'proveedor');
    need(workers, item.order?.paidBy ?? null, 'trabajador');
  }
  for (const payment of dataset.payments) need(orders, payment.order, 'orden');
  for (const activity of dataset.activities) {
    need(workers, activity.responsible, 'trabajador');
    need(activities, activity.dependsOn, 'actividad');
    for (const item of activity.items) need(items, item, 'ítem');
  }
  for (const check of dataset.preEventChecks) need(workers, check.responsible, 'trabajador');
  for (const request of dataset.quoteRequests) {
    need(suppliers, request.supplier, 'proveedor');
    for (const line of request.lines) need(items, line.item, 'ítem');
  }
}

/**
 * Carga la demostración en el proyecto. No hace nada (seeded: false) si el proyecto ya tiene
 * una extracción de demostración. Conserva el nombre del proyecto y los registros existentes;
 * sustituye la ficha del proyecto por la de `dataset.ficha`.
 */
export async function seedDemo(db: Queryable, options: DemoSeedOptions): Promise<DemoSeedResult> {
  const { projectId, dataset, document } = options;
  assertDataset(dataset);

  // Bloquea el proyecto: dos ejecuciones simultáneas no pueden cargar la demostración dos veces.
  const project = await db.query<DemoPreviousProject>(
    `SELECT p.name, p.client_id AS "clientId", c.name AS "clientName", p.company_id AS "companyId",
            p.process_code AS "processCode", p.purpose, p.contract_amount AS "contractAmount", p.currency,
            p.amount_includes_vat AS "amountIncludesVat", p.venues, p.term_text AS "termText",
            p.start_date AS "startDate", p.end_date AS "endDate",
            p.contract_administrator AS "contractAdministrator", p.ficha_extraction_id AS "fichaExtractionId"
       FROM projects p
       JOIN clients c ON c.id = p.client_id
      WHERE p.id = $1
        FOR UPDATE OF p`,
    [projectId],
  );
  const previousProject = project.rows[0];
  if (!previousProject) throw new DemoSeedError(`El proyecto ${projectId} no existe.`);

  const existing = await findDemoExtraction(db, projectId);
  if (existing) return { seeded: false, extractionId: existing };

  const counts: Record<string, number> = {};
  const add = (table: string, n = 1) => {
    counts[table] = (counts[table] ?? 0) + n;
  };
  const ficha = dataset.ficha;

  // 1. Empresa, contratante, trabajadores y proveedores (se reutilizan si ya existen).
  let companyId = previousProject.companyId;
  if (dataset.company) {
    const company = await findOrCreate(
      db,
      dataset.company,
      `SELECT id FROM companies WHERE lower(btrim(name)) = lower(btrim($1)) ORDER BY created_at LIMIT 1`,
      `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
      [dataset.company],
    );
    companyId = company.id;
    if (company.created) add('companies');
  }

  let clientId = previousProject.clientId;
  if (ficha.contratante) {
    const client = await findOrCreate(
      db,
      ficha.contratante,
      `SELECT id FROM clients WHERE lower(btrim(name)) = lower(btrim($1)) ORDER BY created_at LIMIT 1`,
      `INSERT INTO clients (name, tax_id) VALUES ($1, $2) RETURNING id`,
      [ficha.contratante, ficha.ruc_contratante],
    );
    clientId = client.id;
    if (client.created) add('clients');
  }

  const workerIds = new Map<string, string>();
  for (const name of dataset.workers) {
    const worker = await findOrCreate(
      db,
      name,
      `SELECT id FROM workers WHERE lower(btrim(full_name)) = lower(btrim($1)) AND active ORDER BY created_at LIMIT 1`,
      `INSERT INTO workers (full_name) VALUES ($1) RETURNING id`,
      [name],
    );
    workerIds.set(key(name), worker.id);
    if (worker.created) add('workers');
  }

  const supplierIds = new Map<string, string>();
  for (const supplier of dataset.suppliers) {
    const row = await findOrCreate(
      db,
      supplier.name,
      `SELECT id FROM suppliers WHERE lower(btrim(name)) = lower(btrim($1))`,
      `INSERT INTO suppliers (name, kind) VALUES ($1, $2) RETURNING id`,
      [supplier.name, supplier.kind],
    );
    supplierIds.set(key(supplier.name), row.id);
    if (row.created) add('suppliers');
  }

  // 2. Documento de demostración y extracción con el JSON en la forma del contrato.
  const documentId = await insertId(
    db,
    `INSERT INTO tdr_documents (project_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256, page_count)
     VALUES ($1, $2, $3, $4, 'application/pdf', $5, $6, 1) RETURNING id`,
    [projectId, document.storageProvider, document.storageKey, document.originalFilename, document.sizeBytes, document.sha256],
  );
  add('tdr_documents');

  const raw = buildDemoRawResponse(dataset);
  const extractionId = await insertId(
    db,
    `INSERT INTO tdr_extractions (tdr_document_id, status, idempotency_key, provider, model, prompt_version, schema_version,
                                  raw_response, started_at, finished_at, duration_ms)
     VALUES ($1, 'processed', $2, $3, $4, $5, $6, $7, now(), now(), 0) RETURNING id`,
    [documentId, randomUUID(), DEMO_PROVIDER, dataset.source, DEMO_PROMPT_VERSION, options.schemaVersion, JSON.stringify(raw)],
  );
  add('tdr_extractions');

  // 3. Matriz: una fila por elemento del JSON (source_index conserva su posición) y responsable.
  const itemIds = new Map<string, string>();
  for (const [index, row] of dataset.items.entries()) {
    const itemId = await insertId(
      db,
      `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, subproducto, descripcion, cant, unidad, dias,
                              observacion, source, source_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ai', $11) RETURNING id`,
      [extractionId, index + 1, row.rubro, row.producto, row.subproducto, row.descripcion, row.cant, row.unidad, row.dias, row.observacion, index],
    );
    itemIds.set(key(row.key), itemId);
    add('tdr_items');
    if (row.responsible) {
      await db.query(`INSERT INTO tdr_item_assignments (tdr_item_id, worker_id) VALUES ($1, $2)`, [
        itemId,
        lookup(workerIds, row.responsible, 'trabajador'),
      ]);
      add('tdr_item_assignments');
    }
  }

  // 4. Confirmación (la matriz queda inmutable) y ficha aplicada al proyecto.
  await db.query(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [extractionId]);
  await db.query(
    `UPDATE projects
        SET client_id = $2, company_id = $3, process_code = $4, purpose = $5, contract_amount = $6, currency = $7,
            amount_includes_vat = $8, venues = $9, term_text = $10, start_date = $11, end_date = $12,
            contract_administrator = $13, ficha_extraction_id = $14
      WHERE id = $1`,
    [
      projectId,
      clientId,
      companyId,
      ficha.codigo_proceso,
      ficha.objeto,
      ficha.monto,
      ficha.monto === null ? null : ficha.moneda,
      ficha.incluye_iva,
      ficha.sedes,
      ficha.plazo,
      ficha.fecha_inicio,
      ficha.fecha_fin,
      ficha.administrador_contrato,
      extractionId,
    ],
  );

  // 5. Planificación, órdenes y estado de montaje por ítem.
  const orderIds = new Map<string, string>();
  for (const row of dataset.items) {
    const itemId = lookup(itemIds, row.key, 'ítem');
    if (row.plan) {
      await db.query(`INSERT INTO item_plans (tdr_item_id, supplier_id, planned_cost, contract_status) VALUES ($1, $2, $3, $4)`, [
        itemId,
        row.plan.supplier ? lookup(supplierIds, row.plan.supplier, 'proveedor') : null,
        row.plan.cost,
        row.plan.contract,
      ]);
      add('item_plans');
    }
    if (row.order) {
      let orderId = orderIds.get(key(row.order.code));
      if (!orderId) {
        orderId = await insertId(db, `INSERT INTO purchase_orders (project_id, code) VALUES ($1, $2) RETURNING id`, [
          projectId,
          row.order.code,
        ]);
        orderIds.set(key(row.order.code), orderId);
        add('purchase_orders');
      }
      await db.query(
        `INSERT INTO purchase_order_lines (purchase_order_id, tdr_item_id, amount, paid_amount, payment_worker_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, itemId, row.order.amount, row.order.paid, row.order.paidBy ? lookup(workerIds, row.order.paidBy, 'trabajador') : null],
      );
      add('purchase_order_lines');
    }
    if (row.mountStatus) {
      await db.query(`INSERT INTO item_execution (tdr_item_id, mount_status) VALUES ($1, $2)`, [itemId, row.mountStatus]);
      add('item_execution');
    }
  }

  for (const payment of dataset.payments) {
    await db.query(
      `INSERT INTO payments (purchase_order_id, paid_on, concept, method, amount, support) VALUES ($1, $2, $3, $4, $5, $6)`,
      [lookup(orderIds, payment.order, 'orden'), payment.paidOn, payment.concept, payment.method, payment.amount, payment.support],
    );
    add('payments');
  }

  // 6. Actividades: primero las filas, después las dependencias entre ellas.
  const activityIds = new Map<string, string>();
  for (const [index, activity] of dataset.activities.entries()) {
    const activityId = await insertId(
      db,
      `INSERT INTO activities (project_id, name, worker_id, whole_team, start_date, end_date, is_milestone, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        projectId,
        activity.name,
        activity.responsible ? lookup(workerIds, activity.responsible, 'trabajador') : null,
        activity.wholeTeam,
        activity.startDate,
        activity.endDate,
        activity.milestone,
        activity.status,
        index + 1,
      ],
    );
    activityIds.set(key(activity.key), activityId);
    add('activities');
    for (const item of activity.items) {
      await db.query(`INSERT INTO activity_items (activity_id, tdr_item_id) VALUES ($1, $2)`, [
        activityId,
        lookup(itemIds, item, 'ítem'),
      ]);
      add('activity_items');
    }
  }
  for (const activity of dataset.activities) {
    if (!activity.dependsOn) continue;
    await db.query(`UPDATE activities SET depends_on_activity_id = $2 WHERE id = $1`, [
      lookup(activityIds, activity.key, 'actividad'),
      lookup(activityIds, activity.dependsOn, 'actividad'),
    ]);
  }

  // 7. Checklist previo y cotizaciones.
  for (const [index, check] of dataset.preEventChecks.entries()) {
    await db.query(
      `INSERT INTO pre_event_checks (project_id, description, worker_id, due_at, result, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        projectId,
        check.description,
        check.responsible ? lookup(workerIds, check.responsible, 'trabajador') : null,
        check.dueAt,
        check.result,
        index + 1,
      ],
    );
    add('pre_event_checks');
  }

  for (const request of dataset.quoteRequests) {
    const requestId = await insertId(
      db,
      `INSERT INTO quote_requests (project_id, supplier_id, rubro, sent_on, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [projectId, lookup(supplierIds, request.supplier, 'proveedor'), request.rubro, request.sentOn, request.status],
    );
    add('quote_requests');
    for (const line of request.lines) {
      await db.query(`INSERT INTO quote_lines (quote_request_id, tdr_item_id, amount, awarded) VALUES ($1, $2, $3, $4)`, [
        requestId,
        lookup(itemIds, line.item, 'ítem'),
        line.amount,
        line.awarded,
      ]);
      add('quote_lines');
    }
  }

  return { seeded: true, extractionId, documentId, previousProject, counts };
}
