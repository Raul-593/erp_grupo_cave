/**
 * Carga de la demostración y consultas de los módulos nuevos, contra erp_test y en
 * transacciones revertidas. El conjunto de datos de estas pruebas es sintético: no es el del
 * prototipo (que no se versiona).
 */
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildDemoRawResponse,
  createPool,
  DEMO_PROVIDER,
  DemoSeedError,
  findDemoExtraction,
  getConfirmedMatrix,
  getMatrixTotals,
  getPgErrorCode,
  getProject,
  listActivities,
  listMatrixItems,
  listPayments,
  listPreEventChecks,
  listQuoteLines,
  listQuoteRequests,
  listSuppliers,
  loadDbConfig,
  PgErrorCode,
  seedDemo,
  type DemoDataset,
  type DemoSeedOptions,
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

function dataset(): DemoDataset {
  return {
    source: 'datos-sinteticos-de-prueba',
    ficha: {
      contratante: 'Contratante sintético',
      ruc_contratante: null,
      codigo_proceso: 'PROCESO-SINTETICO-001',
      objeto: 'Servicio sintético',
      monto: 1000.5,
      moneda: 'USD',
      incluye_iva: null,
      sedes: ['Sede A', 'Sede B'],
      fecha_inicio: '2026-12-01',
      fecha_fin: '2026-12-05',
      plazo: '1 al 5 de diciembre',
      administrador_contrato: 'Administrador sintético',
      observacion: 'Datos sintéticos de prueba.',
    },
    company: 'Empresa sintética',
    workers: ['Persona Uno', 'Persona Dos'],
    suppliers: [
      { name: 'Proveedor Uno', kind: 'external' },
      { name: 'Proveedor Grupo', kind: 'holding' },
      { name: 'Nómina', kind: 'payroll' },
    ],
    items: [
      {
        key: 'a',
        rubro: 'Rubro uno',
        producto: 'Producto A',
        subproducto: 'Sub A',
        descripcion: 'Descripción A',
        cant: 2,
        unidad: 'u',
        dias: 3,
        observacion: null,
        responsible: 'Persona Uno',
        plan: { supplier: 'Proveedor Uno', cost: 100, contract: 'signed' },
        order: { code: 'OC-1', amount: 100, paidBy: 'Persona Dos' },
        mountStatus: 'mounted',
      },
      {
        key: 'b',
        rubro: 'Rubro uno',
        producto: 'Producto B',
        subproducto: null,
        descripcion: 'Descripción B',
        cant: 1.5,
        unidad: null,
        dias: null,
        observacion: 'Observación B',
        responsible: 'Persona Uno',
        plan: { supplier: 'Proveedor Grupo', cost: 200.25, contract: 'signed' },
        order: { code: 'OC-1', amount: 200.25, paidBy: 'Persona Dos' },
        mountStatus: 'on_site',
      },
      {
        key: 'c',
        rubro: 'Rubro dos',
        producto: 'Producto C',
        subproducto: null,
        descripcion: 'Descripción C',
        cant: null,
        unidad: null,
        dias: null,
        observacion: null,
        responsible: 'Persona Dos',
        plan: { supplier: 'Proveedor Uno', cost: 300, contract: 'pending' },
        order: { code: 'OC-2', amount: 300, paidBy: null },
        mountStatus: 'in_warehouse',
      },
      {
        key: 'd',
        rubro: 'Rubro dos',
        producto: 'Producto D',
        subproducto: null,
        descripcion: 'Descripción D',
        cant: 4,
        unidad: 'p/día',
        dias: 1,
        observacion: null,
        responsible: null,
        plan: { supplier: 'Nómina', cost: 40, contract: 'not_required' },
        order: null,
        mountStatus: null,
      },
    ],
    payments: [
      {
        order: 'OC-1',
        paidOn: '2026-12-02',
        concept: 'Anticipo',
        method: 'transfer',
        amount: 250.25,
        support: 'invoice_and_receipt',
        allocations: [
          { item: 'a', amount: 50 },
          { item: 'b', amount: 200.25 },
        ],
      },
      // Pago sin repartir: no cambia lo pagado de ningún ítem.
      { order: 'OC-2', paidOn: '2026-12-01', concept: 'Flete', method: 'cash', amount: 10, support: 'none', allocations: [] },
    ],
    activities: [
      {
        key: 'montaje',
        name: 'Montaje',
        responsible: 'Persona Uno',
        wholeTeam: false,
        startDate: '2026-12-02',
        endDate: '2026-12-03',
        milestone: false,
        status: 'in_progress',
        dependsOn: 'traslado',
        items: ['b', 'a'],
      },
      {
        key: 'traslado',
        name: 'Traslado',
        responsible: 'Persona Dos',
        wholeTeam: false,
        startDate: '2026-12-01',
        endDate: '2026-12-01',
        milestone: false,
        status: null,
        dependsOn: null,
        items: ['a'],
      },
      {
        key: 'evento',
        name: 'Evento',
        responsible: null,
        wholeTeam: true,
        startDate: '2026-12-04',
        endDate: '2026-12-04',
        milestone: true,
        status: null,
        dependsOn: null,
        items: [],
      },
    ],
    preEventChecks: [
      { description: 'Control uno', responsible: 'Persona Uno', dueAt: '2026-12-03T18:00:00-05:00', result: 'pass' },
      { description: 'Control dos', responsible: null, dueAt: null, result: 'fail' },
    ],
    quoteRequests: [
      {
        supplier: 'Proveedor Uno',
        rubro: 'Rubro uno',
        sentOn: '2026-11-30',
        status: 'quoted',
        lines: [
          { item: 'a', amount: 100, awarded: true },
          { item: 'b', amount: 210, awarded: false },
        ],
      },
      { supplier: 'Proveedor Grupo', rubro: 'Rubro uno', sentOn: null, status: 'manual_proforma', lines: [{ item: 'b', amount: 200.25, awarded: true }] },
    ],
  };
}

