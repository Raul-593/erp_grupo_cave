/**
 * Validación de formularios en el servidor (zod). Convierte los campos de FormData en
 * datos listos para los repositorios y devuelve errores por campo en español.
 */
import { z } from 'zod';
import { NEW_CLIENT } from '@/lib/constants';
import { longTextOrNull, parseDecimal, parseList, textOrNull } from '@/lib/parse';

export { NEW_CLIENT };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TAX_ID = /^[0-9A-Za-z-]{5,20}$/;

/** Campo de formulario: texto; ausente equivale a vacío (p. ej. una casilla sin marcar). */
const field = () => z.string().default('');

const optionalText = (max: number, label: string) =>
  field()
    .transform(textOrNull)
    .refine((v) => v === null || v.length <= max, `${label}: máximo ${max} caracteres.`);

const optionalLongText = (max: number, label: string) =>
  field()
    .transform(longTextOrNull)
    .refine((v) => v === null || v.length <= max, `${label}: máximo ${max} caracteres.`);

const requiredText = (max: number, label: string) =>
  field()
    .transform(textOrNull)
    .refine((v): v is string => v !== null, `${label} es obligatorio.`)
    .refine((v) => v === null || v.length <= max, `${label}: máximo ${max} caracteres.`)
    .transform((v) => v as string);

const optionalDate = (label: string) =>
  field()
    .transform(textOrNull)
    .refine((v) => v === null || (DATE.test(v) && !Number.isNaN(Date.parse(v))), `${label}: fecha no válida.`);

const version = z.coerce.number().int().min(1, 'Versión no válida.');

const uuid = (label: string) => z.string().uuid(`${label} no válido.`);

/** Fechas en orden: ambas cadenas AAAA-MM-DD se comparan lexicográficamente. */
function datesInOrder(value: { startDate: string | null; endDate: string | null }): boolean {
  return value.startDate === null || value.endDate === null || value.endDate >= value.startDate;
}
const DATES_ORDER_ERROR = { message: 'La fecha de fin no puede ser anterior a la de inicio.', path: ['endDate'] };

const clientFields = {
  clientId: z.string().min(1, 'Selecciona un contratante.'),
  newClientName: optionalText(200, 'Nombre del contratante'),
  newClientTaxId: optionalText(20, 'RUC'),
};

/** El contratante es uno existente (uuid) o uno nuevo con nombre obligatorio. */
function checkClientChoice(
  value: { clientId: string; newClientName: string | null; newClientTaxId: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.clientId === NEW_CLIENT) {
    if (value.newClientName === null) {
      ctx.addIssue({ code: 'custom', message: 'Escribe el nombre del contratante.', path: ['newClientName'] });
    }
    if (value.newClientTaxId !== null && !TAX_ID.test(value.newClientTaxId)) {
      ctx.addIssue({ code: 'custom', message: 'RUC o cédula: solo letras, dígitos o guion (5 a 20).', path: ['newClientTaxId'] });
    }
  } else if (!z.string().uuid().safeParse(value.clientId).success) {
    ctx.addIssue({ code: 'custom', message: 'Contratante no válido.', path: ['clientId'] });
  }
}

/**
 * Valor del proyecto (monto del contrato o presupuesto referencial, moneda e IVA).
 * Un solo conjunto de campos para todos los formularios que lo incluyan: alta y edición del
 * proyecto, carga del TDR y ficha. Nombres de campo: contractAmount, currency, amountIncludesVat.
 */
const projectValueFields = {
  contractAmount: field()
    .transform(parseDecimal)
    .refine((v) => v !== undefined, 'Valor: escribe un número, por ejemplo 286.400,50.')
    .refine((v) => v == null || !/\.\d{3,}$/.test(v), 'Valor: máximo dos decimales.')
    .refine((v) => v == null || v.split('.')[0]!.length <= 12, 'Valor demasiado grande.')
    .transform((v) => v ?? null),
  currency: field()
    .transform((v) => textOrNull(v)?.toUpperCase() ?? null)
    .refine((v) => v === null || /^[A-Z]{3}$/.test(v), 'Moneda: código de tres letras, por ejemplo USD.'),
  amountIncludesVat: z
    .enum(['', 'si', 'no'])
    .catch('')
    .transform((v) => (v === '' ? null : v === 'si')),
};

function amountHasCurrency(value: { contractAmount: string | null; currency: string | null }): boolean {
  return value.contractAmount === null || value.currency !== null;
}
const AMOUNT_CURRENCY_ERROR = { message: 'Indica la moneda del valor.', path: ['currency'] };

/** Formulario independiente del valor del proyecto (por ejemplo, junto a la carga del TDR). */
export const projectValueSchema = z
  .object({ ...projectValueFields, version })
  .refine(amountHasCurrency, AMOUNT_CURRENCY_ERROR);

/** Alta y edición básica de un proyecto (pestaña Proyectos). */
export const projectFormSchema = z
  .object({
    name: requiredText(200, 'El nombre del proyecto'),
    startDate: optionalDate('Fecha de inicio'),
    endDate: optionalDate('Fecha de fin'),
    venues: field().transform(parseList),
    notes: optionalLongText(2000, 'Notas'),
    ...projectValueFields,
    ...clientFields,
  })
  .superRefine(checkClientChoice)
  .refine(datesInOrder, DATES_ORDER_ERROR)
  .refine(amountHasCurrency, AMOUNT_CURRENCY_ERROR);

/** Ficha del proyecto (pestaña Requerimiento). */
export const fichaFormSchema = z
  .object({
    processCode: optionalText(120, 'Código del proceso'),
    purpose: optionalLongText(2000, 'Objeto'),
    ...projectValueFields,
    venues: field().transform(parseList),
    termText: optionalText(500, 'Plazo'),
    startDate: optionalDate('Fecha de inicio'),
    endDate: optionalDate('Fecha de fin'),
    contractAdministrator: optionalText(200, 'Administrador del contrato'),
    version,
    ...clientFields,
  })
  .superRefine(checkClientChoice)
  .refine(datesInOrder, DATES_ORDER_ERROR)
  .refine(amountHasCurrency, AMOUNT_CURRENCY_ERROR);

export const workerFormSchema = z.object({
  fullName: requiredText(200, 'El nombre completo'),
  jobTitle: optionalText(120, 'Cargo'),
  phone: optionalText(40, 'Teléfono'),
  email: optionalText(200, 'Correo').refine(
    (v) => v === null || z.string().email().safeParse(v).success,
    'Correo no válido.',
  ),
  notes: optionalLongText(2000, 'Notas'),
  active: field().transform((v) => v === 'on' || v === 'true'),
});

export const idSchema = (label: string) => uuid(label);
export const versionSchema = version;

export type FieldErrors = Record<string, string[] | undefined>;

/** Errores por campo a partir de un resultado fallido de zod. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
