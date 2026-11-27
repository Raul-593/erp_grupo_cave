'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui';
import { IDLE } from '@/lib/action-state';
import { DEFAULT_CURRENCY } from '@/lib/project-value';
import { saveProject } from '@/server/actions/projects';
import { ClientSelect, Field, fieldProps } from './fields';
import { ProjectValueFields } from './ProjectValueFields';

export function ProjectForm({
  clients,
  initial,
}: {
  clients: { id: string; name: string; taxId: string | null }[];
  /** Valores iniciales (edición); incluye id y version. */
  initial?: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveProject, IDLE);
  const values = state.values ?? initial ?? { currency: DEFAULT_CURRENCY };
  const errors = state.fieldErrors;
  const editing = Boolean(initial?.['id']);

  return (
    <form action={action} className="grid gap-4 p-4 md:grid-cols-2" noValidate>
      {editing ? (
        <>
          <input type="hidden" name="id" value={initial?.['id']} />
          <input type="hidden" name="version" value={initial?.['version']} />
        </>
      ) : null}
      <Field name="name" label="Nombre del proyecto" errors={errors} className="md:col-span-2">
        <input {...fieldProps('name', values, errors)} maxLength={200} required autoFocus={!editing} />
      </Field>
      <ClientSelect clients={clients} values={values} errors={errors} />
      <Field name="startDate" label="Fecha de inicio" errors={errors}>
        <input type="date" {...fieldProps('startDate', values, errors)} />
      </Field>
      <Field name="endDate" label="Fecha de fin" errors={errors}>
        <input type="date" {...fieldProps('endDate', values, errors)} />
      </Field>
      <Field name="venues" label="Sedes" errors={errors} hint="Separadas por comas, por ejemplo: Guayaquil, Quito">
        <input {...fieldProps('venues', values, errors)} maxLength={500} />
      </Field>
      <div className="grid gap-4 md:col-span-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <ProjectValueFields values={values} errors={errors} />
      </div>
      <Field name="notes" label="Notas" errors={errors} className="md:col-span-2">
        <textarea {...fieldProps('notes', values, errors)} rows={3} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-p" disabled={pending}>
          {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear proyecto'}
        </button>
        <Link href="/operacion/proyectos" className="btn">
          Cancelar
        </Link>
        <FormMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}
