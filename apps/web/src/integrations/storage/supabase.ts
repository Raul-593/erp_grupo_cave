import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// Extensión explícita: este módulo también se usa desde scripts de Node (sin empaquetador).
import { assertSafeKey, StorageKeyError, type FileStorage, type SignedUpload } from './types.ts';

/**
 * Almacenamiento en Supabase Storage (producción, AGENTS.md §9). Buckets privados: el primer
 * segmento de la clave es el bucket («tdr/…» → bucket `tdr`, «evidencias/…» → `evidencias`).
 * Usa la clave secreta del proyecto: solo en el servidor, nunca en el navegador.
 */
export const SUPABASE_BUCKETS = {
  tdr: { fileSizeLimit: 52_428_800, allowedMimeTypes: ['application/pdf'] },
  evidencias: { fileSizeLimit: 15_728_640, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
} as const;

type Bucket = keyof typeof SUPABASE_BUCKETS;

export function splitKey(key: string): { bucket: Bucket; path: string } {
  assertSafeKey(key);
  const [bucket, ...rest] = key.split('/');
  if (!bucket || !(bucket in SUPABASE_BUCKETS) || rest.length === 0) throw new StorageKeyError('Clave de almacenamiento no válida.');
  return { bucket: bucket as Bucket, path: rest.join('/') };
}

export function supabaseAdminClient(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function createSupabaseStorage(client: SupabaseClient): FileStorage {
  const fail = (action: string, error: { message: string }) => new Error(`Almacenamiento: no se pudo ${action} (${error.message}).`);
  return {
    provider: 'supabase',
    async put(key, data) {
      const { bucket, path } = splitKey(key);
      const { error } = await client.storage.from(bucket).upload(path, data, { upsert: false, contentType: contentTypeOf(path) });
      if (error) throw fail('guardar el archivo', error);
    },
    async read(key) {
      const { bucket, path } = splitKey(key);
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) throw fail('leer el archivo', error ?? { message: 'sin datos' });
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(key) {
      const { bucket, path } = splitKey(key);
      const { error } = await client.storage.from(bucket).remove([path]);
      if (error) throw fail('eliminar el archivo', error);
    },
    async signedReadUrl(key, seconds) {
      const { bucket, path } = splitKey(key);
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, seconds);
      if (error || !data) throw fail('crear el enlace temporal', error ?? { message: 'sin datos' });
      return data.signedUrl;
    },
    async signedUpload(key): Promise<SignedUpload> {
      const { bucket, path } = splitKey(key);
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
      if (error || !data) throw fail('preparar la subida', error ?? { message: 'sin datos' });
      return { url: data.signedUrl, token: data.token };
    },
  };
}

function contentTypeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}
