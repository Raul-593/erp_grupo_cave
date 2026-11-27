'use client';

import { useState, type ReactNode } from 'react';
import { FieldError } from '@/components/ui';
import { NEW_CLIENT } from '@/lib/constants';

type Errors = Record<string, string[] | undefined> | undefined;

export function Field({
  name,
  label,
  errors,
  children,
  className = '',
  hint,
}: {
  name: string;
  label: string;
  errors: Errors;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-mut2">{hint}</p> : null}
      <FieldError errors={errors?.[name]} />
    </div>
  );
}

/** Atributos comunes de un campo: id, nombre, valor inicial y estado de error. */
export function fieldProps(name: string, values: Record<string, string>, errors: Errors) {
  return {
    id: name,
    name,
    defaultValue: values[name] ?? '',
    'aria-invalid': errors?.[name] ? true : undefined,
    className: 'field',
  } as const;
}

/** Selector de contratante existente o alta de uno nuevo (nombre y RUC). */
export function ClientSelect({
  clients,
  values,
  errors,
}: {
  clients: { id: string; name: string; taxId: string | null }[];
  values: Record<string, string>;
  errors: Errors;
}) {
  const initial = values['clientId'] ?? (clients.length === 0 ? NEW_CLIENT : '');
  const [choice, setChoice] = useState(initial);
  return (
    <>
      <Field name="clientId" label="Contratante" errors={errors}>
        <select
          {...fieldProps('clientId', values, errors)}
          defaultValue={undefined}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
              {client.taxId ? ` · ${client.taxId}` : ''}
            </option>
          ))}
          <option value={NEW_CLIENT}>+ Nuevo contratante…</option>
        </select>
      </Field>
      {choice === NEW_CLIENT ? (
        <>
          <Field name="newClientName" label="Nombre del contratante" errors={errors}>
            <input {...fieldProps('newClientName', values, errors)} maxLength={200} autoComplete="off" />
          </Field>
          <Field name="newClientTaxId" label="RUC o cédula (opcional)" errors={errors}>
            <input {...fieldProps('newClientTaxId', values, errors)} maxLength={20} autoComplete="off" />
          </Field>
        </>
      ) : null}
    </>
  );
}
