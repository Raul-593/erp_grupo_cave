'use server';

import { redirect } from 'next/navigation';
import { getUser, getUserByAuthSubject, recordAudit, recordLogin, withTransaction } from '@erp/db';
import { homePath } from '@/domain/access/permissions';
import { authProvider, devAuthProvider, supabaseAuthProvider } from '@/integrations/auth/config';
import { MIN_PASSWORD_LENGTH } from '@/integrations/auth/supabase';
import { AuthConfigError } from '@/integrations/auth/types';
import { CHANGE_PASSWORD_PATH, getSession, getSessionUser } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { idSchema } from '../schemas';

/**
 * «Entrar como…» (solo desarrollo local, decisión U-D1). `authProvider()` rechaza el ingreso
 * si la base no es local, si la petición no llega a 127.0.0.1 o si corre en un hosting.
 */
export async function signInAsDev(_prev: { message: string } | null, formData: FormData): Promise<{ message: string } | null> {
  const id = idSchema('Usuario').safeParse(formData.get('userId'));
  if (!id.success) return { message: 'Elige un usuario.' };
  let target: string;
  try {
    const provider = await authProvider();
    if (provider.id !== 'dev') return { message: 'El ingreso sin contraseña no está disponible.' };
    const user = await getUser(db(), id.data);
    if (!user || !user.active) return { message: 'Ese usuario no existe o está desactivado.' };
    await withTransaction(db(), async (tx) => {
      await recordLogin(tx, user.id);
      await recordAudit(tx, { userId: user.id, action: 'session.sign_in', entity: 'app_users', entityId: user.id, details: { provider: 'dev' } });
    });
    await devAuthProvider.signInAs(user.id);
    target = homePath(user.role);
  } catch (error) {
    if (error instanceof AuthConfigError) return { message: error.message };
    return { message: toUserMessage(error) };
  }
  redirect(target);
}

const SIGN_IN_FAILED = 'Correo o contraseña incorrectos.';

/**
 * Ingreso con correo y contraseña (Supabase Auth, decisión S-D6). Solo entran las identidades
 * vinculadas a un usuario activo de la aplicación. Con contraseña temporal, lleva a cambiarla.
 */
export async function signInWithPassword(_prev: { message: string } | null, formData: FormData): Promise<{ message: string } | null> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { message: 'Escribe tu correo y tu contraseña.' };
  if (email.length > 200 || password.length > 200) return { message: SIGN_IN_FAILED };
  let target: string;
  try {
    const provider = await authProvider();
    if (provider.id !== 'supabase') return { message: 'El ingreso con contraseña no está disponible en este entorno.' };
    const result = await supabaseAuthProvider.signIn(email, password);
    if (!result.ok) return { message: SIGN_IN_FAILED };
    const user = await getUserByAuthSubject(db(), result.authSubject);
    if (!user || !user.active) {
      await supabaseAuthProvider.signOut();
      return { message: 'Tu usuario no está habilitado. Pide acceso al administrador.' };
    }
    await withTransaction(db(), async (tx) => {
      await recordLogin(tx, user.id);
      await recordAudit(tx, { userId: user.id, action: 'session.sign_in', entity: 'app_users', entityId: user.id, details: { provider: 'supabase' } });
    });
    target = result.mustChangePassword ? CHANGE_PASSWORD_PATH : homePath(user.role);
  } catch (error) {
    if (error instanceof AuthConfigError) return { message: error.message };
    return { message: toUserMessage(error) };
  }
  redirect(target);
}

/**
 * Cambio de la contraseña propia (Supabase Auth). Requiere sesión, no un permiso: cualquier
 * usuario activo cambia la suya. Obligatorio tras entrar con una contraseña temporal.
 */
export async function changeOwnPassword(_prev: { message: string } | null, formData: FormData): Promise<{ message: string } | null> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) return { message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  if (password.length > 200) return { message: 'La contraseña es demasiado larga.' };
  if (password !== confirm) return { message: 'Las dos contraseñas no coinciden.' };
  let target: string;
  try {
    const session = await getSession();
    if (!session) return { message: 'Tu sesión terminó. Vuelve a entrar.' };
    const provider = await authProvider();
    if (provider.id !== 'supabase') return { message: 'El cambio de contraseña no está disponible en este entorno.' };
    const result = await supabaseAuthProvider.changePassword(password);
    if (!result.ok) return { message: result.message };
    await recordAudit(db(), { userId: session.user.id, action: 'session.change_password', entity: 'app_users', entityId: session.user.id });
    target = homePath(session.user.role);
  } catch (error) {
    if (error instanceof AuthConfigError) return { message: error.message };
    return { message: toUserMessage(error) };
  }
  redirect(target);
}

/** Cierra la sesión y vuelve a «Entrar». */
export async function signOut(): Promise<void> {
  const user = await getSessionUser();
  try {
    const provider = await authProvider();
    if (user) {
      await recordAudit(db(), { userId: user.id, action: 'session.sign_out', entity: 'app_users', entityId: user.id });
    }
    await provider.signOut();
  } catch (error) {
    if (!(error instanceof AuthConfigError)) toUserMessage(error);
    await devAuthProvider.signOut();
  }
  redirect('/entrar');
}
