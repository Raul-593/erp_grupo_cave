'use server';

import { revalidatePath } from 'next/cache';
import { getItemProjectId, setItemMountStatus, setPreEventCheckResult, updateActivity } from '@erp/db';
import type { InlineResult } from '@/lib/action-state';
import { db } from '../db';
import { toUserMessage } from '../errors';
import { activityChangeSchema, checkChangeSchema, firstIssue, mountChangeSchema } from '../schemas';

/** Guarda el estado o el responsable de una actividad. */
export async function updateActivityField(input: unknown): Promise<InlineResult> {
  const parsed = activityChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const change = parsed.data;
  try {
    await updateActivity(db(), change.id, change.version, { [change.field]: change.value });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/** Guarda el estado de montaje de un ítem. */
export async function updateMountStatus(input: unknown): Promise<InlineResult> {
  const parsed = mountChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { itemId, version, value } = parsed.data;
  try {
    if ((await getItemProjectId(db(), itemId)) === null) return { ok: false, message: 'El ítem ya no existe. Recarga la página.' };
    await setItemMountStatus(db(), itemId, version, value);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}

/** Guarda el resultado de un control del checklist previo al evento. */
export async function updateCheckResult(input: unknown): Promise<InlineResult> {
  const parsed = checkChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { id, version, value } = parsed.data;
  try {
    await setPreEventCheckResult(db(), id, version, value);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath('/operacion', 'layout');
  return { ok: true };
}
