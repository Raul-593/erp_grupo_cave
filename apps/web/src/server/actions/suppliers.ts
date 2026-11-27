'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupplier, updateSupplier } from '@erp/db';
import { formValues, type ActionState } from '@/lib/action-state';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { fieldErrors, idSchema, supplierFormSchema, versionSchema } from '../schemas';

/** Alta o edición de un proveedor. */
export async function saveSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = supplierFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  try {
    if (values['id']) {
      const id = idSchema('Proveedor').parse(values['id']);
      await updateSupplier(db(), id, versionSchema.parse(values['version']), parsed.data);
    } else {
      await createSupplier(db(), parsed.data);
    }
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  revalidatePath('/operacion', 'layout');
  redirect('/operacion/proveedores');
}

/** Activa o desactiva un proveedor. Los proveedores no se borran. */
export async function setSupplierActive(formData: FormData): Promise<void> {
  const id = idSchema('Proveedor').safeParse(formData.get('id'));
  const version = versionSchema.safeParse(formData.get('version'));
  if (!id.success || !version.success) return;
  try {
    await updateSupplier(db(), id.data, version.data, { active: formData.get('active') === 'true' });
  } catch (error) {
    toUserMessage(error);
  }
  revalidatePath('/operacion', 'layout');
}
