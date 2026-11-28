'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createWorker, updateWorker, withTransaction } from '@erp/db';
import { formValues, type ActionState } from '@/lib/action-state';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { fieldErrors, idSchema, versionSchema, workerFormSchema } from '../schemas';

/** Alta o edición de un trabajador. */
export async function saveWorker(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const auth = await authorize('catalogs.write');
  if (!auth.ok) return { status: 'error', message: auth.message, values };
  const parsed = workerFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  try {
    await withTransaction(db(), async (tx) => {
      if (values['id']) {
        const id = idSchema('Trabajador').parse(values['id']);
        await updateWorker(tx, id, versionSchema.parse(values['version']), parsed.data);
        await audit(tx, auth.user, 'worker.update', 'workers', id, { fullName: parsed.data.fullName, active: parsed.data.active });
      } else {
        const id = await createWorker(tx, parsed.data);
        await audit(tx, auth.user, 'worker.create', 'workers', id, { fullName: parsed.data.fullName });
      }
    });
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  revalidatePath('/operacion', 'layout');
  redirect('/administracion/trabajadores');
}

/** Activa o desactiva un trabajador. Los trabajadores no se borran. */
export async function setWorkerActive(formData: FormData): Promise<void> {
  const id = idSchema('Trabajador').safeParse(formData.get('id'));
  const version = versionSchema.safeParse(formData.get('version'));
  if (!id.success || !version.success) return;
  const auth = await authorize('catalogs.write');
  if (!auth.ok) return;
  const active = formData.get('active') === 'true';
  try {
    await withTransaction(db(), async (tx) => {
      await updateWorker(tx, id.data, version.data, { active });
      await audit(tx, auth.user, 'worker.set_active', 'workers', id.data, { active });
    });
  } catch (error) {
    toUserMessage(error);
  }
  revalidatePath('/operacion', 'layout');
}
