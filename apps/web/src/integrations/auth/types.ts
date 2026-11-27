/**
 * Interfaz común de autenticación (PLAN.md, parte U, decisión U-D1). La aplicación solo sabe
 * qué usuario (`app_users.id`) hace la petición; cómo se comprueba depende del adaptador:
 * `dev` (solo desarrollo local, sin contraseña) y, en la parte S, `supabase` (Supabase Auth).
 */
export type AuthProviderId = 'dev' | 'supabase';

export interface AuthProvider {
  readonly id: AuthProviderId;
  /** Usuario de la petición actual, o null si no hay sesión. No comprueba si está activo. */
  currentUserId(): Promise<string | null>;
  /** Cierra la sesión de la petición actual. */
  signOut(): Promise<void>;
}

/** El adaptador elegido no puede usarse en este entorno (ver `checkDevAuthAllowed`). */
export class AuthConfigError extends Error {
  override name = 'AuthConfigError';
}