const sha = (char: string) => char.repeat(64);

async function seedProject(): Promise<{ projectId: string; clientId: string }> {
  const client1 = await client.query<{ id: string }>(`INSERT INTO clients (name) VALUES ('Contratante previo') RETURNING id`);
  const clientId = client1.rows[0]!.id;
  const project = await client.query<{ id: string }>(
    `INSERT INTO projects (client_id, name, venues, start_date, end_date) VALUES ($1, 'Proyecto de prueba', '{Sede previa}', '2026-11-26', '2026-11-27') RETURNING id`,
    [clientId],
  );
  return { projectId: project.rows[0]!.id, clientId };
}

function options(projectId: string, data: DemoDataset = dataset(), char = 'a'): DemoSeedOptions {
  return {
    projectId,
    dataset: data,
    schemaVersion: 'tdr-v1',
    document: {
      storageProvider: 'local',
      storageKey: `tdr/${projectId}/demo-${char}.pdf`,
      originalFilename: 'demostracion.pdf',
      sizeBytes: 600,
      sha256: sha(char),
    },
  };
}

describe('carga de la demostración', () => {
  it('construye el JSON con la forma del contrato y numeración secuencial', () => {
    const raw = buildDemoRawResponse(dataset());
    expect(Object.keys(raw)).toEqual(['ficha', 'items']);
    expect(raw.items.map((row) => row.item)).toEqual([1, 2, 3, 4]);
    expect(Object.keys(raw.items[0]!)).toEqual([
      'item',
      'rubro',
      'producto',
      'subproducto',
      'descripcion',
      'cant',
      'unidad',
      'dias',
      'observacion',
    ]);
    expect(Object.keys(raw.ficha)).toHaveLength(13);
  });

  it('carga todas las tablas, confirma la matriz y aplica la ficha sin cambiar el nombre', async () => {
    const { projectId, clientId } = await seedProject();
    const result = await seedDemo(client, options(projectId));
    if (!result.seeded) throw new Error('No se cargó la demostración');

    expect(result.counts).toEqual({
      companies: 1,
      clients: 1,
      workers: 2,
      suppliers: 3,
      tdr_documents: 1,
      tdr_extractions: 1,
      tdr_items: 4,
      tdr_item_assignments: 3,
      item_plans: 4,
      purchase_orders: 2,
      purchase_order_lines: 3,
      item_execution: 3,
      payments: 2,
      payment_allocations: 2,
      activities: 3,
      activity_items: 3,
      pre_event_checks: 2,
      quote_requests: 2,
      quote_lines: 3,
    });
    expect(result.previousProject).toMatchObject({
      name: 'Proyecto de prueba',
      clientId,
      clientName: 'Contratante previo',
      venues: ['Sede previa'],
      startDate: '2026-11-26',
      endDate: '2026-11-27',
      contractAmount: null,
    });

    const project = await getProject(client, projectId);
    expect(project).toMatchObject({
      name: 'Proyecto de prueba',
      clientName: 'Contratante sintético',
      processCode: 'PROCESO-SINTETICO-001',
      contractAmount: '1000.50',
      currency: 'USD',
      venues: ['Sede A', 'Sede B'],
      startDate: '2026-12-01',
      endDate: '2026-12-05',
      termText: '1 al 5 de diciembre',
      fichaExtractionId: result.extractionId,
    });
    expect(project?.companyId).not.toBeNull();

    const matrix = await getConfirmedMatrix(client, projectId);
    expect(matrix).toMatchObject({ extractionId: result.extractionId, provider: DEMO_PROVIDER, model: 'datos-sinteticos-de-prueba' });
    const stored = await client.query<{ status: string; raw: unknown; n: number }>(
      `SELECT status, raw_response AS raw, (SELECT count(*)::int FROM tdr_items i WHERE i.extraction_id = x.id AND i.source = 'ai') AS n
         FROM tdr_extractions x WHERE id = $1`,
      [result.extractionId],
    );
    expect(stored.rows[0]).toEqual({ status: 'confirmed', raw: buildDemoRawResponse(dataset()), n: 4 });
  });

  it('expone la matriz con responsable, plan, orden, pago calculado y montaje', async () => {
    const { projectId } = await seedProject();
    const result = await seedDemo(client, options(projectId));
    const items = await listMatrixItems(client, result.extractionId);
    expect(items.map((row) => [row.itemNumber, row.rubro, row.producto])).toEqual([
      [1, 'Rubro uno', 'Producto A'],
      [2, 'Rubro uno', 'Producto B'],
      [3, 'Rubro dos', 'Producto C'],
      [4, 'Rubro dos', 'Producto D'],
    ]);
    expect(items[0]).toMatchObject({
      cant: '2.0000',
      dias: '3.00',
      workerName: 'Persona Uno',
      supplierName: 'Proveedor Uno',
      supplierKind: 'external',
      plannedCost: '100.00',
      contractStatus: 'signed',
      activityCount: 2,
      orderCode: 'OC-1',
      orderAmount: '100.00',
      paidAmount: '50.00',
      balance: '50.00',
      paymentStatus: 'partial',
      paymentWorkerName: 'Persona Dos',
      mountStatus: 'mounted',
      evidenceCount: 0,
    });
    expect(items.map((row) => row.paymentStatus)).toEqual(['partial', 'paid', 'unpaid', 'no_order']);
    expect(items[3]).toMatchObject({ workerName: null, supplierKind: 'payroll', orderCode: null, balance: null, mountStatus: null });
  });

  it('calcula los indicadores a partir de las filas', async () => {
    const { projectId } = await seedProject();
    const result = await seedDemo(client, options(projectId));
    expect(await getMatrixTotals(client, result.extractionId)).toEqual({
      itemCount: 4,
      rubroCount: 2,
      responsibleCount: 2,
      unassignedCount: 1,
      supplierCount: 2,
      holdingSupplierCount: 1,
      plannedCost: '640.25',
      advancesAmount: '0.00',
      costBalance: '640.25',
      orderCount: 2,
      orderedAmount: '600.25',
      paidAmount: '250.25',
      balance: '350.00',
      unorderedCost: '40.00',
      outstandingAmount: '390.00',
      holdingAmount: '200.25',
      paymentsAmount: '260.25',
      unallocatedPayments: '10.00',
      fullyPaidCount: 1,
      mountedCount: 1,
      readyCount: 0,
      itemsWithEvidence: 0,
      evidenceCount: 0,
    });
  });

  it('expone actividades, pagos, checklist y cotizaciones', async () => {
    const { projectId } = await seedProject();
    const result = await seedDemo(client, options(projectId));
    const items = await listMatrixItems(client, result.extractionId);
    const id = (producto: string) => items.find((row) => row.producto === producto)!.id;

    const activities = await listActivities(client, projectId);
    expect(activities.map((a) => a.name)).toEqual(['Traslado', 'Montaje', 'Evento']);
    expect(activities[1]).toMatchObject({
      workerName: 'Persona Uno',
      startDate: '2026-12-02',
      endDate: '2026-12-03',
      status: 'in_progress',
      dependsOnName: 'Traslado',
      itemIds: [id('Producto A'), id('Producto B')],
    });
    expect(activities[2]).toMatchObject({ wholeTeam: true, isMilestone: true, workerName: null, status: null, itemIds: [] });

    const payments = await listPayments(client, projectId);
    expect(payments.map((p) => [p.paidOn, p.orderCode, p.method, p.amount, p.support])).toEqual([
      ['2026-12-01', 'OC-2', 'cash', '10.00', 'none'],
      ['2026-12-02', 'OC-1', 'transfer', '250.25', 'invoice_and_receipt'],
    ]);
    expect(payments.map((p) => [p.allocatedAmount, p.unallocatedAmount, p.itemIds])).toEqual([
      ['0.00', '10.00', []],
      ['250.25', '0.00', [id('Producto A'), id('Producto B')]],
    ]);

    const checks = await listPreEventChecks(client, projectId);
    expect(checks.map((c) => [c.description, c.workerName, c.result])).toEqual([
      ['Control uno', 'Persona Uno', 'pass'],
      ['Control dos', null, 'fail'],
    ]);
    expect(checks[0]?.dueAt?.toISOString()).toBe('2026-12-03T23:00:00.000Z');

    expect((await listQuoteRequests(client, projectId)).map((q) => [q.supplierName, q.status, q.sentOn, q.lineCount])).toEqual([
      ['Proveedor Grupo', 'manual_proforma', null, 1],
      ['Proveedor Uno', 'quoted', '2026-11-30', 2],
    ]);
    expect((await listQuoteLines(client, projectId)).map((l) => [l.itemNumber, l.supplierName, l.amount, l.awarded])).toEqual([
      [1, 'Proveedor Uno', '100.00', true],
      [2, 'Proveedor Grupo', '200.25', true],
      [2, 'Proveedor Uno', '210.00', false],
    ]);
    expect((await listSuppliers(client)).filter((s) => ['Proveedor Uno', 'Proveedor Grupo', 'Nómina'].includes(s.name))).toHaveLength(3);
  });

  it('no carga dos veces el mismo proyecto y reutiliza trabajadores y proveedores existentes', async () => {
    const { projectId } = await seedProject();
    await client.query(`INSERT INTO workers (full_name) VALUES ('persona uno')`);
    await client.query(`INSERT INTO suppliers (name, kind) VALUES ('PROVEEDOR UNO', 'external')`);
    const first = await seedDemo(client, options(projectId));
    if (!first.seeded) throw new Error('No se cargó la demostración');
    expect(first.counts).toMatchObject({ workers: 1, suppliers: 2 });
    expect(await findDemoExtraction(client, projectId)).toBe(first.extractionId);

    const second = await seedDemo(client, options(projectId, dataset(), 'b'));
    expect(second).toEqual({ seeded: false, extractionId: first.extractionId });
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tdr_documents WHERE project_id = $1`,
      [projectId],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('rechaza datos con referencias inexistentes antes de escribir', async () => {
    const { projectId } = await seedProject();
    const broken = dataset();
    broken.items[0]!.responsible = 'Persona inexistente';
    await expect(seedDemo(client, options(projectId, broken))).rejects.toBeInstanceOf(DemoSeedError);
    const repeated = dataset();
    repeated.items[1]!.key = 'A';
    await expect(seedDemo(client, options(projectId, repeated))).rejects.toThrow(/repetido/);
    // Un pago solo se reparte entre ítems de su propia orden.
    const foreign = dataset();
    foreign.payments[1]!.allocations = [{ item: 'a', amount: 5 }];
    await expect(seedDemo(client, options(projectId, foreign))).rejects.toThrow(/no es de la orden OC-2/);
    await expect(seedDemo(client, options('00000000-0000-4000-8000-000000000000'))).rejects.toThrow(/no existe/);
    expect(await findDemoExtraction(client, projectId)).toBeNull();
  });

  it('deja la matriz de demostración protegida como cualquier confirmada', async () => {
    const { projectId } = await seedProject();
    const result = await seedDemo(client, options(projectId));
    await client.query('SAVEPOINT protegida');
    const error = await client.query(`DELETE FROM tdr_items WHERE extraction_id = $1`, [result.extractionId]).catch((e: unknown) => e);
    await client.query('ROLLBACK TO SAVEPOINT protegida');
    expect([PgErrorCode.checkViolation, PgErrorCode.restrictViolation]).toContain(getPgErrorCode(error));
  });
});
