/**
 * Arranca la aplicación compilada (`pnpm build`) en este equipo conectada a Supabase:
 * ERP_ENV_FILE=.env.supabase hace que next.config.ts cargue esa conexión antes que el .env local.
 * Solo para verificar; la publicación usa las variables del hosting.
 *
 *   pnpm --filter web start:supabase     → http://127.0.0.1:3200
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const next = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', '3200'], {
  stdio: 'inherit',
  env: { ...process.env, ERP_ENV_FILE: '.env.supabase' },
});
child.on('exit', (code) => process.exit(code ?? 0));
