'use server';

import { revalidatePath } from 'next/cache';
import { getItemProjectId, saveItemPlan, setItemResponsible } from '@erp/db';
import type { InlineResult } from '@/lib/action-state';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { firstIssue, planChangeSchema, responsibleChangeSchema } from '../schemas';

const ITEM_GONE = 'El ítem ya no existe. Recarga la página.';

/** Asigna, cambia o quita el responsable de un ítem (se permite con la matriz confirmada). */
export async function assignResponsible(input: unknown): Promise<InlineResult> {
  const parsed = responsibleChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { itemId, expectedWorkerId, workerId } = parsed.data;
  try {
    if ((await getItemProjectId(db(), itemId)) === null) return { ok: false, message: ITEM_GONE };
    await setItemResponsible(db(), itemId, expectedWorkerId, workerId);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/** Guarda un campo de la planificación de un ítem: proveedor, costo asignado o contrato. */
export async function updateItemPlan(input: unknown): Promise<InlineResult> {
  const parsed = planChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const change = parsed.data;
  try {
    if ((await getItemProjectId(db(), change.itemId)) === null) return { ok: false, message: ITEM_GONE };
    await saveItemPlan(db(), change.itemId, change.version, { [change.field]: change.value });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}
