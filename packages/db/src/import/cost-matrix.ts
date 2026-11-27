/**
 * Carga de una matriz de costos preparada fuera del sistema (por ejemplo, un Excel) como
 * proyecto nuevo con eventos, matriz confirmada, proveedores y costos por ítem. Los datos
 * entran como un intento con proveedor `excel`: no provienen de una IA ni de un TDR procesado.
 *
 * Todo ocurre dentro de la transacción que recibe: o se carga completo o no se carga nada.
 */
import { randomUUID } from 'node:crypto';
import { OPERATIONAL_STATUSES, type OperationalStatus } from '../domain.ts';
import type { StorageProvider } from '../repositories/documents.ts';
import type { Queryable } from '../repositories/shared.ts';

export const EXCEL_PROVIDER = 'excel';
export const EXCEL_PROMPT_VERSION = 'sin-ia';

export interface CostMatrixItem {
  /** Fila del archivo de origen, para rastrear cada dato. */
  fila: number;
  tdrRef: string | null;
  productoCodigo: string | null;
  producto: string;
  productoDescripcion: string | null;
  categoria: string | null;
  subproducto: string;
  descripcion: string;
  proveedor: string | null;
  /** Decimales exactos como texto. */
  dias: string | null;
  cant: string | null;
  unitPrice: string | null;
  subtotal: string | null;
  advance1: string;
  advance2: string;
  operationalStatus: OperationalStatus | null;
  observacion: string | null;
}

export interface CostMatrixEvent {
  name: string;
  scheduleText: string | null;
  sortOrder: number;
  items: CostMatrixItem[];
}

export interface CostMatrixDataset {
  /** Nombre del archivo de origen. */
  source: string;
  project: {
    name: string;
    client: string;
    company: string | null;
    processCode: string | null;
    purpose: string | null;
    venues: string[];
  };
  events: CostMatrixEvent[];
}

export class CostMatrixImportError extends Error {
  override name = 'CostMatrixImportError';
}

export interface CostMatrixImportOptions {
  dataset: CostMatrixDataset;
  schemaVersion: string;
  /** Construye el documento que acompaña a la matriz una vez conocido el proyecto. */
  document(projectId: string): Promise<{
    storageProvider: StorageProvider;
    storageKey: string;
    originalFilename: string;
    sizeBytes: number;
    sha256: string;
  }>;
}

export type CostMatrixImportResult =
  | { imported: false; projectId: string }
  | {
      imported: true;
      projectId: string;
      extractionId: string;
      documentId: string;
      createdClient: boolean;
      createdSuppliers: string[];
      counts: Record<string, number>;
    };

const DECIMAL = /^-?\d+(\.\d+)?$/;
const key = (value: string) => value.trim().toLocaleLowerCase('es');

/** Comprueba la forma del conjunto antes de escribir nada. Devuelve los problemas encontrados. */
export function validateCostMatrix(dataset: CostMatrixDataset): string[] {
  const issues: string[] = [];
  if (!dataset.project?.name?.trim()) issues.push('Falta el nombre del proyecto.');
  if (!dataset.project?.client?.trim()) issues.push('Falta el contratante.');
  if (!Array.isArray(dataset.events) || dataset.events.length === 0) issues.push('No hay eventos.');
  const names = new Set<string>();
  for (const event of dataset.events ?? []) {
    if (!event.name?.trim()) issues.push('Hay un evento sin nombre.');
    if (names.has(key(event.name ?? ''))) issues.push(`Evento repetido: ${event.name}.`);
    names.add(key(event.name ?? ''));
    if (!Array.isArray(event.items) || event.items.length === 0) issues.push(`El evento ${event.name} no tiene ítems.`);
    for (const item of event.items ?? []) {
      const where = `${event.name}, fila ${item.fila}`;
      if (!item.producto?.trim()) issues.push(`${where}: falta el producto.`);
      if (!item.subproducto?.trim()) issues.push(`${where}: falta el subproducto.`);
      for (const field of ['dias', 'cant', 'unitPrice', 'subtotal', 'advance1', 'advance2'] as const) {
        const value = item[field];
        if (value === null && field !== 'advance1' && field !== 'advance2') continue;
        if (typeof value !== 'string' || !DECIMAL.test(value) || value.startsWith('-')) {
          issues.push(`${where}: ${field} no es un número válido (${String(value)}).`);
        }
      }
      if (item.operationalStatus !== null && !OPERATIONAL_STATUSES.includes(item.operationalStatus)) {
        issues.push(`${where}: estado operativo desconocido (${String(item.operationalStatus)}).`);
      }
    }
  }
  return issues;
}

