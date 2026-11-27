'use server';

import { revalidatePath } from 'next/cache';
import {
  getItemProjectId,
  setItemMountStatus,
  setItemOperationalStatus,
  setPreEventCheckResult,
  updateActivity,
  withTransaction,
} from '@erp/db';
import type { InlineResult } from '@/lib/action-state';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { activityChangeSchema, checkChangeSchema, firstIssue, mountChangeSchema, operationalChangeSchema } from '../schemas';

/** Guarda el estado o el responsable de una actividad. */
export async function updateActivityField(input: unknown): Promise<InlineResult> {
  const parsed = activityChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const change = parsed.data;
  const auth = await authorize('schedule.write');
  if (!auth.ok) return auth;
  try {
    await withTransaction(db(), async (tx) => {
      await updateActivity(tx, change.id, change.version, { [change.field]: change.value });
      await audit(tx, auth.user, 'activity.update', 'activities', change.id, { [change.field]: change.value });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/**
 * Guarda el estado de montaje de un ítem. Superusuario: cualquier ítem; empleado de campo: solo
 * los ítems de los que es responsable.
 */
export async function updateMountStatus(input: unknown): Promise<InlineResult> {
  const parsed = mountChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { itemId, version, value } = parsed.data;
  const auth = await authorize('mount.update', { itemId });
  if (!auth.ok) return auth;
  try {
    if ((await getItemProjectId(db(), itemId)) === null) return { ok: false, message: 'El ítem ya no existe. Recarga la página.' };
    await withTransaction(db(), async (tx) => {
      await setItemMountStatus(tx, itemId, version, value);
      await audit(tx, auth.user, 'item_execution.update', 'tdr_items', itemId, { mountStatus: value });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/**
 * Guarda el estado operativo de un ítem (pendiente, en proceso, listo). Mismo alcance que el
 * estado de montaje: superusuario, o el empleado de campo responsable del ítem.
 */
export async function updateOperationalStatus(input: unknown): Promise<InlineResult> {
  const parsed = operationalChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { itemId, version, value } = parsed.data;
  const auth = await authorize('mount.update', { itemId });
  if (!auth.ok) return auth;
  try {
    if ((await getItemProjectId(db(), itemId)) === null) return { ok: false, message: 'El ítem ya no existe. Recarga la página.' };
    await withTransaction(db(), async (tx) => {
      await setItemOperationalStatus(tx, itemId, version, value);
      await audit(tx, auth.user, 'item_execution.update', 'tdr_items', itemId, { operationalStatus: value });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/**
 * Guarda el resultado (pendiente, cumple, no cumple) de un control del checklist previo al
 * evento. Superusuario: cualquiera; empleado de campo: solo los controles de los que es
 * responsable (`pre_event_checks.worker_id`).
 */
export async function updateCheckResult(input: unknown): Promise<InlineResult> {
  const parsed = checkChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { id, version, value } = parsed.data;
  const auth = await authorize('checks.update', { checkId: id });
  if (!auth.ok) return auth;
  try {
    await withTransaction(db(), async (tx) => {
      await setPreEventCheckResult(tx, id, version, value);
      await audit(tx, auth.user, 'pre_event_check.update', 'pre_event_checks', id, { result: value });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}
