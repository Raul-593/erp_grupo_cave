import pg from 'pg';
import type { DbConfig } from './config.ts';

/**
 * Tipos de PostgreSQL que se devuelven como texto para no perder exactitud:
 * - date: evita que una fecha operativa se desplace por la zona horaria del proceso.
 * - numeric: pg ya lo devuelve como texto; se deja explícito para cantidades exactas.
 */
const TEXT_TYPE_OIDS: ReadonlySet<number> = new Set([pg.types.builtins.DATE, pg.types.builtins.NUMERIC]);

const typeParsers: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    if (TEXT_TYPE_OIDS.has(oid) && format !== 'binary') {
      return (value: string) => value;
    }
    return pg.types.getTypeParser(oid, format ?? 'text');
  }) as pg.CustomTypesConfig['getTypeParser'],
};

/**
 * Crea un pool de conexiones cuyo search_path apunta al esquema del entorno
 * (erp en desarrollo, erp_test en pruebas). Las consultas deben usar parámetros ($1, $2...).
 */
export function createPool(config: DbConfig, overrides: pg.PoolConfig = {}): pg.Pool {
  return new pg.Pool({
    connectionString: config.connectionString,
    // El nombre del esquema ya fue validado en loadDbConfig (solo [a-z0-9_]).
    options: `-c search_path=${config.schema}`,
    application_name: 'erp_v1',
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 10,
    types: typeParsers,
    ...overrides,
  });
}

/** Ejecuta `work` dentro de una transacción; hace ROLLBACK si lanza un error. */
export async function withTransaction<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
