'use client';

import { useActionState, useState } from 'react';
import { ClientSelect, Field, fieldProps } from '@/components/forms/fields';
import { ProjectValueFields } from '@/components/forms/ProjectValueFields';
import { Card, FichaGrid, FormMessage } from '@/components/ui';
import { IDLE, type ActionState } from '@/lib/action-state';
import { formatAmount, formatDateRange } from '@/lib/format';
import { projectValueToForm } from '@/lib/project-value';
import { saveFicha } from '@/server/actions/projects';

export interface FichaProject {
  id: string;
  version: number;
  clientId: string;
  clientName: string;
  clientTaxId: string | null;
  processCode: string | null;
  purpose: string | null;
  contractAmount: string | null;
  currency: string | null;
  amountIncludesVat: boolean | null;
  venues: string[];
  termText: string | null;
  startDate: string | null;
  endDate: string | null;
  contractAdministrator: string | null;
}

function toFormValues(project: FichaProject): Record<string, string> {
  return {
    clientId: project.clientId,
    processCode: project.processCode ?? '',
    purpose: project.purpose ?? '',
    ...projectValueToForm(project),
    venues: project.venues.join(', '),
    termText: project.termText ?? '',
    startDate: project.startDate ?? '',
    endDate: project.endDate ?? '',
    contractAdministrator: project.contractAdministrator ?? '',
  };
}

const dash = (value: string | null) => value ?? '—';

/** Ficha del proyecto: lectura en cuadrícula (como el prototipo) y edición en el mismo lugar. */
export function FichaCard({
  project,
  clients,
  scope,
  documentLabel,
}: {
  project: FichaProject;
  clients: { id: string; name: string; taxId: string | null }[];
  scope: string;
  documentLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveFicha(prev, formData);
    if (result.status === 'ok') setEditing(false);
    return result;
  }, IDLE);

  const amount =
    project.contractAmount === null
      ? '—'
      : `${formatAmount(project.contractAmount, project.currency)}${
          project.amountIncludesVat === null ? '' : project.amountIncludesVat ? ' · con IVA' : ' · sin IVA'
        }`;
  const term = [formatDateRange(project.startDate, project.endDate), project.termText]
    .filter((part) => part && part !== '—')
    .join(' · ');

  if (!editing) {
    return (
      <Card
        title="Ficha del proyecto"
        actions={
          <>
            <FormMessage status={state.status} message={state.message} />
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Editar ficha
            </button>
          </>
        }
      >
        <FichaGrid
          items={[
            { label: 'Contratante', value: project.clientName },
            { label: 'RUC del contratante', value: dash(project.clientTaxId) },
            { label: 'Proceso', value: dash(project.processCode) },
            { label: 'Objeto', value: dash(project.purpose) },
            { label: 'Valor del proyecto', value: amount },
            { label: 'Sedes', value: project.venues.length ? project.venues.join(' · ') : '—' },
            { label: 'Plazo de entrega', value: term || '—' },
            { label: 'Administrador del contrato', value: dash(project.contractAdministrator) },
            { label: 'Alcance', value: scope },
            { label: 'Documento TDR', value: documentLabel },
          ]}
        />
      </Card>
    );
  }

  const values = state.status === 'error' && state.values ? state.values : toFormValues(project);
  const errors = state.status === 'error' ? state.fieldErrors : undefined;
  return (
    <Card title="Ficha del proyecto · edición">
      <form action={action} className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3" noValidate>
        <input type="hidden" name="id" value={project.id} />
        <input type="hidden" name="version" value={project.version} />
        <ClientSelect clients={clients} values={values} errors={errors} />
        <Field name="processCode" label="Código del proceso" errors={errors}>
          <input {...fieldProps('processCode', values, errors)} maxLength={120} autoComplete="off" />
        </Field>
        <Field name="purpose" label="Objeto de la contratación" errors={errors} className="md:col-span-2 xl:col-span-3">
          <textarea {...fieldProps('purpose', values, errors)} rows={2} maxLength={2000} />
        </Field>
        <ProjectValueFields values={values} errors={errors} />
        <Field name="venues" label="Sedes" errors={errors} hint="Separadas por comas">
          <input {...fieldProps('venues', values, errors)} maxLength={500} />
        </Field>
        <Field name="startDate" label="Fecha de inicio" errors={errors}>
          <input type="date" {...fieldProps('startDate', values, errors)} />
        </Field>
        <Field name="endDate" label="Fecha de fin" errors={errors}>
          <input type="date" {...fieldProps('endDate', values, errors)} />
        </Field>
        <Field name="termText" label="Plazo (según el documento)" errors={errors}>
          <input {...fieldProps('termText', values, errors)} maxLength={500} />
        </Field>
        <Field name="contractAdministrator" label="Administrador del contrato" errors={errors}>
          <input {...fieldProps('contractAdministrator', values, errors)} maxLength={200} autoComplete="off" />
        </Field>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-3">
          <button type="submit" className="btn btn-p" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar ficha'}
          </button>
          <button type="button" className="btn" onClick={() => setEditing(false)} disabled={pending}>
            Cancelar
          </button>
          <FormMessage status={state.status} message={state.message} />
        </div>
      </form>
    </Card>
  );
}
