/**
 * Borrador de la matriz y su confirmación (etapa D), contra erp_test y en transacciones
 * revertidas. Datos sintéticos.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addDraftItem,
  confirmMatrix,
  createManualDraft,
  deleteDraftItem,
  DraftRuleError,
  getDraftExtraction,
  getMatrixTotals,
  getPgErrorCode,
  getProject,
  importProposalItems,
  listDraftItems,
  loadDbConfig,
  createPool,
  moveDraftItem,
  PgErrorCode,
  setItemResponsible,
  updateDraftItem,
  updateProject,
  VersionConflictError,
  type DraftItemInput,
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

const proposalItem = (item: number, rubro: string, producto: string, extra: Record<string, unknown> = {}) => ({
  item,
  rubro,
  producto,
  subproducto: null,
  descripcion: `Especificación de ${producto}`,
  cant: 2,
  unidad: 'Unidad',
  dias: 1.5,
  observacion: null,
  ...extra,
});

async function seedProject(): Promise<{ projectId: string; documentId: string }> {
  const clientId = await id(`INSERT INTO clients (name) VALUES ('Contratante sintético') RETURNING id`);
  const projectId = await id(`INSERT INTO projects (client_id, name) VALUES ($1, 'Proyecto sintético') RETURNING id`, [clientId]);
  const documentId = await id(
    `INSERT INTO tdr_documents (project_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256)
     VALUES ($1, 'local', $2, 'tdr.pdf', 'application/pdf', 10, $3) RETURNING id`,
    [projectId, `tdr/${randomUUID()}.pdf`, 'c'.repeat(64)],
  );
  return { projectId, documentId };
}

async function seedProposal(documentId: string, items: unknown[]): Promise<string> {
  return id(
    `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version, status, raw_response)
     VALUES ($1, $2, 'prueba', 'modelo', 'v1', 'tdr-v1', 'processed', $3) RETURNING id`,
    [documentId, randomUUID(), JSON.stringify({ ficha: null, items })],
  );
}

const summary = async (extractionId: string) =>
  (await listDraftItems(client, extractionId)).map((item) => `${item.itemNumber}:${item.rubro}:${item.producto}`);

const NEW_ITEM: DraftItemInput = {
  rubro: 'Mobiliario',
  producto: 'Sillas',
  subproducto: null,
  descripcion: 'Sillas plegables',
  cant: '100',
  unidad: 'Unidad',
  dias: null,
  observacion: null,
};

describe('importación de la propuesta', () => {
  it('copia los ítems en orden, agrupa por rubro y no repite la importación', async () => {
    const { documentId } = await seedProject();
    const extractionId = await seedProposal(documentId, [
      proposalItem(1, 'Audio', 'Parlantes', { subproducto: 'Sonido', observacion: 'p. 4' }),
      proposalItem(2, 'Escenario', 'Tarima'),
      proposalItem(3, 'Audio', 'Micrófonos', { cant: null, dias: null, unidad: null }),
    ]);

    expect(await importProposalItems(client, extractionId)).toBe(3);
    expect(await summary(extractionId)).toEqual(['1:Audio:Parlantes', '2:Audio:Micrófonos', '3:Escenario:Tarima']);
    const [first, second] = await listDraftItems(client, extractionId);
    expect(first).toMatchObject({ source: 'ai', sourceIndex: 0, subproducto: 'Sonido', cant: '2.0000', dias: '1.50', observacion: 'p. 4' });
    expect(second).toMatchObject({ sourceIndex: 2, cant: null, dias: null, unidad: null });

    expect(await importProposalItems(client, extractionId)).toBe(0);
    expect(await summary(extractionId)).toHaveLength(3);
  });

  it('no importa en un intento que no está procesado', async () => {
    const { documentId } = await seedProject();
    const extractionId = await seedProposal(documentId, [proposalItem(1, 'Audio', 'Parlantes')]);
    await client.query(`UPDATE tdr_extractions SET status = 'failed', error_code = 'x' WHERE id = $1`, [extractionId]);
    expect(await importProposalItems(client, extractionId)).toBe(0);
  });
});

describe('edición del borrador', () => {
  it('añade, cambia de rubro, mueve y elimina renumerando la matriz', async () => {
    const { documentId } = await seedProject();
    const extractionId = await seedProposal(documentId, [
      proposalItem(1, 'Audio', 'Parlantes'),
      proposalItem(2, 'Audio', 'Micrófonos'),
      proposalItem(3, 'Escenario', 'Tarima'),
    ]);
    await importProposalItems(client, extractionId);

    const sillas = await addDraftItem(client, extractionId, NEW_ITEM);
    await addDraftItem(client, extractionId, { ...NEW_ITEM, rubro: 'audio ', producto: 'Consola' });
    expect(await summary(extractionId)).toEqual([
      '1:Audio:Parlantes',
      '2:Audio:Micrófonos',
      '3:audio :Consola',
      '4:Escenario:Tarima',
      '5:Mobiliario:Sillas',
    ]);

    const items = await listDraftItems(client, extractionId);
    const tarima = items.find((item) => item.producto === 'Tarima')!;
    await updateDraftItem(client, tarima.id, tarima.version, { rubro: 'Audio' });
    expect(await summary(extractionId)).toEqual([
      '1:Audio:Parlantes',
      '2:Audio:Micrófonos',
      '3:audio :Consola',
      '4:Audio:Tarima',
      '5:Mobiliario:Sillas',
    ]);

    const consola = (await listDraftItems(client, extractionId)).find((item) => item.producto === 'Consola')!;
    await moveDraftItem(client, consola.id, consola.version, 'up');
    const parlantes = (await listDraftItems(client, extractionId)).find((item) => item.producto === 'Parlantes')!;
    await moveDraftItem(client, parlantes.id, parlantes.version, 'up'); // ya es el primero: no cambia
    expect(await summary(extractionId)).toEqual([
      '1:Audio:Parlantes',
      '2:audio :Consola',
      '3:Audio:Micrófonos',
      '4:Audio:Tarima',
      '5:Mobiliario:Sillas',
    ]);

    const micro = (await listDraftItems(client, extractionId)).find((item) => item.producto === 'Micrófonos')!;
    await deleteDraftItem(client, micro.id, micro.version);
    expect(await summary(extractionId)).toEqual(['1:Audio:Parlantes', '2:audio :Consola', '3:Audio:Tarima', '4:Mobiliario:Sillas']);
    expect((await listDraftItems(client, extractionId)).find((item) => item.id === sillas)).toMatchObject({ source: 'manual', sourceIndex: null });
  });

  it('usa control de versión y respeta las reglas de la base', async () => {
    const { documentId } = await seedProject();
    const extractionId = await seedProposal(documentId, [proposalItem(1, 'Audio', 'Parlantes')]);
    await importProposalItems(client, extractionId);
    const [item] = await listDraftItems(client, extractionId);

    await updateDraftItem(client, item!.id, item!.version, { cant: '3.5', observacion: 'Revisado' });
    expect(await failure(() => updateDraftItem(client, item!.id, item!.version, { cant: '4' }))).toBeInstanceOf(VersionConflictError);
    expect(getPgErrorCode(await failure(() => updateDraftItem(client, item!.id, item!.version + 1, { producto: '  ' })))).toBe(
      PgErrorCode.checkViolation,
    );
    expect((await listDraftItems(client, extractionId))[0]).toMatchObject({ cant: '3.5000', observacion: 'Revisado' });
  });

  it('elimina una fila con responsable', async () => {
    const { documentId } = await seedProject();
    const extractionId = await seedProposal(documentId, [proposalItem(1, 'Audio', 'Parlantes')]);
    await importProposalItems(client, extractionId);
    const [item] = await listDraftItems(client, extractionId);
    const worker = await id(`INSERT INTO workers (full_name) VALUES ('Responsable') RETURNING id`);
    await setItemResponsible(client, item!.id, null, worker);
    expect((await listDraftItems(client, extractionId))[0]).toMatchObject({ workerName: 'Responsable' });
    await deleteDraftItem(client, item!.id, item!.version);
    expect(await listDraftItems(client, extractionId)).toEqual([]);
  });
});

describe('matriz manual y confirmación', () => {
  it('empieza una matriz a mano, la confirma y la deja inmutable', async () => {
    const { projectId, documentId } = await seedProject();
    const extractionId = await createManualDraft(client, documentId);
    const draft = await getDraftExtraction(client, extractionId);
    expect(draft).toMatchObject({ status: 'processed', provider: 'manual', projectId });
    expect(await listDraftItems(client, extractionId)).toEqual([]);

    expect(await failure(() => confirmMatrix(client, extractionId, draft!.version))).toMatchObject({ code: 'draft_empty' });
    const itemId = await addDraftItem(client, extractionId, NEW_ITEM);
    expect(await failure(() => confirmMatrix(client, extractionId, draft!.version + 1))).toBeInstanceOf(VersionConflictError);
    await confirmMatrix(client, extractionId, draft!.version);

    expect((await getDraftExtraction(client, extractionId))?.status).toBe('confirmed');
    expect(await getMatrixTotals(client, extractionId)).toMatchObject({ itemCount: 1 });
    const [item] = await listDraftItems(client, extractionId);
    expect(getPgErrorCode(await failure(() => updateDraftItem(client, itemId, item!.version, { cant: '1' })))).toBe(PgErrorCode.checkViolation);
    // El responsable se sigue pudiendo cambiar después de confirmar.
    const worker = await id(`INSERT INTO workers (full_name) VALUES ('Responsable') RETURNING id`);
    await setItemResponsible(client, itemId, null, worker);
  });

  it('no deja empezar ni confirmar una segunda matriz en el proyecto', async () => {
    const { projectId, documentId } = await seedProject();
    const first = await seedProposal(documentId, [proposalItem(1, 'Audio', 'Parlantes')]);
    await importProposalItems(client, first);
    const second = await seedProposal(documentId, [proposalItem(1, 'Audio', 'Parlantes')]);
    await importProposalItems(client, second);

    await confirmMatrix(client, first, (await getDraftExtraction(client, first))!.version);
    const error = await failure(() => confirmMatrix(client, second, 1));
    expect(error).toBeInstanceOf(DraftRuleError);
    expect(error).toMatchObject({ code: 'project_has_confirmed_matrix' });
    expect(await failure(() => createManualDraft(client, documentId))).toMatchObject({ code: 'project_has_confirmed_matrix' });
    expect((await getProject(client, projectId))?.documentCount).toBe(1);
  });
});

describe('ficha aplicada', () => {
  it('registra de qué intento se aplicó la ficha junto con los campos', async () => {
    const { projectId, documentId } = await seedProject();
    const extractionId = await seedProposal(documentId, []);
    const project = await getProject(client, projectId);
    await updateProject(client, projectId, project!.version, { processCode: 'PROC-001', purpose: 'Objeto' }, { fichaExtractionId: extractionId });
    expect(await getProject(client, projectId)).toMatchObject({
      processCode: 'PROC-001',
      purpose: 'Objeto',
      fichaExtractionId: extractionId,
      version: project!.version + 1,
    });
    // Solo el intento, sin otros campos, también se registra.
    await updateProject(client, projectId, project!.version + 1, {}, { fichaExtractionId: extractionId });
    expect((await getProject(client, projectId))?.version).toBe(project!.version + 2);
  });
});
