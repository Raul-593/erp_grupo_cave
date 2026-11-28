'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupplier, updateSupplier, withTransaction } from '@erp/db';
import { formValues, type ActionState } from '@/lib/action-state';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { fieldErrors, idSchema, supplierFormSchema, versionSchema } from '../schemas';

/** Alta o edición de un proveedor. */
export async function saveSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const auth = await authorize('catalogs.write');
  if (!auth.ok) return { status: 'error', message: auth.message, values };
  const parsed = supplierFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  try {
    await withTransaction(db(), async (tx) => {
      if (values['id']) {
        const id = idSchema('Proveedor').parse(values['id']);
        await updateSupplier(tx, id, versionSchema.parse(values['version']), parsed.data);
        await audit(tx, auth.user, 'supplier.update', 'suppliers', id, { name: parsed.data.name, active: parsed.data.active });
      } else {
        const id = await createSupplier(tx, parsed.data);
        await audit(tx, auth.user, 'supplier.create', 'suppliers', id, { name: parsed.data.name });
      }
    });
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  revalidatePath('/operacion', 'layout');
  redirect('/administracion/proveedores');
}

/** Activa o desactiva un proveedor. Los proveedores no se borran. */
export async function setSupplierActive(formData: FormData): Promise<void> {
  const id = idSchema('Proveedor').safeParse(formData.get('id'));
  const version = versionSchema.safeParse(formData.get('version'));
  if (!id.success || !version.success) return;
  const auth = await authorize('catalogs.write');
  if (!auth.ok) return;
  const active = formData.get('active') === 'true';
  try {
    await withTransaction(db(), async (tx) => {
      await updateSupplier(tx, id.data, version.data, { active });
      await audit(tx, auth.user, 'supplier.set_active', 'suppliers', id.data, { active });
    });
  } catch (error) {
    toUserMessage(error);
  }
  revalidatePath('/operacion', 'layout');
}
