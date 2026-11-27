'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createProject, getProject, updateProject, withTransaction, type Queryable } from '@erp/db';
import { formValues, type ActionState } from '@/lib/action-state';
import { db } from '../db';
import { setCurrentProjectCookie } from '../current-project';
import { toUserMessage } from '../errors';
import {
  fichaFormSchema,
  fieldErrors,
  idSchema,
  NEW_CLIENT,
  projectFormSchema,
  projectValueSchema,
  versionSchema,
} from '../schemas';

async function resolveClientId(
  tx: Queryable,
  data: { clientId: string; newClientName: string | null; newClientTaxId: string | null },
): Promise<string> {
  if (data.clientId !== NEW_CLIENT) return data.clientId;
  const client = await createClient(tx, { name: data.newClientName ?? '', taxId: data.newClientTaxId });
  return client.id;
}

/** Alta o edición básica de un proyecto. */
export async function saveProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = projectFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  const editingId = values['id'] ? idSchema('Proyecto').safeParse(values['id']) : null;
  if (editingId && !editingId.success) return { status: 'error', message: 'Proyecto no válido.', values };

  const data = parsed.data;
  let projectId: string;
  try {
    projectId = await withTransaction(db(), async (tx) => {
      const clientId = await resolveClientId(tx, data);
      const basic = {
        name: data.name,
        clientId,
        startDate: data.startDate,
        endDate: data.endDate,
        venues: data.venues,
        notes: data.notes,
        contractAmount: data.contractAmount,
        currency: data.currency,
        amountIncludesVat: data.amountIncludesVat,
      };
      if (editingId) {
        const version = versionSchema.parse(values['version']);
        await updateProject(tx, editingId.data, version, basic);
        return editingId.data;
      }
      return createProject(tx, {
        ...basic,
        processCode: null,
        purpose: null,
        termText: null,
        contractAdministrator: null,
      });
    });
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }

  revalidatePath('/operacion', 'layout');
  if (editingId) redirect('/operacion/proyectos');
  await setCurrentProjectCookie(projectId);
  redirect('/operacion/requerimiento');
}

/** Guarda la ficha del proyecto desde la pestaña Requerimiento. */
export async function saveFicha(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const id = idSchema('Proyecto').safeParse(values['id']);
  if (!id.success) return { status: 'error', message: 'Proyecto no válido.', values };
  const parsed = fichaFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  const data = parsed.data;
  try {
    await withTransaction(db(), async (tx) => {
      const clientId = await resolveClientId(tx, data);
      await updateProject(tx, id.data, data.version, {
        clientId,
        processCode: data.processCode,
        purpose: data.purpose,
        contractAmount: data.contractAmount,
        currency: data.currency,
        amountIncludesVat: data.amountIncludesVat,
        venues: data.venues,
        termText: data.termText,
        startDate: data.startDate,
        endDate: data.endDate,
        contractAdministrator: data.contractAdministrator,
      });
    });
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  revalidatePath('/operacion', 'layout');
  return { status: 'ok', message: 'Ficha guardada.' };
}

/** Guarda solo el valor del proyecto (formulario independiente, p. ej. junto a la carga del TDR). */
export async function saveProjectValue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const id = idSchema('Proyecto').safeParse(values['id']);
  if (!id.success) return { status: 'error', message: 'Proyecto no válido.', values };
  const parsed = projectValueSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa el valor.', fieldErrors: fieldErrors(parsed.error), values };
  }
  const { version, ...value } = parsed.data;
  try {
    await updateProject(db(), id.data, version, value);
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  revalidatePath('/operacion', 'layout');
  return { status: 'ok', message: 'Valor guardado.' };
}

/** Cambia el proyecto activo (selector superior o lista de proyectos). */
export async function selectProject(formData: FormData): Promise<void> {
  const id = idSchema('Proyecto').safeParse(formData.get('projectId'));
  if (!id.success) return;
  const project = await getProject(db(), id.data);
  if (!project) return;
  await setCurrentProjectCookie(project.id);
  revalidatePath('/operacion', 'layout');
  const next = formData.get('next');
  if (next === 'requerimiento') redirect('/operacion/requerimiento');
}
