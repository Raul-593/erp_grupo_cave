'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createUser, getUser, setUserAuthSubject, updateUser, withTransaction } from '@erp/db';
import { configuredAuthProvider } from '@/integrations/auth/config';
import { formValues, type ActionState } from '@/lib/action-state';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { fieldErrors, idSchema, userFormSchema, versionSchema } from '../schemas';
import { checkTemporaryPassword, createLogin, CredentialError, deleteLogin, updateLogin } from '../user-credentials';

const USUARIOS = '/administracion/usuarios';

/**
 * Alta o edición de un usuario. Solo el superusuario. Con Supabase Auth, el correo es obligatorio
 * y el alta crea su cuenta de ingreso con una contraseña temporal (S-D6); en la edición, una
 * contraseña temporal nueva reemplaza la anterior. La contraseña no se guarda ni se registra.
 */
export async function saveUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  // La contraseña temporal nunca vuelve al navegador.
  const tempPassword = typeof values['tempPassword'] === 'string' && values['tempPassword'] !== '' ? values['tempPassword'] : null;
  delete values['tempPassword'];
  const auth = await authorize('users.manage');
  if (!auth.ok) return { status: 'error', message: auth.message, values };
  const parsed = userFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  const data = parsed.data;
  const credentials = configuredAuthProvider() === 'supabase';
  const editingId = values['id'] ? idSchema('Usuario').safeParse(values['id']) : null;
  if (editingId && !editingId.success) return { status: 'error', message: 'Usuario no válido.', values };
  const id = editingId?.data ?? null;

  if (credentials) {
    const existing = id ? await getUser(db(), id) : null;
    if (id && !existing) return { status: 'error', message: 'El usuario ya no existe.', values };
    const needsLogin = !existing?.authSubject;
    const errors: Record<string, string[]> = {};
    if (!data.email) errors['email'] = ['El correo es obligatorio para entrar al sistema.'];
    const passwordProblem = checkTemporaryPassword(tempPassword, needsLogin);
    if (passwordProblem) errors['tempPassword'] = [passwordProblem];
    if (Object.keys(errors).length > 0) return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: errors, values };
  }

  const details = { fullName: data.fullName, email: data.email, role: data.role, workerId: data.workerId, supplierId: data.supplierId, active: data.active };
  try {
    if (id) {
      const existing = credentials ? await getUser(db(), id) : null;
      let createdLogin: string | null = null;
      if (credentials && !existing?.authSubject) createdLogin = await createLogin(data.email as string, tempPassword as string);
      try {
        await withTransaction(db(), async (tx) => {
          await updateUser(tx, id, versionSchema.parse(values['version']), data);
          if (createdLogin) await setUserAuthSubject(tx, id, createdLogin);
          await audit(tx, auth.user, 'user.update', 'app_users', id, { ...details, passwordReset: Boolean(tempPassword) });
        });
      } catch (error) {
        if (createdLogin) await deleteLogin(createdLogin);
        throw error;
      }
      if (credentials && existing?.authSubject) {
        await updateLogin(existing.authSubject, {
          ...(data.email && data.email !== existing.email ? { email: data.email } : {}),
          ...(tempPassword ? { password: tempPassword } : {}),
        });
      }
    } else {
      const login = credentials ? await createLogin(data.email as string, tempPassword as string) : null;
      try {
        await withTransaction(db(), async (tx) => {
          const newId = await createUser(tx, data);
          if (login) await setUserAuthSubject(tx, newId, login);
          await audit(tx, auth.user, 'user.create', 'app_users', newId, details);
        });
      } catch (error) {
        // Sin usuario en la aplicación, la cuenta de ingreso quedaría huérfana.
        if (login) await deleteLogin(login);
        throw error;
      }
    }
  } catch (error) {
    return { status: 'error', message: error instanceof CredentialError ? error.message : toUserMessage(error), values };
  }
  revalidatePath('/', 'layout');
  redirect(USUARIOS);
}

/** Activa o desactiva un usuario. Los usuarios no se borran. */
export async function setUserActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = idSchema('Usuario').safeParse(formData.get('id'));
  const version = versionSchema.safeParse(formData.get('version'));
  if (!id.success || !version.success) return { status: 'error', message: 'Usuario no válido.' };
  const auth = await authorize('users.manage');
  if (!auth.ok) return { status: 'error', message: auth.message };
  const active = formData.get('active') === 'true';
  try {
    await withTransaction(db(), async (tx) => {
      await updateUser(tx, id.data, version.data, { active });
      await audit(tx, auth.user, 'user.set_active', 'app_users', id.data, { active });
    });
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) };
  }
  revalidatePath('/', 'layout');
  return { status: 'ok', message: active ? 'Usuario activado.' : 'Usuario desactivado.' };
}
