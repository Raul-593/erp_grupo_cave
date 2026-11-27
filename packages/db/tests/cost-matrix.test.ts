/**
 * Eventos del proyecto, carga de una matriz de costos, estado operativo y responsable en
 * bloque (migración 0011), contra erp_test y en transacciones revertidas. Datos sintéticos.
 */
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assignResponsibleBulk,
  createPool,
  getConfirmedMatrix,
  getMatrixTotals,
  getPgErrorCode,
  importCostMatrix,
  listMatrixItems,
  listProjectEvents,
  loadDbConfig,
  PgErrorCode,
  setItemMountStatus,
  setItemOperationalStatus,
  validateCostMatrix,
  VersionConflictError,
  type CostMatrixDataset,
  type CostMatrixItem,
} from '../src/index.ts';

const config = loadDbConfig('test');
let pool: pg.Pool;
let client: pg.PoolClient;

beforeAll(() => {
  if (!config.schema.endsWith('_test')) throw new Error('Las pruebas solo pueden ejecutarse sobre un esquema *_test.');
  pool = createPool(config, { max: 2 });
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
});
afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  await client.query('SAVEPOINT intento');
  try {
    await work();
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT intento');
    return error;
  }
  await client.query('RELEASE SAVEPOINT intento');
  return undefined;
}

const item = (fila: number, producto: string, subproducto: string, extra: Partial<CostMatrixItem> = {}): CostMatrixItem => ({
  fila,
  tdrRef: '1',
  productoCodigo: 'CPC 000000001',
  producto,
  productoDescripcion: `Descripción de ${producto}`,
  categoria: 'CATEGORÍA',
  subproducto,
  descripcion: `Especificación de ${subproducto}`,
  proveedor: null,
  dias: '2.00',
  cant: '1.0000',
  unitPrice: null,
  subtotal: null,
  advance1: '0.00',
  advance2: '0.00',
  operationalStatus: null,
  observacion: null,
  ...extra,
});

const dataset = (): CostMatrixDataset => ({
  source: 'matriz-sintetica.xlsx',
  project: {
    name: 'PRUEBA matriz de costos',
    client: 'PRUEBA contratante de costos',
    company: null,
    processCode: 'PRUEBA-001',
    purpose: 'Proyecto sintético',
    venues: ['Sede A', 'Sede B'],
  },
  events: [
    {
      name: 'Sede A',
      scheduleText: '01 ENE (2 jornadas)',
      sortOrder: 0,
      items: [
        item(6, 'Producto uno', 'Sub A1', { proveedor: 'PRUEBA PROVEEDOR UNO', unitPrice: '100.0000', subtotal: '200.00', advance1: '50.00' }),
        item(7, 'Producto uno', 'Sub A2', { subtotal: '0.00' }),
        item(8, 'Producto dos', 'Sub A3', { tdrRef: '2', proveedor: 'prueba proveedor uno', unitPrice: '33.3333', subtotal: '66.67', advance1: '70.00', advance2: '6.67' }),
      ],
    },
    {
      name: 'Sede B',
      scheduleText: null,
      sortOrder: 1,
      items: [
        item(6, 'Producto uno', 'Sub B1', { operationalStatus: 'ready', observacion: 'Proveedor (Excel): PENDIENTE' }),
        item(7, 'Adicionales', 'Sub B2', { tdrRef: null, productoCodigo: null, productoDescripcion: null, subtotal: '10.00' }),
      ],
    },
  ],
});

const document = async (projectId: string) => ({
  storageProvider: 'local' as const,
  storageKey: `tdr/${projectId}/prueba.pdf`,
  originalFilename: 'matriz-desde-excel.pdf',
  sizeBytes: 100,
  sha256: 'a'.repeat(64),
});

async function load() {
  const result = await importCostMatrix(client, { dataset: dataset(), schemaVersion: 'tdr-v1', document });
  if (!result.imported) throw new Error('La carga debía crear el proyecto');
  const events = await listProjectEvents(client, result.projectId);
  const items = await listMatrixItems(client, result.extractionId);
  return { result, events, items };
}

