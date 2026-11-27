/**
 * Datos de la pantalla Requerimiento en la etapa D: filas del editor agrupadas por rubro, con
 * lo que sigue tal como lo propuso la IA, y diferencias entre la ficha propuesta y la del
 * proyecto. Funciones puras (sin acceso a la base).
 */
import type { Client, DraftItem, Project } from '@erp/db';
import type { EditorGroup } from '@/components/requerimiento/MatrixEditor';
import type { FichaClientProposal, FichaProposalRow } from '@/components/requerimiento/FichaProposal';
import type { ExtractionFicha, ExtractionOutput } from '@/domain/tdr-extraction/contract';
import { groupByRubro, unchangedFromProposal, type DraftField } from '@/lib/draft';
import { formatAmount, formatDate, formatQuantity } from '@/lib/format';
import { itemCodes } from '@/lib/numbering';
import { FICHA_FIELDS, type FichaField } from './schemas';

export interface EditorData {
  groups: EditorGroup[];
  itemCount: number;
  rubroCount: number;
  unassigned: number;
  /** Valores que siguen tal como los propuso la IA. */
  proposedCount: number;
}

const asText = (value: string | null) => value ?? '';
const asQuantity = (value: string | null) => (value === null ? '' : formatQuantity(value));

export function buildEditorData(items: readonly DraftItem[], proposal: ExtractionOutput | null): EditorData {
  const codes = itemCodes(items);
  let proposedCount = 0;
  const rows = items.map((item, index) => {
    const proposed = item.source === 'ai' && item.sourceIndex !== null ? proposal?.items[item.sourceIndex] : undefined;
    const unchanged = unchangedFromProposal(item, proposed);
    proposedCount += unchanged.size;
    return {
      id: item.id,
      rubro: item.rubro,
      code: codes[index] ?? String(item.itemNumber),
      version: item.version,
      values: {
        rubro: item.rubro,
        producto: item.producto,
        subproducto: asText(item.subproducto),
        descripcion: item.descripcion,
        cant: asQuantity(item.cant),
        unidad: asText(item.unidad),
        dias: asQuantity(item.dias),
        observacion: asText(item.observacion),
      } satisfies Record<DraftField, string>,
      proposed: [...unchanged],
      workerId: item.workerId,
      workerName: item.workerName,
    };
  });
  const groups = groupByRubro(rows).map((group, index) => ({
    number: String(index + 1),
    rubro: group.rubro,
    rows: group.rows.map((row, position) => ({
      ...row,
      first: position === 0,
      last: position === group.rows.length - 1,
    })),
  }));
  return {
    groups,
    itemCount: items.length,
    rubroCount: groups.length,
    unassigned: items.filter((item) => item.workerId === null).length,
    proposedCount,
  };
}

const FICHA_LABELS: Readonly<Record<FichaField, string>> = {
  codigo_proceso: 'Proceso',
  objeto: 'Objeto',
  monto: 'Valor del proyecto',
  sedes: 'Sedes',
  fecha_inicio: 'Fecha de inicio',
  fecha_fin: 'Fecha de fin',
  plazo: 'Plazo de entrega',
  administrador_contrato: 'Administrador del contrato',
};

const vat = (value: boolean | null) => (value === null ? '' : value ? ' · con IVA' : ' · sin IVA');

/** Valor actual y propuesto de un campo, como texto para comparar y mostrar; null si la IA no propone nada. */
function fichaValues(project: Project, ficha: ExtractionFicha, field: FichaField): [current: string, proposed: string | null] {
  switch (field) {
    case 'codigo_proceso':
      return [project.processCode ?? '—', ficha.codigo_proceso];
    case 'objeto':
      return [project.purpose ?? '—', ficha.objeto];
    case 'monto':
      return [
        project.contractAmount === null ? '—' : `${formatAmount(project.contractAmount, project.currency)}${vat(project.amountIncludesVat)}`,
        ficha.monto === null ? null : `${formatAmount(ficha.monto.toFixed(2), ficha.moneda)}${vat(ficha.incluye_iva)}`,
      ];
    case 'sedes':
      return [project.venues.length ? project.venues.join(' · ') : '—', ficha.sedes.length ? ficha.sedes.join(' · ') : null];
    case 'fecha_inicio':
      return [formatDate(project.startDate), ficha.fecha_inicio === null ? null : formatDate(ficha.fecha_inicio)];
    case 'fecha_fin':
      return [formatDate(project.endDate), ficha.fecha_fin === null ? null : formatDate(ficha.fecha_fin)];
    case 'plazo':
      return [project.termText ?? '—', ficha.plazo];
    case 'administrador_contrato':
      return [project.contractAdministrator ?? '—', ficha.administrador_contrato];
  }
}

/** Campos de la ficha propuesta que difieren de la ficha actual del proyecto. */
export function fichaProposalRows(project: Project, ficha: ExtractionFicha): FichaProposalRow[] {
  return FICHA_FIELDS.flatMap((field) => {
    const [current, proposed] = fichaValues(project, ficha, field);
    if (proposed === null || proposed.trim() === '' || proposed.trim() === current.trim()) return [];
    return [{ field, label: FICHA_LABELS[field], current, proposed }];
  });
}

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLocaleLowerCase('es');

/**
 * Contratante propuesto, si difiere del actual, con los contratantes registrados que coinciden
 * por RUC o por nombre (decide el usuario; nunca se vincula solo).
 */
export function clientProposal(project: Project, ficha: ExtractionFicha, clients: readonly Client[]): FichaClientProposal | null {
  const name = ficha.contratante?.trim();
  if (!name) return null;
  const taxId = ficha.ruc_contratante?.trim() || null;
  const sameAsCurrent = (taxId !== null && taxId === project.clientTaxId) || normalize(name) === normalize(project.clientName);
  if (sameAsCurrent) return null;
  const matches = clients
    .filter((client) => client.id !== project.clientId)
    .filter(
      (client) =>
        (taxId !== null && client.taxId === taxId) ||
        normalize(client.name) === normalize(name) ||
        normalize(client.name).includes(normalize(name)) ||
        normalize(name).includes(normalize(client.name)),
    )
    .slice(0, 5)
    .map(({ id, name: clientName, taxId: clientTaxId }) => ({ id, name: clientName, taxId: clientTaxId }));
  return { proposedName: name, proposedTaxId: taxId, currentName: project.clientName, matches };
}
