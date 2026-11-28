/**
 * Pruebas de los repositorios contra erp_test, en transacciones revertidas. Datos sintéticos.
 */
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  claimExtraction,
  completeExtraction,
  createExtraction,
  failExtraction,
  failStaleExtractions,
  getExtraction,
  getLatestExtraction,
  getPgErrorCode,
  PgErrorCode,
  createClient,
  createDocument,
  deleteUnprocessedDocument,
  findDocumentByHash,
  getDocumentFile,
  createPool,
  createProject,
  createWorker,
  getProject,
  getWorker,
  listDocumentsByProject,
  listProjects,
  listWorkers,
  loadDbConfig,
  updateProject,
  updateWorker,
  VersionConflictError,
  type ProjectInput,
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

function projectInput(clientId: string, overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: 'Proyecto sintético',
    clientId,
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    notes: null,
    processCode: null,
    purpose: null,
    contractAmount: null,
    currency: null,
    amountIncludesVat: null,
    venues: [],
    termText: null,
    contractAdministrator: null,
    ...overrides,
  };
}

describe('proyectos', () => {
  it('crea, lee y lista con el contratante y la ficha', async () => {
    const contratante = await createClient(client, { name: 'Contratante sintético', taxId: '0990000000001' });
    const id = await createProject(
      client,
      projectInput(contratante.id, { contractAmount: '1234.5', currency: 'USD', venues: ['Quito', 'Cuenca'] }),
    );
    const project = await getProject(client, id);
    expect(project).toMatchObject({
      name: 'Proyecto sintético',
      clientName: 'Contratante sintético',
      clientTaxId: '0990000000001',
      startDate: '2026-12-01',
      contractAmount: '1234.50',
      venues: ['Quito', 'Cuenca'],
      documentCount: 0,
      version: 1,
    });
    expect((await listProjects(client)).map((p) => p.id)).toContain(id);
    expect(await listDocumentsByProject(client, id)).toEqual([]);
  });

  it('actualiza solo los campos enviados y detecta conflictos de versión', async () => {
    const contratante = await createClient(client, { name: 'Contratante sintético', taxId: null });
    const id = await createProject(client, projectInput(contratante.id));
    await updateProject(client, id, 1, { purpose: 'Objeto sintético', termText: '30 días' });
    const project = await getProject(client, id);
    expect(project).toMatchObject({ name: 'Proyecto sintético', purpose: 'Objeto sintético', termText: '30 días', version: 2 });
    await expect(updateProject(client, id, 1, { purpose: 'Otro' })).rejects.toBeInstanceOf(VersionConflictError);
  });
});

describe('trabajadores', () => {
  it('crea, edita, desactiva y filtra los activos', async () => {
    const id = await createWorker(client, {
      fullName: 'Trabajador sintético',
      jobTitle: 'Coordinación',
      phone: null,
      email: null,
      notes: null,
      active: true,
    });
    await updateWorker(client, id, 1, { jobTitle: 'Logística' });
    await updateWorker(client, id, 2, { active: false });
    expect(await getWorker(client, id)).toMatchObject({ jobTitle: 'Logística', active: false, assignmentCount: 0, version: 3 });
    expect((await listWorkers(client, { onlyActive: true })).map((w) => w.id)).not.toContain(id);
    expect((await listWorkers(client)).map((w) => w.id)).toContain(id);
    await expect(updateWorker(client, id, 1, { active: true })).rejects.toBeInstanceOf(VersionConflictError);
  });
});

describe('documentos TDR', () => {
  const SHA = 'ab'.repeat(32);

  async function seed(): Promise<{ projectId: string; documentId: string; key: string }> {
    const contratante = await createClient(client, { name: 'Contratante sintético', taxId: null });
    const projectId = await createProject(client, projectInput(contratante.id));
    const key = `tdr/${projectId}/${randomUUID()}.pdf`;
    const documentId = await createDocument(client, {
      projectId,
      storageProvider: 'local',
      storageKey: key,
      originalFilename: 'documento.pdf',
      sizeBytes: 2048,
      sha256: SHA,
      pageCount: null,
    });
    return { projectId, documentId, key };
  }

  it('registra, lista y encuentra por hash', async () => {
    const { projectId, documentId, key } = await seed();
    expect(await getDocumentFile(client, documentId)).toMatchObject({
      projectId,
      storageKey: key,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    });
    expect(await findDocumentByHash(client, projectId, SHA)).toEqual({ id: documentId, originalFilename: 'documento.pdf' });
    expect(await findDocumentByHash(client, projectId, 'cd'.repeat(32))).toBeNull();
    const [summary] = await listDocumentsByProject(client, projectId);
    expect(summary).toMatchObject({ id: documentId, latestExtractionStatus: null, extractionCount: 0 });
    expect((await getProject(client, projectId))?.documentCount).toBe(1);
  });

  it('solo elimina documentos sin intentos de extracción', async () => {
    const first = await seed();
    expect(await deleteUnprocessedDocument(client, first.documentId)).toEqual({ storageProvider: 'local', storageKey: first.key });
    expect(await getDocumentFile(client, first.documentId)).toBeNull();

    const second = await seed();
    await client.query(
      `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version)
       VALUES ($1, $2, 'proveedor-prueba', 'modelo-prueba', 'v1', 'v1')`,
      [second.documentId, randomUUID()],
    );
    expect(await deleteUnprocessedDocument(client, second.documentId)).toBeNull();
    expect(await getDocumentFile(client, second.documentId)).not.toBeNull();
  });
});

