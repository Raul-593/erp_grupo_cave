import type pg from 'pg';

/** Pool o cliente de una transacción: los repositorios funcionan con ambos. */
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

/** Error de concurrencia optimista: el registro cambió (o no existe) desde que se leyó. */
export class VersionConflictError extends Error {
  override name = 'VersionConflictError';
  readonly entity: string;
  readonly id: string;
  constructor(entity: string, id: string) {
    super(`El registro ${entity} ${id} cambió o ya no existe.`);
    this.entity = entity;
    this.id = id;
  }
}

/**
 * Construye "col1 = $n, col2 = $n+1" a partir de un parche y un mapa fijo de columnas.
 * Solo se aceptan claves del mapa: los nombres de columna nunca provienen de la entrada.
 */
export function buildSet<K extends string>(
  patch: Partial<Record<K, unknown>>,
  columns: Readonly<Record<K, string>>,
  firstParam: number,
): { sql: string; values: unknown[] } {
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(columns) as K[]) {
    if (!Object.hasOwn(patch, key)) continue;
    const value = patch[key];
    if (value === undefined) continue;
    values.push(value);
    parts.push(`${columns[key]} = $${firstParam + values.length - 1}`);
  }
  return { sql: parts.join(', '), values };
}
