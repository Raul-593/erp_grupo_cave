'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui';
import { IDLE } from '@/lib/action-state';
import { saveWorker } from '@/server/actions/workers';
import { Field, fieldProps } from './fields';

export function WorkerForm({ initial }: { initial?: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveWorker, IDLE);
  const values = state.values ?? initial ?? { active: 'on' };
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
      <Field name="fullName" label="Nombre completo" errors={errors}>
        <input {...fieldProps('fullName', values, errors)} maxLength={200} required autoFocus={!editing} autoComplete="off" />
      </Field>
      <Field name="jobTitle" label="Cargo (opcional)" errors={errors}>
        <input {...fieldProps('jobTitle', values, errors)} maxLength={120} autoComplete="off" />
      </Field>
      <Field name="phone" label="Teléfono (opcional)" errors={errors}>
        <input type="tel" {...fieldProps('phone', values, errors)} maxLength={40} autoComplete="off" />
      </Field>
      <Field name="email" label="Correo (opcional)" errors={errors}>
        <input type="email" {...fieldProps('email', values, errors)} maxLength={200} autoComplete="off" />
      </Field>
      <Field name="notes" label="Notas" errors={errors} className="md:col-span-2">
        <textarea {...fieldProps('notes', values, errors)} rows={3} maxLength={2000} />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] md:col-span-2">
        <input type="checkbox" name="active" defaultChecked={values['active'] === 'on' || values['active'] === 'true'} />
        Activo (aparece en la lista de responsables)
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-p" disabled={pending}>
          {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear trabajador'}
        </button>
        <Link href="/operacion/trabajadores" className="btn">
          Cancelar
        </Link>
        <FormMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}