describe('intentos de extracción', () => {
  async function seedDocument(): Promise<string> {
    const contratante = await createClient(client, { name: 'Contratante sintético', taxId: null });
    const projectId = await createProject(client, projectInput(contratante.id));
    return createDocument(client, {
      projectId,
      storageProvider: 'local',
      storageKey: `tdr/${projectId}/${randomUUID()}.pdf`,
      originalFilename: 'documento.pdf',
      sizeBytes: 10,
      sha256: 'ef'.repeat(32),
      pageCount: null,
    });
  }
  const input = (documentId: string, idempotencyKey = randomUUID()) => ({
    documentId,
    idempotencyKey,
    provider: 'proveedor-prueba',
    model: 'modelo-prueba',
    promptVersion: 'tdr-extraccion-v1',
    schemaVersion: 'tdr-v1',
  });

  it('es idempotente con la misma clave y rechaza un segundo procesamiento activo', async () => {
    const documentId = await seedDocument();
    const key = randomUUID();
    const first = await createExtraction(client, input(documentId, key));
    const again = await createExtraction(client, input(documentId, key));
    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, documentId, created: false });

    await client.query('SAVEPOINT sp');
    const error = await createExtraction(client, input(documentId)).catch((e: unknown) => e);
    await client.query('ROLLBACK TO SAVEPOINT sp');
    expect(getPgErrorCode(error)).toBe(PgErrorCode.uniqueViolation);
  });

  it('recorre pending → processing → processed y guarda el JSON y los tokens', async () => {
    const documentId = await seedDocument();
    const { id } = await createExtraction(client, input(documentId));
    expect(await claimExtraction(client, id)).toBe(true);
    expect(await claimExtraction(client, id)).toBe(false);
    const raw = { ficha: { contratante: null }, items: [] };
    expect(await completeExtraction(client, id, raw, { inputTokens: 100, outputTokens: 20, totalTokens: 120, durationMs: 1500 })).toBe(true);
    expect(await getLatestExtraction(client, documentId)).toMatchObject({
      id,
      status: 'processed',
      rawResponse: raw,
      totalTokens: 120,
      durationMs: 1500,
    });
    expect(await failExtraction(client, id, { code: 'x', message: 'y' })).toBe(false);
  });

  it('marca el error con mensaje seguro y conserva la respuesta inválida', async () => {
    const documentId = await seedDocument();
    const { id } = await createExtraction(client, input(documentId));
    await claimExtraction(client, id);
    const invalid = { salida_invalida: '{"items": "texto"}', problemas: ['items: se esperaba un arreglo'] };
    expect(await failExtraction(client, id, { code: 'invalid_output', message: 'Respuesta fuera de formato.', rawResponse: invalid })).toBe(true);
    expect(await getExtraction(client, id)).toMatchObject({ status: 'failed', errorCode: 'invalid_output', rawResponse: invalid });
    // Tras un error se puede volver a procesar el mismo documento.
    expect((await createExtraction(client, input(documentId))).created).toBe(true);
  });

  it('marca como interrumpidos solo los intentos antiguos que no están en curso', async () => {
    const a = await createExtraction(client, input(await seedDocument()));
    const b = await createExtraction(client, input(await seedDocument()));
    await client.query(`UPDATE tdr_extractions SET created_at = now() - interval '1 hour' WHERE id = ANY($1::uuid[])`, [[a.id, b.id]]);
    const marked = await failStaleExtractions(client, { olderThanSeconds: 120, runningIds: [b.id], message: 'Interrumpido.' });
    expect(marked).toEqual([a.id]);
    expect(await getExtraction(client, a.id)).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(await getExtraction(client, b.id)).toMatchObject({ status: 'pending' });
  });
});

describe('configuración de una base remota', () => {
  const remote = { DATABASE_URL: 'postgres://u:c@aws-0-x.pooler.supabase.com:5432/postgres' };
  it('exige el certificado de la CA y nunca conecta sin verificar', () => {
    expect(() => loadDbConfig('dev', remote)).toThrow(/certificado/);
    expect(loadDbConfig('dev', { ...remote, DATABASE_SSL_CA: '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----' }).sslCa).toBe(
      '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----',
    );
    expect(() => loadDbConfig('dev', { ...remote, DATABASE_SSL_CA_FILE: 'no-existe.crt' })).toThrow(/No se pudo leer/);
  });

  it('la base local no necesita certificado y Supabase usa su propia URL y el esquema erp', () => {
    expect(loadDbConfig('dev', { DATABASE_URL: 'postgres://u:c@localhost:5432/base' }).sslCa).toBeNull();
    expect(() => loadDbConfig('supabase', { DATABASE_URL: 'postgres://u:c@localhost/base' })).toThrow(/SUPABASE_DATABASE_URL/);
    const config = loadDbConfig('supabase', {
      DATABASE_URL: 'postgres://u:c@localhost/base',
      DATABASE_SCHEMA: 'otro',
      SUPABASE_DATABASE_URL: remote.DATABASE_URL,
      DATABASE_SSL_CA: 'pem',
    });
    expect(config).toMatchObject({ target: 'supabase', schema: 'erp', sslCa: 'pem', connectionString: remote.DATABASE_URL });
  });
});
