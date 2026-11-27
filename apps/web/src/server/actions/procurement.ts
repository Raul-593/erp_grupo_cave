'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  BusinessRuleError,
  createPayment,
  createPurchaseOrder,
  deletePayment,
  getItemProjectId,
  getProject,
  getPurchaseOrderProjectId,
  setItemOrder,
  updateOrderLine,
  updatePayment,
  withTransaction,
} from '@erp/db';
import { formValues, type ActionState, type InlineResult } from '@/lib/action-state';
import { ALLOCATION_PREFIX, RAISE_COST_FIRST } from '@/lib/constants';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { loadMatrixView } from '../matrix';
import {
  fieldErrors,
  firstIssue,
  idSchema,
  itemOrderChangeSchema,
  orderFormSchema,
  orderLineChangeSchema,
  parsePaymentAllocations,
  paymentFormSchema,
  versionSchema,
} from '../schemas';

const ABASTECIMIENTO = '/operacion/abastecimiento';
const ITEM_GONE = 'El ítem ya no existe. Recarga la página.';

/** Crea una orden de compra vacía en el proyecto; después se le asignan ítems. */
export async function createOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const auth = await authorize('procurement.write');
  if (!auth.ok) return { status: 'error', message: auth.message, values };
  const parsed = orderFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa el código.', fieldErrors: fieldErrors(parsed.error), values };
  }
  try {
    if (!(await getProject(db(), parsed.data.projectId))) return { status: 'error', message: 'El proyecto ya no existe.', values };
    await withTransaction(db(), async (tx) => {
      const id = await createPurchaseOrder(tx, parsed.data.projectId, parsed.data.code);
      await audit(tx, auth.user, 'purchase_order.create', 'purchase_orders', id, { code: parsed.data.code });
    });
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
  const auth = await authorize('procurement.write');
  if (!auth.ok) return auth;
  try {
    const projectId = await getItemProjectId(db(), itemId);
    if (projectId === null) return { ok: false, message: ITEM_GONE };
    if (orderId !== null && (await getPurchaseOrderProjectId(db(), orderId)) !== projectId) {
      return { ok: false, message: 'Esa orden no pertenece a este proyecto.' };
    }
    await withTransaction(db(), async (tx) => {
      await setItemOrder(tx, itemId, version, orderId);
      await audit(tx, auth.user, 'purchase_order_line.set_order', 'tdr_items', itemId, { orderId });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/** Guarda el costo o el responsable de pago de un ítem dentro de su orden. */
export async function updateOrderLineField(input: unknown): Promise<InlineResult> {
  const parsed = orderLineChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const change = parsed.data;
  const auth = await authorize('procurement.write');
  if (!auth.ok) return auth;
  try {
    await withTransaction(db(), async (tx) => {
      await updateOrderLine(tx, change.itemId, change.version, { [change.field]: change.value });
      await audit(tx, auth.user, 'purchase_order_line.update', 'tdr_items', change.itemId, { [change.field]: change.value });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/**
 * Registra un pago o corrige uno existente, junto con su reparto entre los ítems de la orden.
 * Lo pagado de cada ítem se recalcula en la misma transacción.
 */
export async function savePayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const auth = await authorize('procurement.write');
  if (!auth.ok) return { status: 'error', message: auth.message, values };
  const parsed = paymentFormSchema.safeParse(values);
  const split = parsePaymentAllocations(values, parsed.success ? parsed.data.amount : null);
  const invalid = { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...split.fieldErrors };
  if (!parsed.success || Object.keys(invalid).length > 0) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: invalid, values };
  }
  if (split.message) return { status: 'error', message: split.message, values };

  const input = { ...parsed.data, allocations: split.allocations };
  let projectId: string | null = null;
  try {
    projectId = await getPurchaseOrderProjectId(db(), input.orderId);
    if (projectId === null) return { status: 'error', message: 'La orden ya no existe. Recarga la página.', values };
    await withTransaction(db(), async (tx) => {
      const details = { orderId: input.orderId, amount: input.amount, allocations: input.allocations };
      if (values['id']) {
        const id = idSchema('Pago').parse(values['id']);
        await updatePayment(tx, id, versionSchema.parse(values['version']), input);
        await audit(tx, auth.user, 'payment.update', 'payments', id, details);
      } else {
        const id = await createPayment(tx, input);
        await audit(tx, auth.user, 'payment.create', 'payments', id, details);
      }
    });
  } catch (error) {
    // R-3: se indica qué ítem recibiría de más y que primero hay que subir su costo.
    if (error instanceof BusinessRuleError && error.rule === 'allocation_exceeds_balance' && error.itemId && projectId) {
      const code = (await loadMatrixView(projectId).catch(() => null))?.codes.get(error.itemId);
      return {
        status: 'error',
        message: `No se guardó el pago: ${code ? `el ítem ${code}` : 'un ítem'} recibiría más que su costo en la orden. ${RAISE_COST_FIRST}`,
        fieldErrors: { [`${ALLOCATION_PREFIX}${error.itemId}`]: ['Supera el saldo del ítem. Primero sube su costo en la orden.'] },
        values,
      };
    }
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
  const auth = await authorize('procurement.write');
  if (!auth.ok) return auth;
  try {
    // Borra también su reparto: lo pagado de sus ítems baja en la misma transacción.
    await withTransaction(db(), async (tx) => {
      await deletePayment(tx, id.data, version.data);
      await audit(tx, auth.user, 'payment.delete', 'payments', id.data);
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}
