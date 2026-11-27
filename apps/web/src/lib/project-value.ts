/** Valor del proyecto: conversión entre lo guardado y lo que muestran los formularios. */

export interface ProjectValue {
  contractAmount: string | null;
  currency: string | null;
  amountIncludesVat: boolean | null;
}

export const DEFAULT_CURRENCY = 'USD';

/** Valores iniciales de los campos (formato es-EC: coma decimal). */
export function projectValueToForm(value: ProjectValue | null): Record<string, string> {
  return {
    contractAmount: value?.contractAmount ? value.contractAmount.replace('.', ',') : '',
    currency: value?.currency ?? DEFAULT_CURRENCY,
    amountIncludesVat:
      value?.amountIncludesVat === null || value?.amountIncludesVat === undefined
        ? ''
        : value.amountIncludesVat
          ? 'si'
          : 'no',
  };
}
