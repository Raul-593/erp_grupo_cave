/**
 * Interfaz común de autenticación (PLAN.md, parte U, decisión U-D1). La aplicación solo sabe
 * quién hace la petición; cómo se comprueba depende del adaptador: `dev` (solo desarrollo local,
 * sin contraseña) y `supabase` (Supabase Auth, correo y contraseña).
 */
export type AuthProviderId = 'dev' | 'supabase';

/** Identidad de la petición: el usuario de la aplicación, o su identidad en Supabase Auth. */
export type AuthIdentity =
  | { kind: 'user'; userId: string }
  | {
      kind: 'subject';
      /** `sub` del usuario en Supabase Auth; se busca en app_users.auth_subject. */
      authSubject: string;
      /** El usuario entró con una contraseña temporal y debe cambiarla. */
      mustChangePassword: boolean;
    };

export interface AuthProvider {
  readonly id: AuthProviderId;
  /** Identidad de la petición actual, o null si no hay sesión. No comprueba si está activo. */
  currentIdentity(): Promise<AuthIdentity | null>;
  /** Cierra la sesión de la petición actual. */
  signOut(): Promise<void>;
}

/** El adaptador elegido no puede usarse en este entorno (ver `checkDevAuthAllowed`). */
export class AuthConfigError extends Error {
  override name = 'AuthConfigError';
}
