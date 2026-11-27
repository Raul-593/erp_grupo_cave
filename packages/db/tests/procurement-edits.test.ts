/**
 * Edición de órdenes y pagos, contra erp_test y en transacciones revertidas. Datos sintéticos.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
  listMatrixItems,
  listPayments,
  listPurchaseOrders,
  loadDbConfig,
  PgErrorCode,
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

  it('no quita de la orden un ítem con algo pagado ni acepta una orden de otro proyecto', async () => {
    const a = await seed();
    const b = await seed('b');
    const order = await createPurchaseOrder(client, a.projectId, 'OC-001');
    const foreign = await createPurchaseOrder(client, b.projectId, 'OC-001');
    expect(getPgErrorCode(await failure(() => setItemOrder(client, a.items[0], null, foreign)))).toBe(PgErrorCode.checkViolation);

    await setItemOrder(client, a.items[0], null, order);
    await updateOrderLine(client, a.items[0], 1, { amount: '100', paidAmount: '40' });
    const error = await failure(() => setItemOrder(client, a.items[0], 2, null));
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect((error as BusinessRuleError).rule).toBe('line_has_payments');
    expect(getPgErrorCode(await failure(() => setItemOrder(client, a.items[0], 2, foreign)))).toBe(PgErrorCode.checkViolation);
  });

  it('edita monto, pagado y responsable de pago sin permitir pagar más que el monto', async () => {
    const { projectId, extractionId, items } = await seed();
    const order = await createPurchaseOrder(client, projectId, 'OC-001');
    const person = await id(`INSERT INTO workers (full_name) VALUES ('Persona Uno') RETURNING id`);
    await setItemOrder(client, items[0], null, order);

    await updateOrderLine(client, items[0], 1, { amount: '1000' });
    await updateOrderLine(client, items[0], 2, { paidAmount: '400.25' });
    expect(await line(extractionId)).toEqual(['OC-001', '1000.00', '400.25', '599.75', 'partial', 3]);
    await updateOrderLine(client, items[0], 3, { paymentWorkerId: person });
    await updateOrderLine(client, items[0], 4, { paidAmount: '1000' });
    expect(await line(extractionId)).toEqual(['OC-001', '1000.00', '1000.00', '0.00', 'paid', 5]);
    expect((await listMatrixItems(client, extractionId))[0]?.paymentWorkerName).toBe('Persona Uno');

    // Ni pagar de más ni bajar el monto por debajo de lo pagado.
    for (const patch of [{ paidAmount: '1000.01' }, { amount: '999.99' }]) {
      const error = await failure(() => updateOrderLine(client, items[0], 5, patch));
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).rule).toBe('paid_exceeds_amount');
    }
    expect(await failure(() => updateOrderLine(client, items[0], 4, { amount: '2000' }))).toBeInstanceOf(VersionConflictError);
    await updateOrderLine(client, items[0], 5, { amount: '2000', paidAmount: '1500' });
    expect(await getMatrixTotals(client, extractionId)).toMatchObject({ orderedAmount: '2000.00', paidAmount: '1500.00', balance: '500.00' });
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

describe('pagos', () => {
  const input = (orderId: string, overrides: Partial<PaymentInput> = {}): PaymentInput => ({
    orderId,
    paidOn: '2026-12-01',
    concept: 'Anticipo',
    method: 'transfer',
    amount: '250.50',
    support: 'invoice_and_receipt',
    ...overrides,
  });

  it('registra, corrige y elimina un pago con control de versión', async () => {
    const { projectId } = await seed();
    const order = await createPurchaseOrder(client, projectId, 'OC-001');
    const other = await createPurchaseOrder(client, projectId, 'OC-002');
    const paymentId = await createPayment(client, input(order));
    expect(await getPayment(client, paymentId)).toEqual({ id: paymentId, projectId, ...input(order), version: 1 });

    await updatePayment(client, paymentId, 1, input(other, { amount: '300', method: 'cash', support: 'none', concept: 'Flete' }));
    expect((await listPayments(client, projectId)).map((p) => [p.orderCode, p.amount, p.method, p.support, p.concept, p.version])).toEqual([
      ['OC-002', '300.00', 'cash', 'none', 'Flete', 2],
    ]);
    expect(await failure(() => updatePayment(client, paymentId, 1, input(order)))).toBeInstanceOf(VersionConflictError);
    expect(await failure(() => deletePayment(client, paymentId, 1))).toBeInstanceOf(VersionConflictError);

    await deletePayment(client, paymentId, 2);
    expect(await getPayment(client, paymentId)).toBeNull();
    expect(await listPayments(client, projectId)).toEqual([]);
  });

  it('rechaza montos no positivos y órdenes inexistentes', async () => {
    const { projectId } = await seed();
    const order = await createPurchaseOrder(client, projectId, 'OC-001');
    expect(getPgErrorCode(await failure(() => createPayment(client, input(order, { amount: '0' }))))).toBe(PgErrorCode.checkViolation);
    expect(getPgErrorCode(await failure(() => createPayment(client, input(randomUUID()))))).toBe(PgErrorCode.foreignKeyViolation);
  });
});
