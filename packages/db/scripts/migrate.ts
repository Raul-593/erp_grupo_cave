/**
 * Aplica las migraciones pendientes (solo dirección "up") o muestra su estado.
 *
 *   pnpm db:migrate        -> esquema de desarrollo (DATABASE_SCHEMA, por defecto erp)
 *   pnpm db:migrate:test   -> esquema de pruebas (TEST_DATABASE_SCHEMA, por defecto erp_test)
 *   pnpm db:status         -> estado de ambos esquemas, sin modificar nada
 *
 * Las migraciones "down" contienen DROP y no se exponen aquí a propósito: requieren
 * autorización expresa y ejecutarse manualmente con el CLI de node-pg-migrate.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runner } from 'node-pg-migrate';
import { createPool, loadDbConfig, summarizeConnection, type DbTarget } from '../src/index.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const MIGRATIONS_TABLE = 'pgmigrations';

async function listMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.replace(/\.sql$/, ''))
    .sort();
}

async function migrate(target: DbTarget): Promise<void> {
  const config = loadDbConfig(target);
  console.log(`\n[${target}] Aplicando migraciones en el esquema "${config.schema}"...`);
  const applied = await runner({
    databaseUrl: config.sslCa
      ? { connectionString: config.connectionString, ssl: { ca: config.sslCa, rejectUnauthorized: true } }
      : config.connectionString,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: MIGRATIONS_TABLE,
    schema: config.schema,
    createSchema: true,
    checkOrder: true,
    singleTransaction: true,
    logger: { debug: () => undefined, info: console.log, warn: console.warn, error: console.error },
  });
  console.log(
    applied.length === 0
      ? `[${target}] Sin migraciones pendientes.`
      : `[${target}] Aplicadas: ${applied.map((migration) => migration.name).join(', ')}`,
  );
}

async function status(target: DbTarget): Promise<void> {
  const config = loadDbConfig(target);
  const files = await listMigrationFiles();
  const pool = createPool(config, { max: 1 });
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass(format('%I.%I', $1::text, $2::text)) IS NOT NULL AS exists`,
      [config.schema, MIGRATIONS_TABLE],
    );
    const applied = new Map<string, string>();
    if (rows[0]?.exists) {
      // Esquema validado por loadDbConfig; nombre de tabla constante.
      const result = await pool.query<{ name: string; run_on: Date }>(
        `SELECT name, run_on FROM "${config.schema}".${MIGRATIONS_TABLE} ORDER BY run_on, id`,
      );
      for (const row of result.rows) applied.set(row.name, row.run_on.toISOString());
    }
    console.log(`\n[${target}] esquema "${config.schema}"`);
    for (const name of files) {
      const runOn = applied.get(name);
      console.log(`  ${runOn ? 'aplicada ' : 'PENDIENTE'}  ${name}${runOn ? `  (${runOn})` : ''}`);
    }
    const unknown = [...applied.keys()].filter((name) => !files.includes(name));
    for (const name of unknown) console.log(`  AVISO: aplicada en la base pero sin archivo: ${name}`);
    const pending = files.filter((name) => !applied.has(name)).length;
    console.log(`  Pendientes: ${pending}`);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { target: { type: 'string' }, status: { type: 'boolean', default: false } },
  });
  const { host, port, database, user } = summarizeConnection(loadDbConfig(values.target === 'supabase' ? 'supabase' : 'dev').connectionString);
  console.log(`Base "${database}" en ${host}:${port}, usuario "${user}".`);

  if (values.status) {
    if (values.target === 'supabase') return status('supabase');
    await status('dev');
    await status('test');
    return;
  }
  if (values.target !== 'dev' && values.target !== 'test' && values.target !== 'supabase') {
    throw new Error('Indique --target=dev, --target=test o --target=supabase.');
  }
  await migrate(values.target);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError en migraciones: ${message}`);
  process.exitCode = 1;
});
