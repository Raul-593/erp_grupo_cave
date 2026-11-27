/**
 * Usuarios, alcance de un empleado de campo, fotografías con su autor y auditoría, contra erp_test
 * y en transacciones revertidas. Datos sintéticos.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createEvidence,
  createPool,
  createUser,
  getEvidenceFile,
  getMatrixTotals,
  getPgErrorCode,
  getUser,
  isItemAssignedTo,
  listAuditForEntity,
  listItemEvidences,
  listUsers,
  listWorkerProjectIds,
  loadDbConfig,
  PgErrorCode,
  recordAudit,
  recordLogin,
  setItemResponsible,
  updateUser,
  VersionConflictError,
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

/** Error de una operación que debe fallar, sin abortar la transacción de la prueba. */
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

async function seed(): Promise<{ projectId: string; extractionId: string; itemId: string }> {
  const clientId = await id(`INSERT INTO clients (name) VALUES ('Contratante sintético') RETURNING id`);
  const projectId = await id(`INSERT INTO projects (client_id, name) VALUES ($1, 'Proyecto sintético') RETURNING id`, [clientId]);
  const documentId = await id(
    `INSERT INTO tdr_documents (project_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256)
     VALUES ($1, 'local', $2, 'tdr.pdf', 'application/pdf', 10, $3) RETURNING id`,
    [projectId, `tdr/${randomUUID()}.pdf`, 'a'.repeat(64)],
  );
  const extractionId = await id(
    `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version, status, raw_response)
     VALUES ($1, $2, 'prueba', 'modelo', 'v1', 'v1', 'processed', '{"items":[]}') RETURNING id`,
    [documentId, randomUUID()],
  );
  const itemId = await id(
    `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, descripcion, source)
     VALUES ($1, 1, 'Rubro', 'Producto', 'Descripción', 'manual') RETURNING id`,
    [extractionId],
  );
  await client.query(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [extractionId]);
  return { projectId, extractionId, itemId };
}

const worker = (name: string) => id(`INSERT INTO workers (full_name) VALUES ($1) RETURNING id`, [name]);

describe('usuarios', () => {
  it('crea, lista, edita con control de versión y normaliza el correo', async () => {
    const workerId = await worker('Persona de campo');
    const supplierId = await id(`INSERT INTO suppliers (name, kind) VALUES ('Proveedor sintético', 'external') RETURNING id`);
    const admin = await createUser(client, { fullName: 'Admin', email: ' Admin@Ejemplo.TEST ', role: 'admin', workerId: null, supplierId: null, active: true });
    const field = await createUser(client, { fullName: 'Campo', email: null, role: 'field', workerId, supplierId: null, active: true });
    await createUser(client, { fullName: 'Proveedor', email: null, role: 'supplier', workerId: null, supplierId, active: true });

    expect(await getUser(client, admin)).toMatchObject({ email: 'admin@ejemplo.test', role: 'admin', active: true, version: 1 });
    expect(await getUser(client, field)).toMatchObject({ workerName: 'Persona de campo', supplierName: null });
    const names = (await listUsers(client)).map((u) => u.fullName);
    expect(names.indexOf('Admin')).toBeLessThan(names.indexOf('Campo'));
    expect(names).toContain('Proveedor');

    await updateUser(client, field, 1, { email: 'CAMPO@ejemplo.test' });
    expect(await getUser(client, field)).toMatchObject({ email: 'campo@ejemplo.test', version: 2 });
    expect(await failure(() => updateUser(client, field, 1, { fullName: 'Otro' }))).toBeInstanceOf(VersionConflictError);
    expect(getPgErrorCode(await failure(() => updateUser(client, field, 2, { role: 'field', workerId: null })))).toBe(PgErrorCode.checkViolation);

    await recordLogin(client, field);
    expect((await getUser(client, field))?.lastLoginAt).toBeInstanceOf(Date);
    await updateUser(client, field, 3, { active: false });
    expect((await listUsers(client, { onlyActive: true })).some((u) => u.id === field)).toBe(false);
  });
});

