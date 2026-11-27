/**
 * Edición de órdenes y pagos, contra erp_test y en transacciones revertidas. Datos sintéticos.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  allocateExistingPayment,
  BusinessRuleError,
  createEvidence,
  deleteEvidence,
  findEvidenceByHash,
  getEvidenceFile,
  listItemEvidences,
  createPayment,
  createPool,
  createPurchaseOrder,
  deletePayment,
  getMatrixTotals,
  getPayment,
  getPgErrorCode,
  getPurchaseOrderProjectId,
  listManualPaidLines,
  listMatrixItems,
  listOrderLines,
  listPayments,
  listPurchaseOrders,
  loadDbConfig,
  PgErrorCode,
  resetManualPaidAmounts,
  saveItemPlan,
  setItemOrder,
  updateOrderLine,
  updatePayment,
  VersionConflictError,
  type PaymentInput,
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

async function id(sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await client.query<{ id: string }>(sql, params);
  return rows[0]!.id;
}

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

/** Proyecto con una matriz confirmada de dos ítems. */
async function seed(char = 'a'): Promise<{ projectId: string; extractionId: string; items: [string, string] }> {
  const clientId = await id(`INSERT INTO clients (name) VALUES ('Contratante sintético') RETURNING id`);
  const projectId = await id(`INSERT INTO projects (client_id, name) VALUES ($1, 'Proyecto sintético') RETURNING id`, [clientId]);
  const documentId = await id(
    `INSERT INTO tdr_documents (project_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256)
     VALUES ($1, 'local', $2, 'tdr.pdf', 'application/pdf', 10, $3) RETURNING id`,
    [projectId, `tdr/${randomUUID()}.pdf`, char.repeat(64)],
  );
  const extractionId = await id(
    `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version, status, raw_response)
     VALUES ($1, $2, 'prueba', 'modelo', 'v1', 'v1', 'processed', '{"items":[]}') RETURNING id`,
    [documentId, randomUUID()],
  );
  const item = (n: number) =>
    id(
      `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, descripcion, source)
       VALUES ($1, $2, 'Rubro', 'Producto', 'Descripción', 'manual') RETURNING id`,
      [extractionId, n],
    );
  const items: [string, string] = [await item(1), await item(2)];
  await client.query(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [extractionId]);
  return { projectId, extractionId, items };
}

const line = async (extractionId: string, index = 0) => {
  const item = (await listMatrixItems(client, extractionId))[index]!;
  return [item.orderCode, item.orderAmount, item.paidAmount, item.balance, item.paymentStatus, item.lineVersion];
};

const input = (orderId: string, overrides: Partial<PaymentInput> = {}): PaymentInput => ({
  orderId,
  paidOn: '2026-12-01',
  concept: 'Anticipo',
  method: 'transfer',
  amount: '250.50',
  support: 'invoice_and_receipt',
  allocations: [],
  ...overrides,
});

/** Regla de negocio que incumple la operación (y el ítem al que se refiere), o el error tal cual. */
async function rule(work: () => Promise<unknown>): Promise<unknown> {
  const error = await failure(work);
  return error instanceof BusinessRuleError ? [error.rule, error.itemId] : error;
}

