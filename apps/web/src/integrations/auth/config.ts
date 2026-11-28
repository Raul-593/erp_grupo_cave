/**
 * Elección del adaptador de autenticación (variable AUTH_PROVIDER; `dev` si no se indica).
 * Un valor desconocido se rechaza con un error controlado en lugar de degradar en silencio a `dev`.
 */
import { headers } from 'next/headers';
import { devAuthProvider } from './dev';
import { devAuthProblem } from './dev-guard';
import { supabaseAuthProvider, supabaseAuthSettings } from './supabase';
import { AuthConfigError, type AuthProvider } from './types';

export function configuredAuthProvider(): 'dev' | 'supabase' | string {
  return process.env['AUTH_PROVIDER']?.trim() || 'dev';
}

export async function authProvider(): Promise<AuthProvider> {
  const configured = configuredAuthProvider();
  if (configured === 'supabase') {
    supabaseAuthSettings();
    return supabaseAuthProvider;
  }
  if (configured !== 'dev') {
    throw new AuthConfigError(`El proveedor de autenticación «${configured}» no existe (use dev o supabase).`);
  }
  const problem = devAuthProblem(process.env, (await headers()).get('host'));
  if (problem) throw new AuthConfigError(problem);
  return devAuthProvider;
}

export { devAuthProvider, supabaseAuthProvider };
