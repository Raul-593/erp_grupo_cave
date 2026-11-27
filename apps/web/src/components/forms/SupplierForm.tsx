'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui';
import { IDLE } from '@/lib/action-state';
import { SUPPLIER_KIND } from '@/lib/labels';
import { saveSupplier } from '@/server/actions/suppliers';
import { Field, fieldProps } from './fields';

export function SupplierForm({ initial }: { initial?: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveSupplier, IDLE);
  const values = state.values ?? initial ?? { active: 'on', kind: 'external' };
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
      <Field name="name" label="Nombre" errors={errors}>
        <input {...fieldProps('name', values, errors)} maxLength={200} required autoFocus={!editing} autoComplete="off" />
      </Field>
      <Field
        name="kind"
        label="Tipo"
        errors={errors}
        hint="«Del holding» marca las compras internas; «Nómina interna» no cuenta como proveedor."
      >
        <select {...fieldProps('kind', values, errors)}>
          {Object.entries(SUPPLIER_KIND).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field name="taxId" label="RUC o cédula (opcional)" errors={errors}>
        <input {...fieldProps('taxId', values, errors)} maxLength={20} autoComplete="off" />
      </Field>
      <Field name="notes" label="Notas" errors={errors} className="md:col-span-2">
        <textarea {...fieldProps('notes', values, errors)} rows={3} maxLength={2000} />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] md:col-span-2">
        <input type="checkbox" name="active" defaultChecked={values['active'] === 'on' || values['active'] === 'true'} />
        Activo (aparece en la lista de proveedores de Planificación)
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-p" disabled={pending}>
          {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear proveedor'}
        </button>
        <Link href="/operacion/proveedores" className="btn">
          Cancelar
        </Link>
        <FormMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}
