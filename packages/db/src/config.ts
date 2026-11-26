/**
 * Configuración de la conexión a PostgreSQL a partir de variables de entorno.
 * Nunca registra ni devuelve la contraseña.
 */

export type DbTarget = 'dev' | 'test';

export interface DbConfig {
  readonly target: DbTarget;
  readonly connectionString: string;
  /** Esquema donde viven las tablas de la aplicación para este entorno. */
  readonly schema: string;
}

export interface ConnectionSummary {
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly user: string;
}

const DEFAULT_SCHEMAS: Readonly<Record<DbTarget, string>> = { dev: 'erp', test: 'erp_test' };
const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const PLACEHOLDER_PASSWORD = 'CAMBIAR_CONTRASENA';

export class DbConfigError extends Error {
  override name = 'DbConfigError';
}

function readSchema(value: string | undefined, target: DbTarget): string {
  const schema = value?.trim() || DEFAULT_SCHEMAS[target];
  if (!SCHEMA_PATTERN.test(schema)) {
    throw new DbConfigError(
      `Nombre de esquema no válido para ${target}: use minúsculas, dígitos y "_" (máx. 63 caracteres).`,
    );
  }
  return schema;
}

export function loadDbConfig(target: DbTarget, env: NodeJS.ProcessEnv = process.env): DbConfig {
  const connectionString = env['DATABASE_URL']?.trim();
  if (!connectionString) {
    throw new DbConfigError('Falta DATABASE_URL. Copie .env.example como .env y complete los valores.');
  }
  if (connectionString.includes(PLACEHOLDER_PASSWORD)) {
    throw new DbConfigError('DATABASE_URL todavía contiene la contraseña de ejemplo de .env.example.');
  }
  // Valida el formato sin exponer el valor.
  summarizeConnection(connectionString);

  const devSchema = readSchema(env['DATABASE_SCHEMA'], 'dev');
  const testSchema = readSchema(env['TEST_DATABASE_SCHEMA'], 'test');

  // Salvaguardas para que las pruebas nunca escriban en el esquema de desarrollo.
  if (devSchema === testSchema) {
    throw new DbConfigError('DATABASE_SCHEMA y TEST_DATABASE_SCHEMA deben ser distintos.');
  }
  if (!testSchema.endsWith('_test')) {
    throw new DbConfigError('TEST_DATABASE_SCHEMA debe terminar en "_test".');
  }
  if (devSchema.endsWith('_test')) {
    throw new DbConfigError('DATABASE_SCHEMA no puede terminar en "_test".');
  }

  return { target, connectionString, schema: target === 'test' ? testSchema : devSchema };
}

/** Datos de conexión aptos para mostrar en consola (sin contraseña). */
export function summarizeConnection(connectionString: string): ConnectionSummary {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DbConfigError(
      'DATABASE_URL no tiene un formato válido (postgres://usuario:contraseña@host:puerto/base). ' +
        'Si la contraseña tiene caracteres especiales, codifíquelos en la URL.',
    );
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new DbConfigError('DATABASE_URL debe comenzar con postgres:// o postgresql://.');
  }
  return {
    host: url.hostname,
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    user: decodeURIComponent(url.username),
  };
}