describe('órdenes de compra', () => {
  it('crea órdenes con código único por proyecto', async () => {
    const { projectId } = await seed();
    const orderId = await createPurchaseOrder(client, projectId, 'OC-001');
    expect(await getPurchaseOrderProjectId(client, orderId)).toBe(projectId);
    expect(await getPurchaseOrderProjectId(client, randomUUID())).toBeNull();
    expect(getPgErrorCode(await failure(() => createPurchaseOrder(client, projectId, 'OC-001')))).toBe(PgErrorCode.uniqueViolation);
    expect(await listPurchaseOrders(client, projectId)).toEqual([{ id: orderId, code: 'OC-001', lineCount: 0, paymentCount: 0 }]);
  });

  it('pone un ítem en una orden con su costo asignado, lo cambia de orden y lo quita', async () => {
    const { projectId, extractionId, items } = await seed();
    const first = await createPurchaseOrder(client, projectId, 'OC-001');
    const second = await createPurchaseOrder(client, projectId, 'OC-002');
    await saveItemPlan(client, items[0], null, { plannedCost: '8400.50' });

    await setItemOrder(client, items[0], null, first);
    expect(await line(extractionId)).toEqual(['OC-001', '8400.50', '0.00', '8400.50', 'unpaid', 1]);
    // Un ítem sin costo asignado entra con monto cero.
    await setItemOrder(client, items[1], null, first);
    expect(await line(extractionId, 1)).toEqual(['OC-001', '0.00', '0.00', '0.00', 'unpaid', 1]);

    await setItemOrder(client, items[0], 1, second);
    expect((await line(extractionId))[0]).toBe('OC-002');
    expect(await failure(() => setItemOrder(client, items[0], 1, first))).toBeInstanceOf(VersionConflictError);
    expect(await failure(() => setItemOrder(client, items[0], null, first))).toBeInstanceOf(VersionConflictError);

    await setItemOrder(client, items[0], 2, null);
    expect(await line(extractionId)).toEqual([null, null, null, null, 'no_order', null]);
    await setItemOrder(client, items[0], null, null);
  });

  it('no quita ni cambia de orden un ítem con pagos, ni acepta una orden de otro proyecto', async () => {
    const a = await seed();
    const b = await seed('b');
    const order = await createPurchaseOrder(client, a.projectId, 'OC-001');
    const other = await createPurchaseOrder(client, a.projectId, 'OC-002');
    const foreign = await createPurchaseOrder(client, b.projectId, 'OC-001');
    expect(getPgErrorCode(await failure(() => setItemOrder(client, a.items[0], null, foreign)))).toBe(PgErrorCode.checkViolation);

    await setItemOrder(client, a.items[0], null, order);
    await updateOrderLine(client, a.items[0], 1, { amount: '100' });
    expect(getPgErrorCode(await failure(() => setItemOrder(client, a.items[0], 2, foreign)))).toBe(PgErrorCode.checkViolation);
    // El pago sube la versión de la línea: lo pagado se recalcula en la misma operación.
    const paymentId = await createPayment(client, input(order, { amount: '40', allocations: [{ itemId: a.items[0], amount: '40' }] }));
    expect(await line(a.extractionId)).toEqual(['OC-001', '100.00', '40.00', '60.00', 'partial', 3]);
    for (const target of [null, other]) {
      expect(await rule(() => setItemOrder(client, a.items[0], 3, target))).toEqual(['line_has_payments', a.items[0]]);
    }
    expect(await failure(() => setItemOrder(client, a.items[0], 2, null))).toBeInstanceOf(VersionConflictError);

    // Quitado el reparto del pago, el ítem vuelve a poder moverse y quitarse.
    await updatePayment(client, paymentId, 1, input(order, { amount: '40' }));
    await setItemOrder(client, a.items[0], 4, other);
    await setItemOrder(client, a.items[0], 5, null);
    expect(await line(a.extractionId)).toEqual([null, null, null, null, 'no_order', null]);
  });

  it('edita monto y responsable de pago sin bajar el costo por debajo de lo pagado', async () => {
    const { projectId, extractionId, items } = await seed();
    const order = await createPurchaseOrder(client, projectId, 'OC-001');
    const person = await id(`INSERT INTO workers (full_name) VALUES ('Persona Uno') RETURNING id`);
    await setItemOrder(client, items[0], null, order);

    await updateOrderLine(client, items[0], 1, { amount: '1000' });
    await updateOrderLine(client, items[0], 2, { paymentWorkerId: person });
    expect(await line(extractionId)).toEqual(['OC-001', '1000.00', '0.00', '1000.00', 'unpaid', 3]);
    expect((await listMatrixItems(client, extractionId))[0]?.paymentWorkerName).toBe('Persona Uno');
    // Lo pagado ya no es un campo editable de la línea: un parche que lo incluya no cambia nada.
    await updateOrderLine(client, items[0], 3, { paidAmount: '500' } as never);
    expect(await line(extractionId)).toEqual(['OC-001', '1000.00', '0.00', '1000.00', 'unpaid', 3]);

    await createPayment(client, input(order, { amount: '400.25', allocations: [{ itemId: items[0], amount: '400.25' }] }));
    expect(await line(extractionId)).toEqual(['OC-001', '1000.00', '400.25', '599.75', 'partial', 4]);
    expect(await rule(() => updateOrderLine(client, items[0], 4, { amount: '400.24' }))).toEqual(['paid_exceeds_amount', items[0]]);
    expect(await failure(() => updateOrderLine(client, items[0], 3, { amount: '2000' }))).toBeInstanceOf(VersionConflictError);
    await updateOrderLine(client, items[0], 4, { amount: '400.25' });
    expect(await line(extractionId)).toEqual(['OC-001', '400.25', '400.25', '0.00', 'paid', 5]);
    expect(await getMatrixTotals(client, extractionId)).toMatchObject({
      orderedAmount: '400.25',
      paidAmount: '400.25',
      balance: '0.00',
      paymentsAmount: '400.25',
      unallocatedPayments: '0.00',
      fullyPaidCount: 1,
    });
  });
});

