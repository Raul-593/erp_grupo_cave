/**
 * Buckets privados de Supabase Storage (PLAN.md, parte S, S-D5). Idempotente: crea los que
 * falten y ajusta límites de tamaño y tipos permitidos; nunca los vuelve públicos ni borra nada.
 *
 *   pnpm db:supabase:storage
 */
import { SUPABASE_BUCKETS, supabaseAdminClient } from '../src/integrations/storage/supabase.ts';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en .env.`);
  return value;
}

async function main(): Promise<void> {
  const storage = supabaseAdminClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY')).storage;
  for (const [id, limits] of Object.entries(SUPABASE_BUCKETS)) {
    const options = { public: false, fileSizeLimit: limits.fileSizeLimit, allowedMimeTypes: [...limits.allowedMimeTypes] };
    const { data: existing } = await storage.getBucket(id);
    const { error } = existing ? await storage.updateBucket(id, options) : await storage.createBucket(id, options);
    if (error) throw new Error(`Bucket ${id}: ${error.message}`);
    const { data } = await storage.getBucket(id);
    console.log(
      `${existing ? 'Actualizado' : 'Creado'} ${id}: ${data?.public ? 'PÚBLICO (revisar)' : 'privado'}, máx. ${limits.fileSizeLimit / 1048576} MB, ${limits.allowedMimeTypes.join(', ')}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
