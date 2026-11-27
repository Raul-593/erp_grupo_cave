/**
 * Interfaz de almacenamiento de archivos (AGENTS.md §9). El dominio solo conoce claves
 * relativas y opacas; nunca rutas del sistema de archivos ni URLs públicas.
 */
export interface FileStorage {
  readonly provider: 'local' | 'supabase';
  /** Guarda el archivo. Falla si la clave ya existe (no sobrescribe). */
  put(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** Elimina el archivo; no falla si ya no existe. */
  remove(key: string): Promise<void>;
}

export class StorageKeyError extends Error {
  override name = 'StorageKeyError';
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** Misma regla que la restricción tdr_documents_storage_key_safe, más un alfabeto restringido. */
export function assertSafeKey(key: string): void {
  if (key.length > 300 || !SAFE_KEY.test(key) || key.split('/').some((part) => part === '..' || part === '.')) {
    throw new StorageKeyError('Clave de almacenamiento no válida.');
  }
}
