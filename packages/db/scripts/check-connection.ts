/**
 * Verifica la conexión a PostgreSQL y el estado de los esquemas de desarrollo y pruebas.
 * Uso: pnpm db:check
 */
import { createPool, loadDbConfig, summarizeConnection, type DbTarget } from '../src/index.ts';

interface ServerInfo {
  server_version: string;
  current_user: string;
  current_database: string;
  current_schema: string | null;
  can_create_schema: boolean;
  is_superuser: boolean;
  timezone: string;
}

interface SchemaInfo {
  schema_exists: boolean;
  tables: number;
  applied_migrations: number | null;
}

async function inspect(target: DbTarget): Promise<void> {
  const config = loadDbConfig(target);
  const pool = createPool(config, { max: 1 });
  try {
    const { rows: serverRows } = await pool.query<ServerInfo>(`
      SELECT current_setting('server_version') AS server_version,
             current_user,
             current_database(),
             current_schema(),
             has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
             (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
             current_setting('TimeZone') AS timezone`);
    const server = serverRows[0];
    if (!server) throw new Error('El servidor no devolvió información.');

    const { rows: schemaRows } = await pool.query<SchemaInfo>(
      `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS schema_exists,
              (SELECT count(*)::int FROM pg_tables WHERE schemaname = $1 AND tablename <> 'pgmigrations') AS tables,
              NULL::int AS applied_migrations`,
      [config.schema],
    );
    const schema = schemaRows[0];
    if (!schema) throw new Error('No se pudo leer el estado del esquema.');

    let applied: number | null = null;
    const { rows: tableRows } = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass(format('%I.pgmigrations', $1::text)) IS NOT NULL AS exists`,
      [config.schema],
    );
    if (tableRows[0]?.exists) {
      // El nombre del esquema está validado por loadDbConfig ([a-z0-9_]).
      const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${config.schema}".pgmigrations`);
      applied = rows[0]?.n ?? 0;
    }

    console.log(`\n[${target}] esquema "${config.schema}"`);
    console.log(`  Servidor ............ PostgreSQL ${server.server_version}`);
    console.log(`  Base / usuario ...... ${server.current_database} / ${server.current_user}`);
    console.log(`  search_path activo .. ${server.current_schema ?? '(el esquema aún no existe)'}`);
    console.log(`  Puede crear esquemas  ${server.can_create_schema ? 'sí' : 'NO'}`);
    console.log(`  Superusuario ........ ${server.is_superuser ? 'sí' : 'no'}`);
    console.log(`  Zona horaria ........ ${server.timezone}`);
    console.log(`  Esquema existe ...... ${schema.schema_exists ? 'sí' : 'no'}`);
    console.log(`  Tablas de la app .... ${schema.tables}`);
    console.log(`  Migraciones aplicadas ${applied ?? 'ninguna (sin tabla pgmigrations)'}`);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const { host, port, database, user } = summarizeConnection(loadDbConfig('dev').connectionString);
  console.log(`Conectando a ${host}:${port}, base "${database}", usuario "${user}"...`);
  await inspect('dev');
  await inspect('test');
  console.log('\nConexión correcta.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError de conexión: ${message}`);
  process.exitCode = 1;
});
