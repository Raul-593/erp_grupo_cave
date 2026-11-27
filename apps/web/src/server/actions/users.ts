'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createUser, updateUser, withTransaction } from '@erp/db';
import { formValues, type ActionState } from '@/lib/action-state';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { fieldErrors, idSchema, userFormSchema, versionSchema } from '../schemas';

const USUARIOS = '/administracion/usuarios';

/** Alta o edición de un usuario. Solo el superusuario. */
export async function saveUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const auth = await authorize('users.manage');
  if (!auth.ok) return { status: 'error', message: auth.message, values };
  const parsed = userFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  const data = parsed.data;
  const details = { fullName: data.fullName, email: data.email, role: data.role, workerId: data.workerId, supplierId: data.supplierId, active: data.active };
  try {
    await withTransaction(db(), async (tx) => {
      if (values['id']) {
        const id = idSchema('Usuario').parse(values['id']);
        await updateUser(tx, id, versionSchema.parse(values['version']), data);
        await audit(tx, auth.user, 'user.update', 'app_users', id, details);
      } else {
        const id = await createUser(tx, data);
        await audit(tx, auth.user, 'user.create', 'app_users', id, details);
      }
    });
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
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
