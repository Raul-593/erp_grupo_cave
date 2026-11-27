import { createPool, loadDbConfig } from '@erp/db';

type Pool = ReturnType<typeof createPool>;

// Un solo pool por proceso; se guarda en globalThis para sobrevivir a la recarga en desarrollo.
const store = globalThis as typeof globalThis & { __erpPool?: Pool };

/** Pool de PostgreSQL del esquema de desarrollo. Solo se usa en el servidor. */
export function db(): Pool {
  store.__erpPool ??= createPool(loadDbConfig('dev'));
  return store.__erpPool;
}
