import path from 'node:path';
import { createLocalStorage } from '@/integrations/storage/local';
import { createSupabaseStorage, supabaseAdminClient } from '@/integrations/storage/supabase';
import type { FileStorage } from '@/integrations/storage/types';
import { DEFAULT_MAX_IMAGE_BYTES } from '@/lib/image';
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

/**
 * Adaptador según STORAGE_PROVIDER: `local` (por omisión, carpeta privada) o `supabase` (buckets
 * privados; necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, solo en el servidor).
 */
export function fileStorage(): FileStorage {
  store.__erpStorage ??= createStorage();
  return store.__erpStorage;
}

function createStorage(): FileStorage {
  const provider = process.env['STORAGE_PROVIDER']?.trim() || 'local';
  if (provider === 'local') return createLocalStorage(storageRoot());
  if (provider !== 'supabase') throw new Error(`STORAGE_PROVIDER no válido: «${provider}» (use local o supabase).`);
  const url = process.env['SUPABASE_URL']?.trim();
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim();
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para el almacenamiento de Supabase.');
  return createSupabaseStorage(supabaseAdminClient(url, key));
}

/** Segundos de validez de un enlace temporal a un archivo. */
export const SIGNED_URL_SECONDS = 300;

/** Tamaño máximo de una fotografía de evidencia (Ejecución): EVIDENCE_MAX_BYTES o 15 MB. */
export function maxEvidenceBytes(): number {
  const value = Number(process.env['EVIDENCE_MAX_BYTES']);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_IMAGE_BYTES;
}

/** Tamaño máximo de un TDR: TDR_MAX_BYTES o 50 MB. */
export function maxTdrBytes(): number {
  const value = Number(process.env['TDR_MAX_BYTES']);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_PDF_BYTES;
}
