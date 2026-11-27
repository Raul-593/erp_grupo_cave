/**
 * Pruebas del esquema contra PostgreSQL real, exclusivamente en el esquema de pruebas (erp_test).
 * Cada prueba corre dentro de una transacción que se revierte: no deja datos.
 * Todos los datos son sintéticos.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, EXTRACTION_STATUSES, getPgErrorCode, ITEM_SOURCES, loadDbConfig, PgErrorCode } from '../src/index.ts';

const config = loadDbConfig('test');
let pool: pg.Pool;
let client: pg.PoolClient;

beforeAll(async () => {
  if (!config.schema.endsWith('_test')) throw new Error('Las pruebas solo pueden ejecutarse sobre un esquema *_test.');
  pool = createPool(config, { max: 2 });
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT to_regclass(format('%I.tdr_items', $1::text)) IS NOT NULL AS ok`,
    [config.schema],
  );
  if (!rows[0]?.ok) throw new Error(`El esquema ${config.schema} no tiene las tablas. Ejecute pnpm db:migrate:test.`);
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

let savepointCounter = 0;

/** Ejecuta una sentencia que debe fallar y devuelve su SQLSTATE, sin abortar la transacción de la prueba. */
async function failureCode(sql: string, params: unknown[] = []): Promise<string | undefined> {
  const savepoint = `sp_${++savepointCounter}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query(sql, params);
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return getPgErrorCode(error) ?? 'error-sin-codigo';
  }
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  return undefined;
}

async function insertId(sql: string, params: unknown[]): Promise<string> {
  const { rows } = await client.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (!id) throw new Error('INSERT sin id');
  return id;
}

const sha = (char: string): string => char.repeat(64);
const RAW = { items: [{ item: 1 }, { item: 2 }] };

async function seedProject(): Promise<{ clientId: string; projectId: string }> {
  const clientId = await insertId(`INSERT INTO clients (name) VALUES ('Cliente sintético') RETURNING id`, []);
  const projectId = await insertId(
    `INSERT INTO projects (client_id, name, start_date, end_date) VALUES ($1, 'Proyecto sintético', '2026-12-01', '2026-12-03') RETURNING id`,
    [clientId],
  );
  return { clientId, projectId };
}

async function seedDocument(projectId: string, char = 'a'): Promise<string> {
  return insertId(
    `INSERT INTO tdr_documents (project_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256)
     VALUES ($1, 'local', $2, 'tdr.pdf', 'application/pdf', 1024, $3) RETURNING id`,
    [projectId, `tdr/${randomUUID()}.pdf`, sha(char)],
  );
}

async function seedExtraction(documentId: string, status: 'pending' | 'processed' = 'pending'): Promise<string> {
  return insertId(
    `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version, status, raw_response)
     VALUES ($1, $2, 'proveedor-prueba', 'modelo-prueba', 'v1', 'v1', $3, $4) RETURNING id`,
    [documentId, randomUUID(), status, status === 'processed' ? RAW : null],
  );
}

async function seedItem(extractionId: string, itemNumber: number, source: 'ai' | 'manual' = 'manual'): Promise<string> {
  return insertId(
    `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, subproducto, descripcion, source, source_index)
     VALUES ($1, $2, 'Audio, luces y video', 'Micrófono inalámbrico', 'Sonido', 'Profesional', $3, $4) RETURNING id`,
    [extractionId, itemNumber, source, source === 'ai' ? itemNumber - 1 : null],
  );
}

describe('estructura', () => {
  it('usa el esquema de pruebas en el search_path', async () => {
    const { rows } = await client.query<{ schema: string }>('SELECT current_schema() AS schema');
    expect(rows[0]?.schema).toBe(config.schema);
  });

  it('tiene las tablas de Fase 1', async () => {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> 'pgmigrations' ORDER BY 1`,
      [config.schema],
    );
    expect(rows.map((row) => row.tablename)).toEqual([
      'clients',
      'companies',
      'projects',
      'tdr_documents',
      'tdr_extractions',
      'tdr_item_assignments',
      'tdr_items',
      'workers',
    ]);
  });

  it('fija el search_path de las funciones de trigger en su propio esquema', async () => {
    const { rows } = await client.query<{ proname: string; proconfig: string[] }>(
      `SELECT proname, proconfig FROM pg_proc WHERE pronamespace = $1::regnamespace ORDER BY 1`,
      [config.schema],
    );
    expect(rows.map((row) => row.proname)).toEqual([
      'check_assignment_worker_active',
      'check_project_ficha_extraction',
      'protect_tdr_extraction',
      'protect_tdr_items',
      'set_row_metadata',
    ]);
    for (const row of rows) expect(row.proconfig).toEqual([`search_path=${config.schema}`]);
  });

  it('las constantes de dominio coinciden con los CHECK de la base', async () => {
    const definition = async (name: string): Promise<string> => {
      const { rows } = await client.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1 AND connamespace = $2::regnamespace`,
        [name, config.schema],
      );
      return rows[0]?.def ?? '';
    };
    const statusDef = await definition('tdr_extractions_status_valid');
    for (const status of EXTRACTION_STATUSES) expect(statusDef).toContain(`'${status}'`);
    const sourceDef = await definition('tdr_items_source_valid');
    for (const source of ITEM_SOURCES) expect(sourceDef).toContain(`'${source}'`);
  });

  it('devuelve date y numeric como texto exacto', async () => {
    const { rows } = await client.query<{ d: unknown; n: unknown }>(`SELECT DATE '2026-12-01' AS d, 3.1250::numeric(14,4) AS n`);
    expect(rows[0]).toEqual({ d: '2026-12-01', n: '3.1250' });
  });
});

describe('contratantes y proyectos', () => {
  it('rechaza un proyecto con un contratante inexistente', async () => {
    expect(await failureCode(`INSERT INTO projects (client_id, name) VALUES ($1, 'X')`, [randomUUID()])).toBe(
      PgErrorCode.foreignKeyViolation,
    );
  });

  it('rechaza fecha de fin anterior a la de inicio', async () => {
    const { clientId } = await seedProject();
    expect(
      await failureCode(`INSERT INTO projects (client_id, name, start_date, end_date) VALUES ($1, 'X', '2026-12-03', '2026-12-01')`, [
        clientId,
      ]),
    ).toBe(PgErrorCode.checkViolation);
  });

  it('no permite borrar un contratante con proyectos (RESTRICT)', async () => {
    const { clientId } = await seedProject();
    expect(await failureCode(`DELETE FROM clients WHERE id = $1`, [clientId])).toBe(PgErrorCode.restrictViolation);
  });

  it('rechaza nombres vacíos y RUC duplicado', async () => {
    expect(await failureCode(`INSERT INTO clients (name) VALUES ('   ')`)).toBe(PgErrorCode.checkViolation);
    await client.query(`INSERT INTO clients (name, tax_id) VALUES ('A', '0999999999001')`);
    expect(await failureCode(`INSERT INTO clients (name, tax_id) VALUES ('B', '0999999999001')`)).toBe(PgErrorCode.uniqueViolation);
  });

  it('incrementa version y mantiene updated_at en cada UPDATE', async () => {
    const { clientId } = await seedProject();
    await client.query(`UPDATE clients SET notes = 'nota' WHERE id = $1`, [clientId]);
    await client.query(`UPDATE clients SET notes = 'otra' WHERE id = $1`, [clientId]);
    const { rows } = await client.query<{ version: number; ok: boolean }>(
      `SELECT version, updated_at >= created_at AS ok FROM clients WHERE id = $1`,
      [clientId],
    );
    expect(rows[0]).toEqual({ version: 3, ok: true });
  });
});

describe('documentos TDR', () => {
  const insertDocument = (projectId: string, overrides: { key?: string; mime?: string; sha256?: string }) =>
    failureCode(
      `INSERT INTO tdr_documents (project_id, storage_provider, storage_key, original_filename, mime_type, size_bytes, sha256)
       VALUES ($1, 'local', $2, 'x.pdf', $3, 100, $4)`,
      [projectId, overrides.key ?? `tdr/${randomUUID()}.pdf`, overrides.mime ?? 'application/pdf', overrides.sha256 ?? sha('c')],
    );

  it('rechaza tipos distintos de PDF y hash mal formado', async () => {
    const { projectId } = await seedProject();
    expect(await insertDocument(projectId, { mime: 'application/msword' })).toBe(PgErrorCode.checkViolation);
    expect(await insertDocument(projectId, { sha256: 'ABC' })).toBe(PgErrorCode.checkViolation);
    expect(await insertDocument(projectId, { sha256: 'A'.repeat(64) })).toBe(PgErrorCode.checkViolation);
  });

  it.each(['../secreto.pdf', 'tdr/../../x.pdf', '/etc/x.pdf', 'C:/datos/x.pdf', 'tdr\\x.pdf', '  '])(
    'rechaza la clave de almacenamiento insegura %j',
    async (key) => {
      const { projectId } = await seedProject();
      expect(await insertDocument(projectId, { key })).toBe(PgErrorCode.checkViolation);
    },
  );

  it('rechaza el mismo PDF dos veces en el mismo proyecto', async () => {
    const { projectId } = await seedProject();
    await seedDocument(projectId, 'a');
    expect(await insertDocument(projectId, { sha256: sha('a') })).toBe(PgErrorCode.uniqueViolation);
  });
});

describe('extracciones', () => {
  it('permite un solo procesamiento activo por documento y claves de idempotencia únicas', async () => {
    const { projectId } = await seedProject();
    const documentId = await seedDocument(projectId);
    const otherDocumentId = await seedDocument(projectId, 'b');
    const key = randomUUID();
    await client.query(
      `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version)
       VALUES ($1, $2, 'openai', 'm', 'v1', 'v1')`,
      [documentId, key],
    );
    expect(await failureCode(`INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version)
       VALUES ($1, $2, 'anthropic', 'm', 'v1', 'v1')`, [documentId, randomUUID()])).toBe(PgErrorCode.uniqueViolation);
    expect(await failureCode(`INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version)
       VALUES ($1, $2, 'google', 'm', 'v1', 'v1')`, [otherDocumentId, key])).toBe(PgErrorCode.uniqueViolation);
  });

  it('acepta cualquier proveedor en minúsculas y rechaza formatos inválidos', async () => {
    const { projectId } = await seedProject();
    const documentId = await seedDocument(projectId);
    const insert = (provider: string) =>
      failureCode(
        `INSERT INTO tdr_extractions (tdr_document_id, idempotency_key, provider, model, prompt_version, schema_version, status, error_code)
         VALUES ($1, $2, $3, 'modelo', 'v1', 'v1', 'failed', 'prueba')`,
        [documentId, randomUUID(), provider],
      );
    for (const provider of ['openai', 'anthropic', 'google', 'mistral', 'azure-openai', 'local_llm']) {
      expect(await insert(provider)).toBeUndefined();
    }
    for (const provider of ['', 'OpenAI', 'open ai', '-x']) expect(await insert(provider)).toBe(PgErrorCode.checkViolation);
  });

  it('exige coherencia entre estado y datos', async () => {
    const { projectId } = await seedProject();
    const extractionId = await seedExtraction(await seedDocument(projectId));
    expect(await failureCode(`UPDATE tdr_extractions SET status = 'failed' WHERE id = $1`, [extractionId])).toBe(
      PgErrorCode.checkViolation,
    );
    expect(await failureCode(`UPDATE tdr_extractions SET status = 'processed' WHERE id = $1`, [extractionId])).toBe(
      PgErrorCode.checkViolation,
    );
    expect(
      await failureCode(`UPDATE tdr_extractions SET status = 'processed', raw_response = '[]' WHERE id = $1`, [extractionId]),
    ).toBe(PgErrorCode.checkViolation);
  });

  it('conserva raw_response inmutable y no cambia de documento', async () => {
    const { projectId } = await seedProject();
    const extractionId = await seedExtraction(await seedDocument(projectId), 'processed');
    const otherDocumentId = await seedDocument(projectId, 'b');
    expect(await failureCode(`UPDATE tdr_extractions SET raw_response = '{"items":[]}' WHERE id = $1`, [extractionId])).toBe(
      PgErrorCode.checkViolation,
    );
    expect(await failureCode(`UPDATE tdr_extractions SET tdr_document_id = $2 WHERE id = $1`, [extractionId, otherDocumentId])).toBe(
      PgErrorCode.checkViolation,
    );
  });

  it('reprocesa sin perder la confirmación y exige un reemplazo explícito', async () => {
    const { projectId } = await seedProject();
    const documentId = await seedDocument(projectId);
    const first = await seedExtraction(documentId, 'processed');
    await client.query(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [first]);

    const second = await seedExtraction(documentId, 'processed');
    expect(await failureCode(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [second])).toBe(
      PgErrorCode.uniqueViolation,
    );
    expect(await failureCode(`UPDATE tdr_extractions SET status = 'processed' WHERE id = $1`, [first])).toBe(
      PgErrorCode.checkViolation,
    );
    expect(await failureCode(`DELETE FROM tdr_extractions WHERE id = $1`, [first])).toBe(PgErrorCode.checkViolation);

    await client.query(`UPDATE tdr_extractions SET status = 'superseded' WHERE id = $1`, [first]);
    await client.query(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [second]);
    expect(await failureCode(`UPDATE tdr_extractions SET status = 'confirmed' WHERE id = $1`, [first])).toBe(
      PgErrorCode.checkViolation,
    );
    expect(await failureCode(`DELETE FROM tdr_documents WHERE id = $1`, [documentId])).toBe(PgErrorCode.restrictViolation);
  });
});

describe('ítems del desglose', () => {
  it('solo permite ítems mientras la extracción está en processed', async () => {
    const { projectId } = await seedProject();
    const pending = await seedExtraction(await seedDocument(projectId));
    expect(
      await failureCode(`INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, subproducto, descripcion, source)
         VALUES ($1, 1, 'R', 'P', 'S', 'D', 'manual')`, [pending]),
    ).toBe(PgErrorCode.checkViolation);
  });

  it('valida cantidades, días y origen de la fila', async () => {
    const { projectId } = await seedProject();
    const extractionId = await seedExtraction(await seedDocument(projectId), 'processed');
    const insert = (values: string) =>
      failureCode(
        `INSERT INTO tdr_items (extraction_id, rubro, item_number, producto, subproducto, descripcion, cant, dias, source, source_index)
         VALUES ($1, 'R', ${values})`,
        [extractionId],
      );
    expect(await insert(`1, 'P', 'S', 'D', NULL, NULL, 'ai', 0`)).toBeUndefined();
    expect(await insert(`2, 'P', 'S', 'D', 2.5, 18, 'manual', NULL`)).toBeUndefined();
    expect(await insert(`3, 'P', 'S', 'D', -1, NULL, 'manual', NULL`)).toBe(PgErrorCode.checkViolation);
    expect(await insert(`3, 'P', 'S', 'D', NULL, -0.5, 'manual', NULL`)).toBe(PgErrorCode.checkViolation);
    expect(await insert(`3, 'P', 'S', 'D', NULL, NULL, 'manual', 5`)).toBe(PgErrorCode.checkViolation);
    expect(await insert(`3, 'P', 'S', 'D', NULL, NULL, 'ai', NULL`)).toBe(PgErrorCode.checkViolation);
    expect(await insert(`3, ' ', 'S', 'D', NULL, NULL, 'manual', NULL`)).toBe(PgErrorCode.checkViolation);
    expect(await insert(`0, 'P', 'S', 'D', NULL, NULL, 'manual', NULL`)).toBe(PgErrorCode.checkViolation);
    // El mismo elemento del JSON original no se importa dos veces.
    expect(await insert(`3, 'P', 'S', 'D', NULL, NULL, 'ai', 0`)).toBe(PgErrorCode.uniqueViolation);
  });

  it('permite renumerar filas dentro de la transacción y rechaza duplicados al validar', async () => {
    const { projectId } = await seedProject();
    const extractionId = await seedExtraction(await seedDocument(projectId), 'processed');
    const first = await seedItem(extractionId, 1);
    const second = await seedItem(extractionId, 2);
    await client.query(`UPDATE tdr_items SET item_number = CASE WHEN id = $1 THEN 2 ELSE 1 END WHERE id IN ($1, $2)`, [first, second]);
    expect(await failureCode(`SET CONSTRAINTS tdr_items_extraction_item_number_key IMMEDIATE`)).toBeUndefined();
    await client.query(`SET CONSTRAINTS tdr_items_extraction_item_number_key DEFERRED`);

    await client.query(`UPDATE tdr_items SET item_number = 1 WHERE id = $1`, [first]);
    expect(await failureCode(`SET CONSTRAINTS tdr_items_extraction_item_number_key IMMEDIATE`)).toBe(PgErrorCode.uniqueViolation);
  });

  it('bloquea los ítems de una extracción confirmada', async () => {
    const { projectId } = await seedProject();
    const extractionId = await seedExtraction(await seedDocument(projectId), 'processed');
    const itemId = await seedItem(extractionId, 1, 'ai');
    await client.query(`UPDATE tdr_items SET descripcion = 'Editada por el usuario' WHERE id = $1`, [itemId]);
    await client.query(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [extractionId]);

    expect(await failureCode(`UPDATE tdr_items SET cant = 9 WHERE id = $1`, [itemId])).toBe(PgErrorCode.checkViolation);
    expect(await failureCode(`DELETE FROM tdr_items WHERE id = $1`, [itemId])).toBe(PgErrorCode.checkViolation);
    expect(
      await failureCode(`INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, subproducto, descripcion, source)
         VALUES ($1, 2, 'R', 'P', 'S', 'D', 'manual')`, [extractionId]),
    ).toBe(PgErrorCode.checkViolation);

    const { rows } = await client.query<{ descripcion: string; version: number }>(
      `SELECT descripcion, version FROM tdr_items WHERE id = $1`,
      [itemId],
    );
    expect(rows[0]).toEqual({ descripcion: 'Editada por el usuario', version: 2 });
  });
});

describe('ficha del proyecto y empresa', () => {
  it('valida monto, moneda y sedes', async () => {
    const { clientId } = await seedProject();
    const insert = (columns: string, values: string) =>
      failureCode(`INSERT INTO projects (client_id, name, ${columns}) VALUES ($1, 'X', ${values})`, [clientId]);
    expect(await insert('contract_amount, currency, venues', `286400.50, 'USD', '{Guayaquil,Quito}'`)).toBeUndefined();
    expect(await insert('contract_amount', '10')).toBe(PgErrorCode.checkViolation);
    expect(await insert('contract_amount, currency', `-1, 'USD'`)).toBe(PgErrorCode.checkViolation);
    expect(await insert('currency', `'usd'`)).toBe(PgErrorCode.checkViolation);
    expect(await insert('venues', `'{""}'`)).toBe(PgErrorCode.checkViolation);
    expect(await insert('venues', `ARRAY[NULL]::text[]`)).toBe(PgErrorCode.checkViolation);
    expect(await insert('process_code', `'  '`)).toBe(PgErrorCode.checkViolation);
  });

  it('devuelve las sedes como arreglo y el monto como texto exacto', async () => {
    const { clientId } = await seedProject();
    const { rows } = await client.query<{ venues: unknown; contract_amount: unknown }>(
      `INSERT INTO projects (client_id, name, contract_amount, currency, venues)
       VALUES ($1, 'X', 1000.5, 'USD', '{Quito,Cuenca}') RETURNING venues, contract_amount`,
      [clientId],
    );
    expect(rows[0]).toEqual({ venues: ['Quito', 'Cuenca'], contract_amount: '1000.50' });
  });

  it('solo acepta la ficha de una extracción del mismo proyecto', async () => {
    const { clientId, projectId } = await seedProject();
    const extractionId = await seedExtraction(await seedDocument(projectId), 'processed');
    await client.query(`UPDATE projects SET ficha_extraction_id = $2 WHERE id = $1`, [projectId, extractionId]);
    const other = await insertId(`INSERT INTO projects (client_id, name) VALUES ($1, 'Otro') RETURNING id`, [clientId]);
    expect(await failureCode(`UPDATE projects SET ficha_extraction_id = $2 WHERE id = $1`, [other, extractionId])).toBe(
      PgErrorCode.checkViolation,
    );
  });

  it('vincula opcionalmente una empresa y no permite borrarla si tiene proyectos', async () => {
    const { projectId } = await seedProject();
    const companyId = await insertId(`INSERT INTO companies (name, tax_id) VALUES ('Empresa sintética', '0990000000001') RETURNING id`, []);
    await client.query(`UPDATE projects SET company_id = $2 WHERE id = $1`, [projectId, companyId]);
    expect(await failureCode(`DELETE FROM companies WHERE id = $1`, [companyId])).toBe(PgErrorCode.restrictViolation);
    expect(await failureCode(`INSERT INTO companies (name, tax_id) VALUES ('Otra', '0990000000001')`)).toBe(PgErrorCode.uniqueViolation);
  });
});

describe('trabajadores y responsables', () => {
  async function seedWorker(active = true): Promise<string> {
    return insertId(`INSERT INTO workers (full_name, active) VALUES ('Trabajador sintético', $1) RETURNING id`, [active]);
  }

  it('rechaza nombres vacíos', async () => {
    expect(await failureCode(`INSERT INTO workers (full_name) VALUES ('  ')`)).toBe(PgErrorCode.checkViolation);
  });

  it('acepta subproducto nulo y exige rubro', async () => {
    const { projectId } = await seedProject();
    const extractionId = await seedExtraction(await seedDocument(projectId), 'processed');
    const insert = (rubro: string | null, subproducto: string | null) =>
      failureCode(
        `INSERT INTO tdr_items (extraction_id, item_number, rubro, producto, subproducto, descripcion, source)
         VALUES ($1, 1, $2, 'P', $3, 'D', 'manual')`,
        [extractionId, rubro, subproducto],
      );
    expect(await insert('R', null)).toBeUndefined();
    await client.query(`DELETE FROM tdr_items WHERE extraction_id = $1`, [extractionId]);
    expect(await insert(null, 'S')).toBe('23502');
    expect(await insert(' ', 'S')).toBe(PgErrorCode.checkViolation);
    expect(await insert('R', ' ')).toBe(PgErrorCode.checkViolation);
  });

  it('asigna un solo responsable por ítem, solo trabajadores activos', async () => {
    const { projectId } = await seedProject();
    const itemId = await seedItem(await seedExtraction(await seedDocument(projectId), 'processed'), 1);
    const inactive = await seedWorker(false);
    expect(await failureCode(`INSERT INTO tdr_item_assignments (tdr_item_id, worker_id) VALUES ($1, $2)`, [itemId, inactive])).toBe(
      PgErrorCode.checkViolation,
    );
    expect(
      await failureCode(`INSERT INTO tdr_item_assignments (tdr_item_id, worker_id) VALUES ($1, $2)`, [itemId, randomUUID()]),
    ).toBe(PgErrorCode.foreignKeyViolation);
    const worker = await seedWorker();
    await client.query(`INSERT INTO tdr_item_assignments (tdr_item_id, worker_id) VALUES ($1, $2)`, [itemId, worker]);
    expect(await failureCode(`INSERT INTO tdr_item_assignments (tdr_item_id, worker_id) VALUES ($1, $2)`, [itemId, worker])).toBe(
      PgErrorCode.uniqueViolation,
    );
  });

  it('permite cambiar el responsable después de confirmar la extracción', async () => {
    const { projectId } = await seedProject();
    const extractionId = await seedExtraction(await seedDocument(projectId), 'processed');
    const itemId = await seedItem(extractionId, 1);
    const first = await seedWorker();
    const second = await seedWorker();
    await client.query(`INSERT INTO tdr_item_assignments (tdr_item_id, worker_id) VALUES ($1, $2)`, [itemId, first]);
    await client.query(`UPDATE tdr_extractions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [extractionId]);

    // Desactivar al trabajador no borra su asignación previa.
    await client.query(`UPDATE workers SET active = false WHERE id = $1`, [first]);
    await client.query(`UPDATE tdr_item_assignments SET updated_at = now() WHERE tdr_item_id = $1`, [itemId]);
    await client.query(`UPDATE tdr_item_assignments SET worker_id = $2 WHERE tdr_item_id = $1`, [itemId, second]);
    const { rows } = await client.query<{ worker_id: string; version: number }>(
      `SELECT worker_id, version FROM tdr_item_assignments WHERE tdr_item_id = $1`,
      [itemId],
    );
    expect(rows[0]).toEqual({ worker_id: second, version: 3 });
  });

  it('no permite borrar un ítem con responsable ni un trabajador asignado', async () => {
    const { projectId } = await seedProject();
    const itemId = await seedItem(await seedExtraction(await seedDocument(projectId), 'processed'), 1);
    const worker = await seedWorker();
    await client.query(`INSERT INTO tdr_item_assignments (tdr_item_id, worker_id) VALUES ($1, $2)`, [itemId, worker]);
    expect(await failureCode(`DELETE FROM tdr_items WHERE id = $1`, [itemId])).toBe(PgErrorCode.restrictViolation);
    expect(await failureCode(`DELETE FROM workers WHERE id = $1`, [worker])).toBe(PgErrorCode.restrictViolation);
  });
});