describe('carga de una matriz de costos', () => {
  it('crea proyecto, eventos, matriz confirmada, proveedores y costos', async () => {
    const { result, events, items } = await load();
    expect(result.counts).toMatchObject({ projects: 1, project_events: 2, tdr_items: 5, suppliers: 1, item_plans: 4, item_execution: 1 });
    expect(result.createdSuppliers).toEqual(['PRUEBA PROVEEDOR UNO']);
    expect(events.map((event) => [event.name, event.scheduleText])).toEqual([
      ['Sede A', '01 ENE (2 jornadas)'],
      ['Sede B', null],
    ]);
    const matrix = await getConfirmedMatrix(client, result.projectId);
    expect(matrix).toMatchObject({ extractionId: result.extractionId, provider: 'excel', model: 'matriz-sintetica.xlsx' });

    expect(items.map((row) => [row.itemNumber, row.subproducto, row.eventId === events[0]!.id ? 'A' : 'B'])).toEqual([
      [1, 'Sub A1', 'A'],
      [2, 'Sub A2', 'A'],
      [3, 'Sub A3', 'A'],
      [4, 'Sub B1', 'B'],
      [5, 'Sub B2', 'B'],
    ]);
    expect(items[0]).toMatchObject({
      rubro: 'Producto uno',
      producto: 'Producto uno',
      tdrRef: '1',
      productoCodigo: 'CPC 000000001',
      productoDescripcion: 'Descripción de Producto uno',
      categoria: 'CATEGORÍA',
      supplierName: 'PRUEBA PROVEEDOR UNO',
      plannedCost: '200.00',
      unitPrice: '100.0000',
      advance1: '50.00',
      advance2: '0.00',
      costBalance: '150.00',
      operationalStatus: null,
    });
    // Un anticipo mayor que el subtotal deja saldo negativo, como en el archivo de origen.
    expect(items[2]).toMatchObject({ supplierName: 'PRUEBA PROVEEDOR UNO', costBalance: '-10.00' });
    expect(items[3]).toMatchObject({ operationalStatus: 'ready', plannedCost: null, costBalance: null, observacion: 'Proveedor (Excel): PENDIENTE' });
    expect(items[4]).toMatchObject({ tdrRef: null, productoCodigo: null, plannedCost: '10.00' });
  });

  it('es idempotente: no carga dos veces el mismo proyecto', async () => {
    const { result } = await load();
    const again = await importCostMatrix(client, { dataset: dataset(), schemaVersion: 'tdr-v1', document });
    expect(again).toEqual({ imported: false, projectId: result.projectId });
  });

  it('valida el conjunto antes de escribir', () => {
    const bad = dataset();
    bad.events[0]!.items[0]!.subtotal = '-5.00';
    bad.events[1]!.items[0]!.subproducto = ' ';
    bad.events[1]!.name = 'sede a';
    expect(validateCostMatrix(bad)).toEqual([
      'Sede A, fila 6: subtotal no es un número válido (-5.00).',
      'Evento repetido: sede a.',
      'sede a, fila 6: falta el subproducto.',
    ]);
    expect(validateCostMatrix(dataset())).toEqual([]);
  });

  it('calcula los indicadores por evento', async () => {
    const { result, events } = await load();
    const all = await getMatrixTotals(client, result.extractionId);
    expect(all).toMatchObject({ itemCount: 5, plannedCost: '276.67', advancesAmount: '126.67', costBalance: '150.00', readyCount: 1 });
    const a = await getMatrixTotals(client, result.extractionId, { eventId: events[0]!.id });
    expect(a).toMatchObject({ itemCount: 3, rubroCount: 2, plannedCost: '266.67', advancesAmount: '126.67', costBalance: '140.00', readyCount: 0 });
    const b = await getMatrixTotals(client, result.extractionId, { eventId: events[1]!.id });
    expect(b).toMatchObject({ itemCount: 2, plannedCost: '10.00', advancesAmount: '0.00', costBalance: '10.00', readyCount: 1 });
  });
});

