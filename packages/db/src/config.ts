/**
 * Configuración de la conexión a PostgreSQL a partir de variables de entorno.
 * Nunca registra ni devuelve la contraseña.
 */

import { readFileSync } from 'node:fs';

/**
 * dev: base de la aplicación (DATABASE_URL); test: esquema de pruebas en la misma base;
 * supabase: proyecto de Supabase con el usuario administrador (SUPABASE_DATABASE_URL), solo
 * para scripts de migración y carga. La aplicación publicada usa `dev` con su propia URL.
 */
export type DbTarget = 'dev' | 'test' | 'supabase';

export interface DbConfig {
  readonly target: DbTarget;
  readonly connectionString: string;
  /** Esquema donde viven las tablas de la aplicación para este entorno. */
  readonly schema: string;
  /** Certificado de la CA del servidor (PEM) para verificar TLS; null en una base local. */
  readonly sslCa: string | null;
}

export interface ConnectionSummary {
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly user: string;
}

const DEFAULT_SCHEMAS: Readonly<Record<DbTarget, string>> = { dev: 'erp', test: 'erp_test', supabase: 'erp' };
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
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

/**
 * Certificado para verificar TLS con una base remota: DATABASE_SSL_CA (contenido PEM, cómodo en
 * un hosting) o DATABASE_SSL_CA_FILE (ruta a un archivo .crt fuera de Git). Una base remota sin
 * certificado se rechaza: nunca se conecta sin verificar el servidor.
 */
export function readSslCa(env: NodeJS.ProcessEnv, host: string): string | null {
  if (LOOPBACK.has(host.toLowerCase())) return null;
  const inline = env['DATABASE_SSL_CA']?.trim();
  if (inline) return inline.replace(/\\n/g, '\n');
  const file = env['DATABASE_SSL_CA_FILE']?.trim();
  if (!file) {
    throw new DbConfigError(
      `La base ${host} es remota: indique su certificado con DATABASE_SSL_CA_FILE (ruta al .crt) o DATABASE_SSL_CA (contenido PEM).`,
    );
  }
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new DbConfigError(`No se pudo leer el certificado indicado en DATABASE_SSL_CA_FILE.`);
  }
}

export function loadDbConfig(target: DbTarget, env: NodeJS.ProcessEnv = process.env): DbConfig {
  const urlVar = target === 'supabase' ? 'SUPABASE_DATABASE_URL' : 'DATABASE_URL';
  const connectionString = env[urlVar]?.trim();
  if (!connectionString) {
    throw new DbConfigError(`Falta ${urlVar}. Copie .env.example como .env y complete los valores.`);
  }
  if (connectionString.includes(PLACEHOLDER_PASSWORD)) {
    throw new DbConfigError(`${urlVar} todavía contiene la contraseña de ejemplo de .env.example.`);
  }
  // Valida el formato sin exponer el valor.
  const { host } = summarizeConnection(connectionString);
  const sslCa = readSslCa(env, host);
  if (target === 'supabase') return { target, connectionString, schema: DEFAULT_SCHEMAS.supabase, sslCa };

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

  return { target, connectionString, schema: target === 'test' ? testSchema : devSchema, sslCa };
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