describe('alcance de un empleado de campo', () => {
  it('ve solo los ítems y proyectos donde su trabajador es el responsable', async () => {
    const { projectId, itemId } = await seed();
    const mine = await worker('Responsable');
    const other = await worker('Otra persona');
    expect(await isItemAssignedTo(client, itemId, mine)).toBe(false);
    expect(await listWorkerProjectIds(client, mine)).toEqual([]);

    await setItemResponsible(client, itemId, null, mine);
    expect(await isItemAssignedTo(client, itemId, mine)).toBe(true);
    expect(await isItemAssignedTo(client, itemId, other)).toBe(false);
    expect(await listWorkerProjectIds(client, mine)).toEqual([projectId]);

    // Los indicadores con alcance cuentan solo sus ítems y dejan los pagos del proyecto en cero.
    const { extractionId } = await client
      .query<{ extractionId: string }>(`SELECT extraction_id AS "extractionId" FROM tdr_items WHERE id = $1`, [itemId])
      .then((r) => r.rows[0]!);
    await client.query(`INSERT INTO item_plans (tdr_item_id, planned_cost) VALUES ($1, 120)`, [itemId]);
    expect(await getMatrixTotals(client, extractionId, { workerId: mine })).toMatchObject({ itemCount: 1, plannedCost: '120.00', paymentsAmount: '0.00' });
    expect(await getMatrixTotals(client, extractionId, { workerId: other })).toMatchObject({ itemCount: 0, plannedCost: '0.00' });
    expect(await getMatrixTotals(client, extractionId)).toMatchObject({ itemCount: 1, plannedCost: '120.00' });

    // Al reasignar el ítem, el acceso cambia de inmediato.
    await setItemResponsible(client, itemId, mine, other);
    expect(await isItemAssignedTo(client, itemId, mine)).toBe(false);
    expect(await listWorkerProjectIds(client, other)).toEqual([projectId]);
  });
});

describe('fotografías con su autor y auditoría', () => {
  it('registra quién subió cada foto y el historial de cambios de un registro', async () => {
    const { itemId } = await seed();
    const author = await createUser(client, { fullName: 'Autora', email: null, role: 'admin', workerId: null, supplierId: null, active: true });
    const photo = {
      itemId,
      storageProvider: 'local' as const,
      originalFilename: 'foto.jpg',
      mimeType: 'image/jpeg' as const,
      sizeBytes: 100,
      description: null,
    };
    const withAuthor = await createEvidence(client, { ...photo, storageKey: `evidencias/${randomUUID()}.jpg`, sha256: 'a'.repeat(64), uploadedBy: author });
    const legacy = await createEvidence(client, { ...photo, storageKey: `evidencias/${randomUUID()}.jpg`, sha256: 'b'.repeat(64), uploadedBy: null });
    expect(await getEvidenceFile(client, withAuthor)).toMatchObject({ uploadedBy: author, uploadedByName: 'Autora' });
    expect((await listItemEvidences(client, itemId)).find((e) => e.id === legacy)).toMatchObject({ uploadedBy: null, uploadedByName: null });

    await recordAudit(client, { userId: author, action: 'evidence.upload', entity: 'item_evidences', entityId: withAuthor, details: { itemId } });
    await recordAudit(client, { userId: author, action: 'evidence.delete', entity: 'item_evidences', entityId: withAuthor });
    const history = await listAuditForEntity(client, 'item_evidences', withAuthor);
    expect(history.map((h) => h.action).sort()).toEqual(['evidence.delete', 'evidence.upload']);
    expect(history[0]).toMatchObject({ userName: 'Autora' });
    expect(history.find((h) => h.action === 'evidence.upload')?.details).toEqual({ itemId });
  });
});
