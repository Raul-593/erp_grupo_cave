import { cookies } from 'next/headers';
import type { AuthProvider } from './types';

/**
 * Adaptador de desarrollo: «Entrar como…» sin contraseña. La cookie guarda solo el id del
 * usuario; el servidor comprueba en cada petición que exista, esté activo y que el entorno sea
 * local (`dev-guard.ts`). No sirve fuera de este computador ni con una base remota.
 */
export const DEV_SESSION_COOKIE = 'erp_sesion_dev';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TWELVE_HOURS = 60 * 60 * 12;

export const devAuthProvider: AuthProvider & { signInAs(userId: string): Promise<void> } = {
  id: 'dev',
  async currentIdentity() {
    const value = (await cookies()).get(DEV_SESSION_COOKIE)?.value;
    return value && UUID.test(value) ? { kind: 'user', userId: value } : null;
  },
  async signOut() {
    (await cookies()).delete(DEV_SESSION_COOKIE);
  },
  /** Solo desde Server Actions, después de comprobar el entorno y el usuario. */
  async signInAs(userId: string) {
    (await cookies()).set(DEV_SESSION_COOKIE, userId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: TWELVE_HOURS,
    });
  },
};
