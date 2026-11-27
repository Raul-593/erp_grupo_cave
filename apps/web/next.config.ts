import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Las variables viven en el .env de la raíz del workspace (no se versiona). Se cargan solo
// en el proceso del servidor: no se usa la opción `env`, que las copiaría al navegador.
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
