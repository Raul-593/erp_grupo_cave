import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Las variables viven en el .env de la raíz del workspace (no se versiona). Se cargan solo
// en el proceso del servidor: no se usa la opción `env`, que las copiaría al navegador.
// ERP_ENV_FILE (relativo a la raíz, p. ej. .env.supabase) se carga antes: sus valores mandan,
// porque loadEnvFile no reemplaza variables ya definidas. Así se prueba contra Supabase sin
// tocar el .env local.
const overrideEnv = process.env['ERP_ENV_FILE']?.trim();
if (overrideEnv) {
  const file = fileURLToPath(new URL(`../../${overrideEnv}`, import.meta.url));
  if (!existsSync(file)) throw new Error(`No existe ERP_ENV_FILE=${overrideEnv}.`);
  process.loadEnvFile(file);
}
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
// Raíz del workspace: base de las rutas relativas (p. ej. STORAGE_LOCAL_DIR).
process.env['ERP_ROOT'] ??= fileURLToPath(new URL('../../', import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Paquete del workspace que exporta TypeScript.
  transpilePackages: ['@erp/db'],
};

export default nextConfig;