async function insertId(db: Queryable, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await db.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT sin resultado');
  return id;
}

/** Proyecto con ese nombre para ese contratante, si ya existe (la carga es idempotente). */
export async function findProjectByName(db: Queryable, clientName: string, projectName: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT p.id
       FROM projects p
       JOIN clients c ON c.id = p.client_id
      WHERE lower(btrim(c.name)) = lower(btrim($1)) AND lower(btrim(p.name)) = lower(btrim($2))
      ORDER BY p.created_at
      LIMIT 1`,
    [clientName, projectName],
  );
  return rows[0]?.id ?? null;
}

export async function importCostMatrix(db: Queryable, options: CostMatrixImportOptions): Promise<CostMatrixImportResult> {
  const { dataset } = options;
  const issues = validateCostMatrix(dataset);
  if (issues.length > 0) throw new CostMatrixImportError(`El conjunto de datos no es válido:\n  - ${issues.join('\n  - ')}`);

  // Serializa cargas simultáneas del mismo proyecto.
  await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`cost-matrix:${key(dataset.project.client)}:${key(dataset.project.name)}`]);
  const existing = await findProjectByName(db, dataset.project.client, dataset.project.name);
  if (existing) return { imported: false, projectId: existing };

  const counts: Record<string, number> = {};
  const add = (table: string, amount = 1) => {
    counts[table] = (counts[table] ?? 0) + amount;
  };

  // 1. Contratante (se reutiliza por nombre), empresa (solo si ya existe) y proyecto.
  const client = await db.query<{ id: string }>(`SELECT id FROM clients WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 1`, [
    dataset.project.client,
  ]);
  let clientId = client.rows[0]?.id;
  const createdClient = !clientId;
  if (!clientId) {
    clientId = await insertId(db, `INSERT INTO clients (name) VALUES ($1) RETURNING id`, [dataset.project.client.trim()]);
    add('clients');
  }
  const company = dataset.project.company
    ? await db.query<{ id: string }>(`SELECT id FROM companies WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 1`, [dataset.project.company])
    : { rows: [] };
  const projectId = await insertId(
    db,
    `INSERT INTO projects (client_id, company_id, name, process_code, purpose, venues)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [clientId, company.rows[0]?.id ?? null, dataset.project.name.trim(), dataset.project.processCode, dataset.project.purpose, dataset.project.venues],
  );
  add('projects');

  // 2. Eventos.
  const eventIds = new Map<string, string>();
  for (const event of dataset.events) {
    const id = await insertId(
      db,
      `INSERT INTO project_events (project_id, name, schedule_text, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
      [projectId, event.name.trim(), event.scheduleText, event.sortOrder],
    );
    eventIds.set(key(event.name), id);
    add('project_events');
  }

  // 3. Proveedores: se reutiliza el que ya exista con el mismo nombre; no se fusionan parecidos.
  const supplierIds = new Map<string, string>();
  const createdSuppliers: string[] = [];
  const supplierNames = new Set(dataset.events.flatMap((event) => event.items.map((item) => item.proveedor?.trim())).filter(Boolean) as string[]);
  for (const name of supplierNames) {
    if (supplierIds.has(key(name))) continue;
    const found = await db.query<{ id: string }>(`SELECT id FROM suppliers WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 1`, [name]);
    let id = found.rows[0]?.id;
    if (!id) {
      id = await insertId(db, `INSERT INTO suppliers (name, notes) VALUES ($1, $2) RETURNING id`, [
        name,
        `Creado al cargar «${dataset.source}». Revisar nombre y datos.`,
      ]);
      createdSuppliers.push(name);
      add('suppliers');
    }
    supplierIds.set(key(name), id);
  }

  // 4. Documento de origen e intento (en `processed` mientras se insertan los ítems).
  const document = await options.document(projectId);
  const documentId = await insertId(
    db,
    `INSERT INTO tdr_documents (project_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256, page_count)
     VALUES ($1, $2, $3, $4, 'application/pdf', $5, $6, 1) RETURNING id`,
    [projectId, document.storageProvider, document.storageKey, document.originalFilename, document.sizeBytes, document.sha256],
  );
  add('tdr_documents');
  const itemCount = dataset.events.reduce((total, event) => total + event.items.length, 0);
  const raw = {
    origen: 'excel',
    archivo: dataset.source,
    eventos: dataset.events.map((event) => ({ nombre: event.name, items: event.items.length })),
    total_items: itemCount,
  };
  const extractionId = await insertId(
    db,
    `INSERT INTO tdr_extractions (tdr_document_id, status, idempotency_key, provider, model, prompt_version, schema_version,
                                  raw_response, started_at, finished_at, duration_ms)
     VALUES ($1, 'processed', $2, $3, $4, $5, $6, $7, now(), now(), 0) RETURNING id`,
    [documentId, randomUUID(), EXCEL_PROVIDER, dataset.source, EXCEL_PROMPT_VERSION, options.schemaVersion, JSON.stringify(raw)],
  );
  add('tdr_extractions');

  // 5. Ítems, en el orden del archivo: evento a evento. `rubro` agrupa por producto.
  const pending: { itemId: string; item: CostMatrixItem }[] = [];
  let itemNumber = 0;
  for (const event of dataset.events) {
    const eventId = eventIds.get(key(event.name));
    for (const item of event.items) {
      itemNumber += 1;
      const itemId = await insertId(
        db,
        `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, subproducto, descripcion, cant, unidad, dias,
                                observacion, source, event_id, tdr_ref, producto_codigo, producto_descripcion, categoria)
         VALUES ($1, $2, $3, $3, $4, $5, $6, NULL, $7, $8, 'manual', $9, $10, $11, $12, $13) RETURNING id`,
        [
          extractionId,
          itemNumber,
          item.producto.trim(),
          item.subproducto.trim(),
          item.descripcion,
          item.cant,
          item.dias,
          item.observacion,
          eventId,
          item.tdrRef,
          item.productoCodigo,
          item.productoDescripcion,
          item.categoria,
        ],
      );
      pending.push({ itemId, item });
    }
  }
  add('tdr_items', itemNumber);

  // 6. Confirmar: planificación y ejecución solo aceptan ítems de una matriz confirmada.
  await db.query(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [extractionId]);

  for (const { itemId, item } of pending) {
    const supplierId = item.proveedor ? (supplierIds.get(key(item.proveedor)) ?? null) : null;
    const hasPlan = supplierId !== null || item.subtotal !== null || item.unitPrice !== null || item.advance1 !== '0.00' || item.advance2 !== '0.00';
    if (hasPlan) {
      await db.query(
        `INSERT INTO item_plans (tdr_item_id, supplier_id, planned_cost, unit_price, advance_1, advance_2)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [itemId, supplierId, item.subtotal, item.unitPrice, item.advance1, item.advance2],
      );
      add('item_plans');
    }
    if (item.operationalStatus && item.operationalStatus !== 'pending') {
      await db.query(`INSERT INTO item_execution (tdr_item_id, operational_status) VALUES ($1, $2)`, [itemId, item.operationalStatus]);
      add('item_execution');
    }
  }

  return { imported: true, projectId, extractionId, documentId, createdClient, createdSuppliers, counts };
}
