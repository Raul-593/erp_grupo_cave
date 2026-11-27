import path from 'node:path';
import { createLocalStorage } from '@/integrations/storage/local';
import type { FileStorage } from '@/integrations/storage/types';
import { DEFAULT_MAX_PDF_BYTES } from '@/lib/pdf';

const store = globalThis as typeof globalThis & { __erpStorage?: FileStorage };

/**
 * Carpeta privada de archivos: STORAGE_LOCAL_DIR (absoluta, o relativa a la raíz del
 * workspace). Por omisión, `storage/` en la raíz (excluida de Git).
 */
export function storageRoot(): string {
  const workspaceRoot = process.env['ERP_ROOT'] ?? path.resolve(process.cwd(), '../..');
  const configured = process.env['STORAGE_LOCAL_DIR']?.trim();
  return path.resolve(workspaceRoot, configured || 'storage');
}

export function fileStorage(): FileStorage {
  store.__erpStorage ??= createLocalStorage(storageRoot());
  return store.__erpStorage;
}

/** Tamaño máximo de un TDR: TDR_MAX_BYTES o 50 MB. */
export function maxTdrBytes(): number {
  const value = Number(process.env['TDR_MAX_BYTES']);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_PDF_BYTES;
}
