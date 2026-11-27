'use server';

/**
 * Etapa D (PLAN.md D-1…D-10): edición del borrador de la matriz, matriz manual, ficha propuesta
 * y confirmación. Solo el superusuario (`matrix.edit`); cada cambio queda en `audit_log` dentro
 * de la misma transacción.
 */
import { revalidatePath } from 'next/cache';
import {
  addDraftItem,
  confirmMatrix,
  createClient,
  createManualDraft,
  deleteDraftItem,
  getDocumentFile,
  getDraftExtraction,
  getExtraction,
  getItemExtraction,
  getProject,
  moveDraftItem,
  updateDraftItem,
  updateProject,
  withTransaction,
  type DraftExtraction,
  type ProjectInput,
} from '@erp/db';
import { validateExtractionOutput, type ExtractionFicha } from '@/domain/tdr-extraction/contract';
import { formValues, type ActionState, type InlineResult } from '@/lib/action-state';
import { audit, authorize } from '../auth';
import { db } from '../db';
import { DRAFT_MESSAGES, toUserMessage } from '../errors';
import {
  fichaApplySchema,
  fieldErrors,
  firstIssue,
  idSchema,
  matrixConfirmSchema,
  matrixItemChangeSchema,
  matrixItemFormSchema,
  matrixItemMoveSchema,
  matrixItemTargetSchema,
  type FichaField,
} from '../schemas';

const GONE = 'El ítem ya no existe. Recarga la página.';

/** El borrador debe existir y seguir en `processed` (la base también lo exige). */
function draftProblem(draft: DraftExtraction | null): string | null {
  if (!draft) return 'La matriz ya no existe. Recarga la página.';
  if (draft.status !== 'processed') return DRAFT_MESSAGES.draft_not_editable;
  return null;
}

const refresh = () => revalidatePath('/operacion', 'layout');

