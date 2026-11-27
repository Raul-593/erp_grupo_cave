'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createWorker, updateWorker } from '@erp/db';
import { formValues, type ActionState } from '@/lib/action-state';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { fieldErrors, idSchema, versionSchema, workerFormSchema } from '../schemas';

/** Alta o edición de un trabajador. */
export async function saveWorker(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = workerFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  try {
    if (values['id']) {
      const id = idSchema('Trabajador').parse(values['id']);
      await updateWorker(db(), id, versionSchema.parse(values['version']), parsed.data);
    } else {
      await createWorker(db(), parsed.data);
    }
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  revalidatePath('/operacion', 'layout');
  redirect('/operacion/trabajadores');
}

/** Activa o desactiva un trabajador. Los trabajadores no se borran. */
export async function setWorkerActive(formData: FormData): Promise<void> {
  const id = idSchema('Trabajador').safeParse(formData.get('id'));
  const version = versionSchema.safeParse(formData.get('version'));
  if (!id.success || !version.success) return;
  try {
    await updateWorker(db(), id.data, version.data, { active: formData.get('active') === 'true' });
  } catch (error) {
    toUserMessage(error);
  }
  revalidatePath('/operacion', 'layout');
}