describe('fotografías de evidencia', () => {
  const photo = (itemId: string, char: string, overrides: Record<string, unknown> = {}) => ({
    itemId,
    storageProvider: 'local' as const,
    storageKey: `evidencias/p/${itemId}/${char}.jpg`,
    originalFilename: `foto-${char}.jpg`,
    mimeType: 'image/jpeg' as const,
    sizeBytes: 2048,
    sha256: char.repeat(64),
    description: null,
    ...overrides,
  });

  it('registra, lista, encuentra duplicados y elimina; los indicadores cuentan las fotos', async () => {
    const { extractionId, items } = await seed();
    const first = await createEvidence(client, photo(items[0], 'a', { description: 'Estructura montada' }));
    await createEvidence(client, photo(items[0], 'b', { mimeType: 'image/png' }));
    await createEvidence(client, photo(items[1], 'a'));

    const list = await listItemEvidences(client, items[0]);
    expect(list.map((e) => [e.originalFilename, e.mimeType, e.sizeBytes, e.description]).sort()).toEqual([
      ['foto-a.jpg', 'image/jpeg', 2048, 'Estructura montada'],
      ['foto-b.jpg', 'image/png', 2048, null],
    ]);
    expect(list[0]).not.toHaveProperty('storageKey');
    expect(await findEvidenceByHash(client, items[0], 'a'.repeat(64))).toEqual({ id: first, originalFilename: 'foto-a.jpg' });
    expect(await findEvidenceByHash(client, items[0], 'c'.repeat(64))).toBeNull();
    expect(await getEvidenceFile(client, first)).toMatchObject({ itemId: items[0], storageProvider: 'local', storageKey: `evidencias/p/${items[0]}/a.jpg` });
    expect(await getMatrixTotals(client, extractionId)).toMatchObject({ itemsWithEvidence: 2, evidenceCount: 3 });
    expect((await listMatrixItems(client, extractionId)).map((i) => i.evidenceCount)).toEqual([2, 1]);

    expect(await deleteEvidence(client, first)).toEqual({ storageProvider: 'local', storageKey: `evidencias/p/${items[0]}/a.jpg` });
    expect(await deleteEvidence(client, first)).toBeNull();
    expect(await getEvidenceFile(client, first)).toBeNull();
    expect(await getMatrixTotals(client, extractionId)).toMatchObject({ itemsWithEvidence: 2, evidenceCount: 2 });
  });

  it('rechaza la misma foto en el mismo ítem y los tipos que no son imagen', async () => {
    const { items } = await seed();
    await createEvidence(client, photo(items[0], 'a'));
    expect(getPgErrorCode(await failure(() => createEvidence(client, photo(items[0], 'a', { storageKey: 'evidencias/p/otra.jpg' }))))).toBe(
      PgErrorCode.uniqueViolation,
    );
    expect(getPgErrorCode(await failure(() => createEvidence(client, photo(items[0], 'b', { mimeType: 'application/pdf' }))))).toBe(
      PgErrorCode.checkViolation,
    );
  });
});

