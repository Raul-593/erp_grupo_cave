/**
 * Credenciales de los usuarios en Supabase Auth (PLAN.md, parte S, S-D6): el superusuario crea
 * cada usuario con una contraseña temporal que la persona cambia al entrar. Solo servidor.
 * La contraseña nunca se guarda en la base de la aplicación ni en el historial.
 */
import { MIN_PASSWORD_LENGTH, MUST_CHANGE_PASSWORD, supabaseAuthAdmin } from '@/integrations/auth/supabase';

export class CredentialError extends Error {
  override name = 'CredentialError';
}

function authError(error: { code?: string; message: string }): CredentialError {
  if (error.code === 'email_exists' || /already been registered/i.test(error.message)) {
    return new CredentialError('Ya existe una cuenta de ingreso con ese correo.');
  }
  if (error.code === 'weak_password') return new CredentialError('La contraseña temporal es demasiado débil.');
  console.error('[erp] Error de Supabase Auth', { code: error.code });
  return new CredentialError('No se pudo guardar el acceso del usuario. Inténtalo de nuevo.');
}

export function checkTemporaryPassword(password: string | null, required: boolean): string | null {
  if (!password) return required ? 'Escribe una contraseña temporal.' : null;
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña temporal debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password.length > 200) return 'La contraseña temporal es demasiado larga.';
  return null;
}

/** Crea la cuenta de ingreso y devuelve su id (`auth_subject`). */
export async function createLogin(email: string, password: string): Promise<string> {
  const { data, error } = await supabaseAuthAdmin().createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { [MUST_CHANGE_PASSWORD]: true },
  });
  if (error || !data.user) throw authError(error ?? { message: 'sin usuario' });
  return data.user.id;
}

/** Borra una cuenta recién creada cuando el alta en la aplicación falla (compensación). */
export async function deleteLogin(authSubject: string): Promise<void> {
  const { error } = await supabaseAuthAdmin().deleteUser(authSubject);
  if (error) console.error('[erp] No se pudo borrar la cuenta de ingreso huérfana', { authSubject });
}

/** Cambia el correo y/o asigna una contraseña temporal nueva. */
export async function updateLogin(authSubject: string, changes: { email?: string; password?: string }): Promise<void> {
  if (!changes.email && !changes.password) return;
  const { error } = await supabaseAuthAdmin().updateUserById(authSubject, {
    ...(changes.email ? { email: changes.email, email_confirm: true } : {}),
    ...(changes.password ? { password: changes.password, user_metadata: { [MUST_CHANGE_PASSWORD]: true } } : {}),
  });
  if (error) throw authError(error);
}
