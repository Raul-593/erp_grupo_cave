import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseAdminClient } from '@/integrations/storage/supabase';
import { AuthConfigError, type AuthProvider } from './types';

/**
 * Adaptador de Supabase Auth (PLAN.md, parte S, S-D6): correo y contraseña. La sesión vive en
 * cookies httpOnly que gestiona @supabase/ssr; `src/proxy.ts` la renueva en cada petición. Usa
 * la clave publicable (no es secreta); la clave secreta solo para administrar usuarios.
 */

/** Marca en los metadatos del usuario: entró con una contraseña temporal. */
export const MUST_CHANGE_PASSWORD = 'must_change_password';
export const MIN_PASSWORD_LENGTH = 10;

export function supabaseAuthSettings(env: Readonly<Record<string, string | undefined>> = process.env): { url: string; publishableKey: string } {
  const url = env['SUPABASE_URL']?.trim();
  const publishableKey = env['SUPABASE_PUBLISHABLE_KEY']?.trim();
  if (!url || !publishableKey) throw new AuthConfigError('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY para el ingreso con Supabase.');
  return { url, publishableKey };
}

/** Cliente de Supabase con la sesión de la petición (cookies). */
export async function supabaseSessionClient(): Promise<SupabaseClient> {
  const { url, publishableKey } = supabaseAuthSettings();
  const store = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items) store.set(name, value, options);
        } catch {
          // En un Server Component no se pueden escribir cookies: las renueva src/proxy.ts.
        }
      },
    },
  });
}

/** Cliente administrador (clave secreta): crear usuarios y cambiar contraseñas. Solo servidor. */
export function supabaseAuthAdmin(): SupabaseClient['auth']['admin'] {
  const url = process.env['SUPABASE_URL']?.trim();
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim();
  if (!url || !key) throw new AuthConfigError('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para administrar usuarios.');
  return supabaseAdminClient(url, key).auth.admin;
}

export const supabaseAuthProvider: AuthProvider & {
  signIn(email: string, password: string): Promise<{ ok: true; authSubject: string; mustChangePassword: boolean } | { ok: false }>;
  changePassword(password: string): Promise<{ ok: true; sessionRenewed: boolean } | { ok: false; message: string }>;
} = {
  id: 'supabase',
  async currentIdentity() {
    const client = await supabaseSessionClient();
    // getClaims verifica la firma del token (no se confía en la cookie sin comprobarla).
    const { data, error } = await client.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) return null;
    const metadata = (claims['user_metadata'] ?? {}) as Record<string, unknown>;
    return { kind: 'subject', authSubject: claims.sub, mustChangePassword: metadata[MUST_CHANGE_PASSWORD] === true };
  },
  async signOut() {
    const client = await supabaseSessionClient();
    await client.auth.signOut();
  },
  async signIn(email, password) {
    const client = await supabaseSessionClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false };
    return { ok: true, authSubject: data.user.id, mustChangePassword: data.user.user_metadata?.[MUST_CHANGE_PASSWORD] === true };
  },
  async changePassword(password) {
    const client = await supabaseSessionClient();
    const { error } = await client.auth.updateUser({ password, data: { [MUST_CHANGE_PASSWORD]: false } });
    if (!error) {
      // El token de la cookie conserva los metadatos de cuando se emitió (must_change_password =
      // true) y currentIdentity lo lee de ahí: sin renovarlo, la persona volvería a esta página.
      // Renovar la sesión emite un token con los metadatos nuevos y lo guarda en las cookies.
      const refreshed = await client.auth.refreshSession();
      const renewed = !refreshed.error && refreshed.data.user?.user_metadata?.[MUST_CHANGE_PASSWORD] !== true;
      return { ok: true, sessionRenewed: renewed };
    }
    if (error.code === 'same_password') return { ok: false, message: 'La contraseña nueva debe ser distinta de la actual.' };
    if (error.code === 'weak_password') return { ok: false, message: 'La contraseña es demasiado débil. Usa una más larga o variada.' };
    return { ok: false, message: 'No se pudo cambiar la contraseña. Vuelve a entrar e inténtalo de nuevo.' };
  },
};
