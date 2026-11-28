/**
 * Preparación de la base de Supabase (PLAN.md, parte S). Usa SUPABASE_DATABASE_URL (usuario
 * administrador del proyecto) y el certificado de DATABASE_SSL_CA_FILE. Nunca imprime secretos.
 *
 *   pnpm db:supabase:setup --rehearse   aplica todas las migraciones en un esquema de ensayo dentro
 *                                        de una transacción que se revierte: no deja rastro
 *   pnpm db:supabase:setup --role        crea el rol erp_app (si no existe) y escribe .env.supabase
 *                                        con su conexión; --reset-password le da una contraseña nueva
 *   pnpm db:supabase:setup --grants      permisos de erp_app sobre el esquema y sus políticas de RLS
 *
 * Orden en un proyecto nuevo: --rehearse, --role, migraciones (pnpm db:migrate:supabase), --grants.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDbConfig, summarizeConnection } from '../src/index.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ENV_FILE = fileURLToPath(new URL('../../../.env.supabase', import.meta.url));
const APP_ROLE = 'erp_app';
/** Tablas de solo agregar: la aplicación no las modifica (los triggers ya lo impiden). */
const APPEND_ONLY = ['audit_log'];

const config = loadDbConfig('supabase');
const connect = async () => {
  const client = new pg.Client({
    connectionString: config.connectionString,
    ssl: config.sslCa ? { ca: config.sslCa, rejectUnauthorized: true } : undefined,
    application_name: 'erp_v1_setup',
  });
  await client.connect();
  return client;
};

/** Parte «Up» de cada migración, en orden. */
function upMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const text = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8');
      const up = text.split(/^-- Down Migration/m)[0] ?? '';
      return { name: file.replace(/\.sql$/, ''), sql: up.replace(/^-- Up Migration/m, '') };
    });
}

async function rehearse(): Promise<void> {
  const client = await connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA erp_ensayo');
    await client.query('SET LOCAL search_path = erp_ensayo');
    for (const migration of upMigrations()) {
      await client.query(`SAVEPOINT m`);
      try {
        await client.query(migration.sql);
        console.log(`  ok       ${migration.name}`);
      } catch (error) {
        console.log(`  FALLA    ${migration.name}: ${(error as Error).message}`);
        throw new Error('El ensayo falló; no se aplicó nada.');
      }
    }
    const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'erp_ensayo'`);
    console.log(`Ensayo correcto: ${rows[0]?.n} tablas creadas y revertidas.`);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

/** Usuario del pooler para el rol de la aplicación: «erp_app.<proyecto>». */
function appConnectionString(password: string): string {
  const url = new URL(config.connectionString);
  const ref = decodeURIComponent(url.username).split('.')[1];
  if (!ref) throw new Error('SUPABASE_DATABASE_URL debe usar el usuario del Session pooler (postgres.<proyecto>).');
  url.username = `${APP_ROLE}.${ref}`;
  url.password = password;
  url.search = '';
  return url.toString();
}

function writeEnvFile(password: string): void {
  const lines = [
    '# Generado por «pnpm db:supabase:setup --role». No versionar: contiene la contraseña de erp_app.',
    '# Conexión de la aplicación a Supabase. Se usa con ERP_ENV_FILE=.env.supabase (ver MEMORY.md).',
    `DATABASE_URL=${appConnectionString(password)}`,
    'DATABASE_SCHEMA=erp',
    'AUTH_PROVIDER=supabase',
    'STORAGE_PROVIDER=supabase',
    '',
  ];
  writeFileSync(ENV_FILE, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  console.log('Conexión de erp_app escrita en .env.supabase (no se versiona).');
}

async function role(resetPassword: boolean): Promise<void> {
  const client = await connect();
  try {
    const { rows } = await client.query<{ exists: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`, [APP_ROLE]);
    const exists = rows[0]?.exists ?? false;
    if (exists && !resetPassword) {
      console.log(`El rol ${APP_ROLE} ya existe. ${existsSync(ENV_FILE) ? 'No se cambió nada.' : 'Falta .env.supabase: use --reset-password.'}`);
      return;
    }
    const password = randomBytes(24).toString('hex');
    // Identificador y contraseña sin comillas posibles (hex): no hay inyección.
    await client.query(
      exists
        ? `ALTER ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${password}'`
        : `CREATE ROLE ${APP_ROLE} WITH LOGIN NOINHERIT NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
    );
    await client.query(`ALTER ROLE ${APP_ROLE} SET search_path = ${config.schema}`);
    console.log(exists ? `Contraseña de ${APP_ROLE} cambiada.` : `Rol ${APP_ROLE} creado (sin privilegios de administración).`);
    writeEnvFile(password);
  } finally {
    await client.end();
  }
}

async function grants(): Promise<void> {
  const client = await connect();
  const schema = config.schema;
  try {
    await client.query('BEGIN');
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${APP_ROLE}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${APP_ROLE}`);
    await client.query(`REVOKE ALL ON ${schema}.pgmigrations FROM ${APP_ROLE}`);
    for (const table of APPEND_ONLY) await client.query(`REVOKE UPDATE, DELETE ON ${schema}.${table} FROM ${APP_ROLE}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${APP_ROLE}`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${APP_ROLE}`);
    // Nadie más entra al esquema (los roles de la API de Supabase tampoco).
    await client.query(`REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`);
    // Tablas que creen migraciones futuras.
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`);
    // RLS y política de erp_app en toda tabla que no la tenga (por si una migración no la creó).
    const { rows } = await client.query<{ table: string; rls: boolean; policy: boolean }>(
      `SELECT c.relname AS table, c.relrowsecurity AS rls,
              EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = $1 AND p.tablename = c.relname AND p.policyname = 'erp_app_all') AS policy
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname <> 'pgmigrations'
        ORDER BY 1`,
      [schema],
    );
    for (const row of rows) {
      if (!row.rls) await client.query(`ALTER TABLE ${schema}.${row.table} ENABLE ROW LEVEL SECURITY`);
      if (!row.policy) await client.query(`CREATE POLICY erp_app_all ON ${schema}.${row.table} TO ${APP_ROLE} USING (true) WITH CHECK (true)`);
    }
    await client.query('COMMIT');
    console.log(`Permisos de ${APP_ROLE} aplicados en ${rows.length} tablas; RLS activo en todas.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      rehearse: { type: 'boolean', default: false },
      role: { type: 'boolean', default: false },
      'reset-password': { type: 'boolean', default: false },
      grants: { type: 'boolean', default: false },
    },
  });
  const { host, database, user } = summarizeConnection(config.connectionString);
  console.log(`Supabase: base "${database}" en ${host}, usuario "${user}", esquema "${config.schema}".`);
  if (values.rehearse) await rehearse();
  if (values.role || values['reset-password']) await role(values['reset-password']);
  if (values.grants) await grants();
  if (!values.rehearse && !values.role && !values['reset-password'] && !values.grants) {
    console.log('Indique --rehearse, --role, --reset-password o --grants.');
  }
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
