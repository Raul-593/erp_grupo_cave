import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Carga ../../.env (si existe) para que las pruebas usen DATABASE_URL y TEST_DATABASE_SCHEMA.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Las pruebas comparten una base real: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