describe('eventos', () => {
  it('rechaza un evento de otro proyecto en un ítem', async () => {
    const { result, events } = await load();
    const project = await client.query<{ id: string }>(
      `INSERT INTO projects (client_id, name) SELECT client_id, 'PRUEBA otro proyecto' FROM projects WHERE id = $1 RETURNING id`,
      [result.projectId],
    );
    const foreign = await client.query<{ id: string }>(`INSERT INTO project_events (project_id, name) VALUES ($1, 'Evento ajeno') RETURNING id`, [
      project.rows[0]!.id,
    ]);
    const insert = (eventId: string) =>
      client.query(
        `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, descripcion, source, event_id)
         VALUES ($1, 99, 'Rubro', 'Producto', '', 'manual', $2)`,
        [result.extractionId, eventId],
      );
    const error = await failure(() => insert(foreign.rows[0]!.id));
    expect(getPgErrorCode(error)).toBe(PgErrorCode.checkViolation);
    expect((error as { constraint?: string }).constraint).toBe('tdr_items_event_same_project');
    // Con un evento del mismo proyecto, lo único que lo impide es que la matriz ya está confirmada.
    const own = await failure(() => insert(events[0]!.id));
    expect((own as { constraint?: string }).constraint).not.toBe('tdr_items_event_same_project');
  });

  it('no admite dos eventos con el mismo nombre en un proyecto', async () => {
    const { result } = await load();
    const error = await failure(() => client.query(`INSERT INTO project_events (project_id, name) VALUES ($1, ' sede a ')`, [result.projectId]));
    expect(getPgErrorCode(error)).toBe(PgErrorCode.uniqueViolation);
  });
});

describe('estado operativo', () => {
  it('se crea y se cambia con control de versión, sin tocar el montaje', async () => {
    const { result, items } = await load();
    const target = items[0]!;
    await setItemOperationalStatus(client, target.id, null, 'in_progress');
    let row = (await listMatrixItems(client, result.extractionId))[0]!;
    expect(row).toMatchObject({ operationalStatus: 'in_progress', mountStatus: 'not_started', executionVersion: 1 });

    await setItemMountStatus(client, target.id, 1, 'on_site');
    await setItemOperationalStatus(client, target.id, 2, 'ready');
    row = (await listMatrixItems(client, result.extractionId))[0]!;
    expect(row).toMatchObject({ operationalStatus: 'ready', mountStatus: 'on_site', executionVersion: 3 });

    expect(await failure(() => setItemOperationalStatus(client, target.id, 1, 'pending'))).toBeInstanceOf(VersionConflictError);
    expect(await failure(() => setItemOperationalStatus(client, target.id, null, 'pending'))).toBeInstanceOf(VersionConflictError);
    const invalid = await failure(() => client.query(`UPDATE item_execution SET operational_status = 'otro' WHERE tdr_item_id = $1`, [target.id]));
    expect(getPgErrorCode(invalid)).toBe(PgErrorCode.checkViolation);
  });
});

describe('responsable en bloque', () => {
  async function worker(name: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(`INSERT INTO workers (full_name) VALUES ($1) RETURNING id`, [name]);
    return rows[0]!.id;
  }

  it('asigna por evento y por producto, respetando «solo sin responsable»', async () => {
    const { result, events } = await load();
    const [ana, luis] = [await worker('PRUEBA Ana'), await worker('PRUEBA Luis')];
    const names = async () => (await listMatrixItems(client, result.extractionId)).map((row) => row.workerName);

    // Un producto del evento A.
    const first = await assignResponsibleBulk(client, result.extractionId, { eventId: events[0]!.id, rubro: 'producto UNO', onlyUnassigned: true }, ana);
    expect(first).toHaveLength(2);
    expect(await names()).toEqual(['PRUEBA Ana', 'PRUEBA Ana', null, null, null]);

    // El resto del evento A, sin pisar lo ya asignado.
    const second = await assignResponsibleBulk(client, result.extractionId, { eventId: events[0]!.id, rubro: null, onlyUnassigned: true }, luis);
    expect(second).toHaveLength(1);
    expect(await names()).toEqual(['PRUEBA Ana', 'PRUEBA Ana', 'PRUEBA Luis', null, null]);

    // Todo el evento A, reemplazando; el evento B no cambia.
    const third = await assignResponsibleBulk(client, result.extractionId, { eventId: events[0]!.id, rubro: null, onlyUnassigned: false }, luis);
    expect(third).toHaveLength(2);
    expect(await names()).toEqual(['PRUEBA Luis', 'PRUEBA Luis', 'PRUEBA Luis', null, null]);
    expect(await assignResponsibleBulk(client, result.extractionId, { eventId: events[0]!.id, rubro: null, onlyUnassigned: false }, luis)).toEqual([]);
  });

  it('rechaza a un trabajador desactivado', async () => {
    const { result, events } = await load();
    const off = await worker('PRUEBA Inactivo');
    await client.query(`UPDATE workers SET active = false WHERE id = $1`, [off]);
    const error = await failure(() => assignResponsibleBulk(client, result.extractionId, { eventId: events[0]!.id, rubro: null, onlyUnassigned: true }, off));
    expect(getPgErrorCode(error)).toBe(PgErrorCode.checkViolation);
  });
});
