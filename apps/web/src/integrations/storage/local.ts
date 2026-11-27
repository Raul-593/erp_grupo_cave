import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
// Extensión explícita: este módulo también se usa desde scripts de Node (sin empaquetador).
import { assertSafeKey, StorageKeyError, type FileStorage } from './types.ts';

/**
 * Almacenamiento en una carpeta local privada (desarrollo). La carpeta debe estar fuera de
 * las rutas públicas y excluida de Git (`storage/` en .gitignore).
 */
export function createLocalStorage(rootDir: string): FileStorage {
  const root = path.resolve(rootDir);

  function resolveKey(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(root, ...key.split('/'));
    // Defensa adicional contra path traversal.
    if (!full.startsWith(root + path.sep)) throw new StorageKeyError('Clave de almacenamiento fuera de la carpeta.');
    return full;
  }

  return {
    provider: 'local',
    async put(key, data) {
      const full = resolveKey(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data, { flag: 'wx' });
    },
    async read(key) {
      return readFile(resolveKey(key));
    },
    async remove(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}