describe('pagos y su reparto', () => {
  /** Orden OC-001 con los dos ítems (costos 100 y 50) y una segunda orden vacía. */
  async function seedOrder() {
    const base = await seed();
    const order = await createPurchaseOrder(client, base.projectId, 'OC-001');
    const other = await createPurchaseOrder(client, base.projectId, 'OC-002');
    await setItemOrder(client, base.items[0], null, order);
    await setItemOrder(client, base.items[1], null, order);
    await updateOrderLine(client, base.items[0], 1, { amount: '100' });
    await updateOrderLine(client, base.items[1], 1, { amount: '50' });
    return { ...base, order, other };
  }
  const paid = async (extractionId: string) =>
    (await listMatrixItems(client, extractionId)).map((item) => [item.paidAmount, item.balance, item.paymentStatus]);

  it('registra, corrige y elimina un pago con su reparto y control de versión', async () => {
    const { projectId, extractionId, items, order } = await seedOrder();
    const allocations = [
      { itemId: items[0], amount: '100.00' },
      { itemId: items[1], amount: '20.50' },
    ];
    const paymentId = await createPayment(client, input(order, { allocations }));
    expect(await getPayment(client, paymentId)).toEqual({ id: paymentId, projectId, ...input(order, { allocations }), version: 1 });
    expect(await paid(extractionId)).toEqual([
      ['100.00', '0.00', 'paid'],
      ['20.50', '29.50', 'partial'],
    ]);
    expect((await listPayments(client, projectId)).map((p) => [p.amount, p.allocatedAmount, p.unallocatedAmount, p.itemIds])).toEqual([
      ['250.50', '120.50', '130.00', [items[0], items[1]]],
    ]);
    expect(await getMatrixTotals(client, extractionId)).toMatchObject({
      paidAmount: '120.50',
      balance: '29.50',
      paymentsAmount: '250.50',
      unallocatedPayments: '130.00',
      fullyPaidCount: 1,
    });

    // Corregirlo sustituye el reparto: lo pagado de cada ítem cambia en la misma operación.
    await updatePayment(
      client,
      paymentId,
      1,
      input(order, { amount: '60', method: 'cash', support: 'none', concept: 'Flete', allocations: [{ itemId: items[1], amount: '50' }] }),
    );
    expect(await paid(extractionId)).toEqual([
      ['0.00', '100.00', 'unpaid'],
      ['50.00', '0.00', 'paid'],
    ]);
    expect(
      (await listPayments(client, projectId)).map((p) => [p.orderCode, p.amount, p.method, p.support, p.concept, p.version, p.unallocatedAmount]),
    ).toEqual([['OC-001', '60.00', 'cash', 'none', 'Flete', 2, '10.00']]);
    expect(await failure(() => updatePayment(client, paymentId, 1, input(order)))).toBeInstanceOf(VersionConflictError);
    expect(await failure(() => deletePayment(client, paymentId, 1))).toBeInstanceOf(VersionConflictError);

    await deletePayment(client, paymentId, 2);
    expect(await getPayment(client, paymentId)).toBeNull();
    expect(await listPayments(client, projectId)).toEqual([]);
    expect(await paid(extractionId)).toEqual([
      ['0.00', '100.00', 'unpaid'],
      ['0.00', '50.00', 'unpaid'],
    ]);
    expect(await getMatrixTotals(client, extractionId)).toMatchObject({ paidAmount: '0.00', paymentsAmount: '0.00', unallocatedPayments: '0.00' });
  });

  it('suma los pagos de un mismo ítem y lista las líneas con su saldo para repartir', async () => {
    const { projectId, items, order } = await seedOrder();
    await createPayment(client, input(order, { amount: '30', allocations: [{ itemId: items[0], amount: '30' }] }));
    await createPayment(
      client,
      input(order, {
        amount: '45',
        allocations: [
          { itemId: items[0], amount: '25' },
          { itemId: items[1], amount: '20' },
        ],
      }),
    );
    expect((await listOrderLines(client, projectId)).map((l) => [l.orderId, l.itemId, l.itemNumber, l.amount, l.paidAmount])).toEqual([
      [order, items[0], 1, '100.00', '55.00'],
      [order, items[1], 2, '50.00', '20.00'],
    ]);
  });

  it('rechaza pagar más que el costo del ítem, repartir más que el pago y repartir a otra orden', async () => {
    const { extractionId, items, order, other } = await seedOrder();
    const first = await createPayment(client, input(order, { amount: '80', allocations: [{ itemId: items[0], amount: '80' }] }));

    // Al ítem le quedan 20 de saldo: para pagarle más hay que subir antes su costo.
    const over = input(order, { amount: '30', allocations: [{ itemId: items[0], amount: '20.01' }] });
    expect(await rule(() => createPayment(client, over))).toEqual(['allocation_exceeds_balance', items[0]]);
    await updateOrderLine(client, items[0], 3, { amount: '100.01' });
    const second = await createPayment(client, over);
    expect((await paid(extractionId))[0]).toEqual(['100.01', '0.00', 'paid']);
    // Al corregir un pago, su propio reparto anterior no cuenta contra el saldo.
    await updatePayment(client, second, 1, over);
    const tooMuch = input(order, { amount: '30', allocations: [{ itemId: items[0], amount: '20.02' }] });
    expect(await rule(() => updatePayment(client, second, 2, tooMuch))).toEqual(['allocation_exceeds_balance', items[0]]);

    const beyondPayment = input(order, { amount: '10', allocations: [{ itemId: items[1], amount: '10.01' }] });
    expect(await rule(() => createPayment(client, beyondPayment))).toEqual(['allocation_exceeds_payment', null]);
    const lowered = input(order, { amount: '79.99', allocations: [{ itemId: items[0], amount: '80' }] });
    expect(await rule(() => updatePayment(client, first, 1, lowered))).toEqual(['allocation_exceeds_payment', null]);
    // Ítem de otra orden, o que no está en ninguna.
    const otherOrder = input(other, { allocations: [{ itemId: items[1], amount: '1' }] });
    expect(await rule(() => createPayment(client, otherOrder))).toEqual(['allocation_other_order', items[1]]);
    const unknown = randomUUID();
    const noLine = input(order, { allocations: [{ itemId: unknown, amount: '1' }] });
    expect(await rule(() => createPayment(client, noLine))).toEqual(['allocation_other_order', unknown]);
    // Nada de lo rechazado dejó rastro.
    expect((await paid(extractionId)).map((row) => row[0])).toEqual(['100.01', '0.00']);
  });

  it('no cambia de orden un pago repartido; sin reparto, sí', async () => {
    const { projectId, items, order, other } = await seedOrder();
    const paymentId = await createPayment(client, input(order, { amount: '40', allocations: [{ itemId: items[0], amount: '40' }] }));
    expect(await rule(() => updatePayment(client, paymentId, 1, input(other, { amount: '40' })))).toEqual(['payment_has_allocations', null]);
    await updatePayment(client, paymentId, 1, input(order, { amount: '40' }));
    await updatePayment(client, paymentId, 2, input(other, { amount: '40' }));
    expect((await listPayments(client, projectId)).map((p) => [p.orderCode, p.unallocatedAmount, p.version])).toEqual([['OC-002', '40.00', 3]]);
  });

  it('rechaza montos no positivos y órdenes inexistentes', async () => {
    const { projectId } = await seed();
    const order = await createPurchaseOrder(client, projectId, 'OC-001');
    expect(getPgErrorCode(await failure(() => createPayment(client, input(order, { amount: '0' }))))).toBe(PgErrorCode.checkViolation);
    expect(getPgErrorCode(await failure(() => createPayment(client, input(randomUUID()))))).toBe(PgErrorCode.foreignKeyViolation);
  });

  it('convierte lo pagado escrito a mano antes de 0008', async () => {
    const { projectId, extractionId, items, order } = await seedOrder();
    const paymentId = await createPayment(client, input(order, { amount: '120' }));
    // Estado anterior a la migración: lo pagado escrito a mano, sin reparto que lo respalde.
    await client.query('ALTER TABLE purchase_order_lines DISABLE TRIGGER purchase_order_lines_check_paid_amount');
    await client.query('UPDATE purchase_order_lines SET paid_amount = 60 WHERE tdr_item_id = $1', [items[0]]);
    await client.query('UPDATE purchase_order_lines SET paid_amount = 50 WHERE tdr_item_id = $1', [items[1]]);
    await client.query('ALTER TABLE purchase_order_lines ENABLE TRIGGER purchase_order_lines_check_paid_amount');

    const manual = await listManualPaidLines(client, projectId);
    expect(manual.map((l) => [l.itemId, l.orderId, l.paidAmount, l.allocatedAmount]).sort()).toEqual(
      [
        [items[0], order, '60.00', '0.00'],
        [items[1], order, '50.00', '0.00'],
      ].sort(),
    );
    expect(await resetManualPaidAmounts(client, projectId)).toBe(2);
    expect(await listManualPaidLines(client, projectId)).toEqual([]);
    expect(await resetManualPaidAmounts(client, projectId)).toBe(0);

    await allocateExistingPayment(client, paymentId, [
      { itemId: items[0], amount: '100' },
      { itemId: items[1], amount: '20' },
    ]);
    expect(await paid(extractionId)).toEqual([
      ['100.00', '0.00', 'paid'],
      ['20.00', '30.00', 'partial'],
    ]);
    // El pago no se modifica (conserva su versión) y no se reparte dos veces.
    expect((await getPayment(client, paymentId))?.version).toBe(1);
    expect(await rule(() => allocateExistingPayment(client, paymentId, [{ itemId: items[1], amount: '1' }]))).toEqual([
      'payment_has_allocations',
      null,
    ]);
  });
});
