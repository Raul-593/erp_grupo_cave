'use server';

import { revalidatePath } from 'next/cache';
import { getItemProjectId, saveItemPlan, setItemResponsible, withTransaction } from '@erp/db';
import type { InlineResult } from '@/lib/action-state';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { firstIssue, planChangeSchema, responsibleChangeSchema } from '../schemas';

const ITEM_GONE = 'El ítem ya no existe. Recarga la página.';

/** Asigna, cambia o quita el responsable de un ítem (se permite con la matriz confirmada). */
export async function assignResponsible(input: unknown): Promise<InlineResult> {
  const parsed = responsibleChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { itemId, expectedWorkerId, workerId } = parsed.data;
  const auth = await authorize('items.assign', { itemId });
  if (!auth.ok) return auth;
  try {
    if ((await getItemProjectId(db(), itemId)) === null) return { ok: false, message: ITEM_GONE };
    await withTransaction(db(), async (tx) => {
      await setItemResponsible(tx, itemId, expectedWorkerId, workerId);
      await audit(tx, auth.user, 'item.assign', 'tdr_items', itemId, { workerId });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/**
 * Guarda un campo de la planificación de un ítem. Proveedor y costo: superusuario o el
 * empleado de campo responsable del ítem (U-D3). Contrato: solo el superusuario.
 */
export async function updateItemPlan(input: unknown): Promise<InlineResult> {
  const parsed = planChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const change = parsed.data;
  const permission = change.field === 'contractStatus' ? 'items.plan_contract' : 'items.plan_cost';
  const auth = await authorize(permission, { itemId: change.itemId });
  if (!auth.ok) return auth;
  try {
    if ((await getItemProjectId(db(), change.itemId)) === null) return { ok: false, message: ITEM_GONE };
    await withTransaction(db(), async (tx) => {
      await saveItemPlan(tx, change.itemId, change.version, { [change.field]: change.value });
      await audit(tx, auth.user, 'item_plan.update', 'tdr_items', change.itemId, { [change.field]: change.value });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}
