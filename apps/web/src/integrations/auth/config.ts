/**
 * Elección del adaptador de autenticación (variable AUTH_PROVIDER; `dev` si no se indica).
 * El adaptador `supabase` llega en la parte S del plan: hasta entonces se rechaza con un error
 * controlado en lugar de degradar en silencio a `dev`.
 */
import { headers } from 'next/headers';
import { devAuthProvider } from './dev';
import { devAuthProblem } from './dev-guard';
import { AuthConfigError, type AuthProvider } from './types';

export async function authProvider(): Promise<AuthProvider> {
  const configured = process.env['AUTH_PROVIDER']?.trim() || 'dev';
  if (configured !== 'dev') {
    throw new AuthConfigError(`El proveedor de autenticación «${configured}» todavía no está disponible.`);
  }
  const problem = devAuthProblem(process.env, (await headers()).get('host'));
  if (problem) throw new AuthConfigError(problem);
  return devAuthProvider;
}

export { devAuthProvider };
