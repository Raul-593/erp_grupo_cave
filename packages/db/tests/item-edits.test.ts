/**
 * Edición de responsable, planificación y proveedores, contra erp_test y en transacciones
 * revertidas. Datos sintéticos.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPool,
  createSupplier,
  getItemProjectId,
  getPgErrorCode,
  getSupplier,
  listActivities,
  listMatrixItems,
  listPreEventChecks,
  listSuppliers,
  setItemMountStatus,
  setPreEventCheckResult,
  updateActivity,
  loadDbConfig,
  PgErrorCode,
  saveItemPlan,
  setItemResponsible,
  updateSupplier,
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

const worker = (name: string, active = true) =>
  id(`INSERT INTO workers (full_name, active) VALUES ($1, $2) RETURNING id`, [name, active]);

describe('responsable de un ítem', () => {
  it('asigna, cambia y quita el responsable de una matriz confirmada', async () => {
    const { extractionId, itemId } = await seed();
    const first = await worker('Persona Uno');
    const second = await worker('Persona Dos');
    const current = async () => (await listMatrixItems(client, extractionId))[0]?.workerName ?? null;

    await setItemResponsible(client, itemId, null, first);
    expect(await current()).toBe('Persona Uno');
    await setItemResponsible(client, itemId, first, second);
    expect(await current()).toBe('Persona Dos');
    await setItemResponsible(client, itemId, second, second);
    expect(await current()).toBe('Persona Dos');
    await setItemResponsible(client, itemId, second, null);
    expect(await current()).toBeNull();
  });

  it('no pisa el cambio de otra persona', async () => {
    const { itemId } = await seed();
    const first = await worker('Persona Uno');
    const second = await worker('Persona Dos');
    await setItemResponsible(client, itemId, null, first);
    // Quien veía el ítem sin responsable, o con otro, llega tarde.
    expect(await failure(() => setItemResponsible(client, itemId, null, second))).toBeInstanceOf(VersionConflictError);
    expect(await failure(() => setItemResponsible(client, itemId, second, null))).toBeInstanceOf(VersionConflictError);
    expect(await failure(() => setItemResponsible(client, itemId, second, first))).toBeInstanceOf(VersionConflictError);
  });

  it('rechaza trabajadores desactivados o inexistentes', async () => {
    const { itemId } = await seed();
    const inactive = await worker('Persona inactiva', false);
    expect(getPgErrorCode(await failure(() => setItemResponsible(client, itemId, null, inactive)))).toBe(PgErrorCode.checkViolation);
    expect(getPgErrorCode(await failure(() => setItemResponsible(client, itemId, null, randomUUID())))).toBe(
      PgErrorCode.foreignKeyViolation,
    );
  });

  it('informa el proyecto de un ítem', async () => {
    const { projectId, itemId } = await seed();
    expect(await getItemProjectId(client, itemId)).toBe(projectId);
    expect(await getItemProjectId(client, randomUUID())).toBeNull();
  });
});

describe('planificación de un ítem', () => {
  it('crea el plan y edita cada campo por separado con control de versión', async () => {
    const { extractionId, itemId } = await seed();
    const supplierId = await createSupplier(client, { name: 'Proveedor sintético', kind: 'holding', taxId: null, notes: null, active: true });
    const plan = async () => {
      const item = (await listMatrixItems(client, extractionId))[0]!;
      return [item.supplierName, item.supplierKind, item.plannedCost, item.contractStatus, item.planVersion];
    };
    expect(await plan()).toEqual([null, null, null, null, null]);

    await saveItemPlan(client, itemId, null, { plannedCost: '8400.5' });
    expect(await plan()).toEqual([null, null, '8400.50', 'pending', 1]);
    await saveItemPlan(client, itemId, 1, { supplierId });
    expect(await plan()).toEqual(['Proveedor sintético', 'holding', '8400.50', 'pending', 2]);
    await saveItemPlan(client, itemId, 2, { contractStatus: 'signed' });
    await saveItemPlan(client, itemId, 3, { plannedCost: null, supplierId: null });
    expect(await plan()).toEqual([null, null, null, 'signed', 4]);
  });

  it('rechaza una versión antigua, un plan duplicado y valores no válidos', async () => {
    const { itemId } = await seed();
    await saveItemPlan(client, itemId, null, { plannedCost: '10' });
    expect(await failure(() => saveItemPlan(client, itemId, null, { plannedCost: '20' }))).toBeInstanceOf(VersionConflictError);
    await saveItemPlan(client, itemId, 1, { plannedCost: '30' });
    expect(await failure(() => saveItemPlan(client, itemId, 1, { plannedCost: '40' }))).toBeInstanceOf(VersionConflictError);
    expect(getPgErrorCode(await failure(() => saveItemPlan(client, itemId, 2, { plannedCost: '-1' })))).toBe(PgErrorCode.checkViolation);
    expect(getPgErrorCode(await failure(() => saveItemPlan(client, itemId, 2, { supplierId: randomUUID() })))).toBe(
      PgErrorCode.foreignKeyViolation,
    );
  });
});

describe('estados de actividades, montaje y checklist previo', () => {
  it('cambia estado y responsable de una actividad con control de versión', async () => {
    const { projectId } = await seed();
    const person = await worker('Persona Uno');
    const activityId = await id(
      `INSERT INTO activities (project_id, name, start_date, end_date) VALUES ($1, 'Montaje', '2026-12-01', '2026-12-02') RETURNING id`,
      [projectId],
    );
    const read = async () => {
      const activity = (await listActivities(client, projectId))[0]!;
      return [activity.status, activity.workerName, activity.version];
    };
    expect(await read()).toEqual([null, null, 1]);
    await updateActivity(client, activityId, 1, { status: 'in_progress' });
    await updateActivity(client, activityId, 2, { workerId: person });
    expect(await read()).toEqual(['in_progress', 'Persona Uno', 3]);
    await updateActivity(client, activityId, 3, { status: null, workerId: null });
    expect(await read()).toEqual([null, null, 4]);
    expect(await failure(() => updateActivity(client, activityId, 3, { status: 'done' }))).toBeInstanceOf(VersionConflictError);
    expect(getPgErrorCode(await failure(() => updateActivity(client, activityId, 4, { status: 'x' as never })))).toBe(
      PgErrorCode.checkViolation,
    );
  });

  it('no admite responsable en una actividad de equipo completo', async () => {
    const { projectId } = await seed();
    const person = await worker('Persona Uno');
    const activityId = await id(
      `INSERT INTO activities (project_id, name, whole_team, start_date, end_date) VALUES ($1, 'Ceremonia', true, '2026-12-03', '2026-12-03') RETURNING id`,
      [projectId],
    );
    expect(getPgErrorCode(await failure(() => updateActivity(client, activityId, 1, { workerId: person })))).toBe(PgErrorCode.checkViolation);
  });

  it('crea y cambia el estado de montaje de un ítem', async () => {
    const { extractionId, itemId } = await seed();
    const read = async () => {
      const item = (await listMatrixItems(client, extractionId))[0]!;
      return [item.mountStatus, item.executionVersion];
    };
    expect(await read()).toEqual([null, null]);
    await setItemMountStatus(client, itemId, null, 'on_site');
    expect(await read()).toEqual(['on_site', 1]);
    await setItemMountStatus(client, itemId, 1, 'mounted');
    expect(await read()).toEqual(['mounted', 2]);
    expect(await failure(() => setItemMountStatus(client, itemId, null, 'tested'))).toBeInstanceOf(VersionConflictError);
    expect(await failure(() => setItemMountStatus(client, itemId, 1, 'tested'))).toBeInstanceOf(VersionConflictError);
  });

  it('cambia el resultado de un control previo', async () => {
    const { projectId } = await seed();
    const checkId = await id(`INSERT INTO pre_event_checks (project_id, description) VALUES ($1, 'Control') RETURNING id`, [projectId]);
    await setPreEventCheckResult(client, checkId, 1, 'pass');
    expect((await listPreEventChecks(client, projectId))[0]).toMatchObject({ result: 'pass', version: 2 });
    expect(await failure(() => setPreEventCheckResult(client, checkId, 1, 'fail'))).toBeInstanceOf(VersionConflictError);
  });
});

describe('proveedores', () => {
  it('crea, lista, edita y desactiva con control de versión', async () => {
    const supplierId = await createSupplier(client, { name: 'Proveedor Uno', kind: 'external', taxId: '0990000000001', notes: null, active: true });
    expect(await getSupplier(client, supplierId)).toMatchObject({ name: 'Proveedor Uno', kind: 'external', active: true, usageCount: 0, version: 1 });

    await updateSupplier(client, supplierId, 1, { name: 'Proveedor Uno S.A.', kind: 'holding' });
    await updateSupplier(client, supplierId, 2, { active: false });
    expect(await getSupplier(client, supplierId)).toMatchObject({ name: 'Proveedor Uno S.A.', kind: 'holding', active: false, version: 3 });
    expect(await failure(() => updateSupplier(client, supplierId, 1, { name: 'Tarde' }))).toBeInstanceOf(VersionConflictError);

    expect((await listSuppliers(client)).some((s) => s.id === supplierId)).toBe(true);
    expect((await listSuppliers(client, { onlyActive: true })).some((s) => s.id === supplierId)).toBe(false);
  });

  it('rechaza nombres repetidos y cuenta los ítems que lo usan', async () => {
    const { itemId } = await seed();
    const supplierId = await createSupplier(client, { name: 'Proveedor Uno', kind: 'external', taxId: null, notes: null, active: true });
    const repeated = await failure(() =>
      createSupplier(client, { name: '  proveedor UNO ', kind: 'external', taxId: null, notes: null, active: true }),
    );
    expect(getPgErrorCode(repeated)).toBe(PgErrorCode.uniqueViolation);
    await saveItemPlan(client, itemId, null, { supplierId });
    expect((await getSupplier(client, supplierId))?.usageCount).toBe(1);
  });
});
