'use client';

import { Field, fieldProps } from './fields';

type Errors = Record<string, string[] | undefined> | undefined;

/**
 * Campos del valor del proyecto (valor, moneda e IVA) para incluir dentro de cualquier
 * formulario. Envían contractAmount, currency y amountIncludesVat, que valida
 * `projectValueFields` en el servidor. Para un formulario propio con su botón de guardar,
 * usar <ProjectValueForm>.
 */
export function ProjectValueFields({
  values,
  errors,
  amountClassName,
}: {
  values: Record<string, string>;
  errors: Errors;
  /** Clases extra del campo principal (por ejemplo, para ocupar dos columnas). */
  amountClassName?: string;
}) {
  return (
    <>
      <Field
        name="contractAmount"
        label="Valor del proyecto"
        errors={errors}
        hint="Monto del contrato o presupuesto referencial, por ejemplo 286.400,50"
        className={amountClassName}
      >
        <input {...fieldProps('contractAmount', values, errors)} inputMode="decimal" autoComplete="off" />
      </Field>
      <Field name="currency" label="Moneda" errors={errors}>
        <input {...fieldProps('currency', values, errors)} maxLength={3} autoComplete="off" />
      </Field>
      <Field name="amountIncludesVat" label="¿Incluye IVA?" errors={errors}>
        <select {...fieldProps('amountIncludesVat', values, errors)}>
          <option value="">No indicado</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      </Field>
    </>
  );
}