/** «Empezar matriz a mano» sobre un TDR cargado (D-1). */
export async function startManualMatrix(documentId: string): Promise<{ ok: boolean; message: string }> {
  const id = idSchema('Documento').safeParse(documentId);
  if (!id.success) return { ok: false, message: 'Documento no válido.' };
  const auth = await authorize('matrix.edit');
  if (!auth.ok) return auth;
  try {
    if (!(await getDocumentFile(db(), id.data))) return { ok: false, message: 'El documento ya no existe. Recarga la página.' };
    await withTransaction(db(), async (tx) => {
      const extractionId = await createManualDraft(tx, id.data);
      await audit(tx, auth.user, 'matrix.start_manual', 'tdr_extractions', extractionId, { documentId: id.data });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  return { ok: true, message: 'Matriz manual creada. Añade sus ítems.' };
}

/** Alta de una fila (rubro, producto y descripción); el resto se completa en la tabla. */
export async function addMatrixItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const auth = await authorize('matrix.edit');
  if (!auth.ok) return { status: 'error', message: auth.message, values };
  const parsed = matrixItemFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  }
  const { extractionId, ...data } = parsed.data;
  try {
    const problem = draftProblem(await getDraftExtraction(db(), extractionId));
    if (problem) return { status: 'error', message: problem, values };
    await withTransaction(db(), async (tx) => {
      const itemId = await addDraftItem(tx, extractionId, {
        ...data,
        subproducto: null,
        cant: null,
        unidad: null,
        dias: null,
        observacion: null,
      });
      await audit(tx, auth.user, 'matrix_item.create', 'tdr_items', itemId, { extractionId, ...data });
    });
  } catch (error) {
    return { status: 'error', message: toUserMessage(error), values };
  }
  refresh();
  return { status: 'ok', message: `Ítem «${data.producto}» añadido al rubro «${data.rubro}».` };
}

/** Guarda un campo de una fila del borrador (al salir del campo, D-3). */
export async function updateMatrixItem(input: unknown): Promise<InlineResult> {
  const parsed = matrixItemChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const change = parsed.data;
  const auth = await authorize('matrix.edit');
  if (!auth.ok) return auth;
  try {
    const draft = await getItemExtraction(db(), change.itemId);
    if (!draft) return { ok: false, message: GONE };
    const problem = draftProblem(draft);
    if (problem) return { ok: false, message: problem };
    await withTransaction(db(), async (tx) => {
      await updateDraftItem(tx, change.itemId, change.version, { [change.field]: change.value });
      await audit(tx, auth.user, 'matrix_item.update', 'tdr_items', change.itemId, { [change.field]: change.value });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  return { ok: true };
}

/** Sube o baja una fila dentro de su rubro (D-4). */
export async function moveMatrixItem(input: unknown): Promise<InlineResult> {
  const parsed = matrixItemMoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { itemId, version, direction } = parsed.data;
  const auth = await authorize('matrix.edit');
  if (!auth.ok) return auth;
  try {
    const problem = draftProblem(await getItemExtraction(db(), itemId));
    if (problem) return { ok: false, message: problem };
    // El intercambio de números se valida al final de la transacción (restricción diferida).
    await withTransaction(db(), async (tx) => {
      await moveDraftItem(tx, itemId, version, direction);
      await audit(tx, auth.user, 'matrix_item.move', 'tdr_items', itemId, { direction });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  return { ok: true };
}

/** Elimina una fila del borrador (la pantalla pide confirmación antes). */
export async function deleteMatrixItem(input: unknown): Promise<InlineResult> {
  const parsed = matrixItemTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { itemId, version } = parsed.data;
  const auth = await authorize('matrix.edit');
  if (!auth.ok) return auth;
  try {
    const draft = await getItemExtraction(db(), itemId);
    if (!draft) return { ok: false, message: GONE };
    const problem = draftProblem(draft);
    if (problem) return { ok: false, message: problem };
    await withTransaction(db(), async (tx) => {
      await deleteDraftItem(tx, itemId, version);
      await audit(tx, auth.user, 'matrix_item.delete', 'tdr_items', itemId, { extractionId: draft.id });
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  return { ok: true };
}

/** Confirma la matriz (D-8): pasa a Planificación, Abastecimiento y Ejecución y queda inmutable. */
export async function confirmMatrixAction(input: unknown): Promise<InlineResult> {
  const parsed = matrixConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { extractionId, version } = parsed.data;
  const auth = await authorize('matrix.edit');
  if (!auth.ok) return auth;
  try {
    await withTransaction(db(), async (tx) => {
      await confirmMatrix(tx, extractionId, version);
      await audit(tx, auth.user, 'matrix.confirm', 'tdr_extractions', extractionId);
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  return { ok: true };
}

/** Valor de un campo de la ficha propuesta convertido a las columnas del proyecto. */
function fichaPatch(ficha: ExtractionFicha, field: FichaField): Partial<ProjectInput> {
  switch (field) {
    case 'codigo_proceso':
      return { processCode: ficha.codigo_proceso };
    case 'objeto':
      return { purpose: ficha.objeto };
    case 'monto':
      // Monto, moneda e IVA van juntos: son el mismo dato del documento.
      return {
        contractAmount: ficha.monto === null ? null : ficha.monto.toFixed(2),
        currency: ficha.moneda,
        amountIncludesVat: ficha.incluye_iva,
      };
    case 'sedes':
      return { venues: ficha.sedes };
    case 'fecha_inicio':
      return { startDate: ficha.fecha_inicio };
    case 'fecha_fin':
      return { endDate: ficha.fecha_fin };
    case 'plazo':
      return { termText: ficha.plazo };
    case 'administrador_contrato':
      return { contractAdministrator: ficha.administrador_contrato };
  }
}

/**
 * Aplica al proyecto campos de la ficha propuesta y, si se elige, su contratante (D-6). Los
 * valores salen del JSON guardado en el servidor; el navegador solo dice qué aplicar.
 */
export async function applyFichaProposal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorize('matrix.edit');
  if (!auth.ok) return { status: 'error', message: auth.message };
  const parsed = fichaApplySchema.safeParse({
    projectId: formData.get('projectId'),
    version: formData.get('version'),
    extractionId: formData.get('extractionId'),
    fields: formData.getAll('field'),
    client: formData.get('client') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const { projectId, version, extractionId, fields, client } = parsed.data;
  if (fields.length === 0 && client === '') return { status: 'error', message: 'Elige qué aplicar.' };

  try {
    const [extraction, project] = await Promise.all([getExtraction(db(), extractionId), getProject(db(), projectId)]);
    const document = extraction ? await getDocumentFile(db(), extraction.documentId) : null;
    if (!extraction || !project || document?.projectId !== projectId) {
      return { status: 'error', message: 'La propuesta no corresponde a este proyecto. Recarga la página.' };
    }
    const output = validateExtractionOutput(extraction.rawResponse);
    if (!output.ok) return { status: 'error', message: 'Esta matriz no tiene una ficha propuesta que aplicar.' };
    const ficha = output.output.ficha;

    await withTransaction(db(), async (tx) => {
      const patch: Partial<ProjectInput> = Object.assign({}, ...fields.map((field) => fichaPatch(ficha, field)));
      if (client === 'nuevo') {
        if (!ficha.contratante) throw new Error('Sin contratante propuesto');
        const created = await createClient(tx, { name: ficha.contratante, taxId: ficha.ruc_contratante });
        await audit(tx, auth.user, 'client.create', 'clients', created.id, { name: created.name, source: 'ficha' });
        patch.clientId = created.id;
      } else if (client !== '') {
        patch.clientId = client;
      }
      await updateProject(tx, projectId, version, patch, { fichaExtractionId: extractionId });
      await audit(tx, auth.user, 'project.apply_ficha', 'projects', projectId, { extractionId, fields, client: client || null });
    });
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) };
  }
  refresh();
  return { status: 'ok', message: 'Ficha aplicada al proyecto.' };
}
