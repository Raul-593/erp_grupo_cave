'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createPayment,
  createPurchaseOrder,
  deletePayment,
  getItemProjectId,
  getProject,
  getPurchaseOrderProjectId,
  setItemOrder,
  updateOrderLine,
  updatePayment,
} from '@erp/db';
import { formValues, type ActionState, type InlineResult } from '@/lib/action-state';
import { db } from '../db';
import { toUserMessage } from '../errors';
import {
  fieldErrors,
  firstIssue,
  idSchema,
  itemOrderChangeSchema,
  orderFormSchema,
  orderLineChangeSchema,
  paymentFormSchema,
  versionSchema,
} from '../schemas';

const ABASTECIMIENTO = '/operacion/abastecimiento';
const ITEM_GONE = 'El ítem ya no existe. Recarga la página.';

/** Crea una orden de compra vacía en el proyecto; después se le asignan ítems. */
export async function createOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = orderFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa el código.', fieldErrors: fieldErrors(parsed.error), values };
  }
  try {
    if (!(await getProject(db(), parsed.data.projectId))) return { status: 'error', message: 'El proyecto ya no existe.', values };
    await createPurchaseOrder(db(), parsed.data.projectId, parsed.data.code);
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  revalidatePath('/operacion', 'layout');
  return { status: 'ok', message: `Orden ${parsed.data.code} creada. Asígnale ítems en la columna «Orden».` };
}

/** Pone un ítem en una orden, lo cambia de orden o lo quita. */
export async function changeItemOrder(input: unknown): Promise<InlineResult> {
  const parsed = itemOrderChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { itemId, version, orderId } = parsed.data;
  try {
    const projectId = await getItemProjectId(db(), itemId);
    if (projectId === null) return { ok: false, message: ITEM_GONE };
    if (orderId !== null && (await getPurchaseOrderProjectId(db(), orderId)) !== projectId) {
      return { ok: false, message: 'Esa orden no pertenece a este proyecto.' };
    }
    await setItemOrder(db(), itemId, version, orderId);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/** Guarda el costo, lo pagado o el responsable de pago de un ítem dentro de su orden. */
export async function updateOrderLineField(input: unknown): Promise<InlineResult> {
  const parsed = orderLineChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const change = parsed.data;
  try {
    await updateOrderLine(db(), change.itemId, change.version, { [change.field]: change.value });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/** Registra un pago o corrige uno existente. */
export async function savePayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = paymentFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  try {
    if ((await getPurchaseOrderProjectId(db(), parsed.data.orderId)) === null) {
      return { status: 'error', message: 'La orden ya no existe. Recarga la página.', values };
    }
    if (values['id']) {
      await updatePayment(db(), idSchema('Pago').parse(values['id']), versionSchema.parse(values['version']), parsed.data);
    } else {
      await createPayment(db(), parsed.data);
    }
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  revalidatePath('/operacion', 'layout');
  redirect(ABASTECIMIENTO);
}

/** Elimina un pago registrado (la pantalla pide confirmación antes). */
export async function removePayment(input: unknown): Promise<InlineResult> {
  const candidate = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const id = idSchema('Pago').safeParse(candidate['id']);
  const version = versionSchema.safeParse(candidate['version']);
  if (!id.success || !version.success) return { ok: false, message: 'Pago no válido.' };
  try {
    await deletePayment(db(), id.data, version.data);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}
