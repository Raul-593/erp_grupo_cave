/**
 * Validación de formularios en el servidor (zod). Convierte los campos de FormData en
 * datos listos para los repositorios y devuelve errores por campo en español.
 */
import { z } from 'zod';
import {
  ACTIVITY_STATUSES,
  CHECK_RESULTS,
  CONTRACT_STATUSES,
  MOUNT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_SUPPORTS,
  SUPPLIER_KINDS,
} from '@erp/db';
import { ALLOCATION_PREFIX, NEW_CLIENT } from '@/lib/constants';
import { compareAmounts, sumAmounts } from '@/lib/money';
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

/** Importe opcional con dos decimales como máximo, en texto decimal exacto (o null). */
const optionalAmount = (label: string) =>
  field()
    .transform(parseDecimal)
    .refine((v) => v !== undefined, `${label}: escribe un número, por ejemplo 8.400,50.`)
    .refine((v) => v == null || !/\.\d{3,}$/.test(v), `${label}: máximo dos decimales.`)
    .refine((v) => v == null || v.split('.')[0]!.length <= 12, `${label} demasiado grande.`)
    .transform((v) => v ?? null);

/** Lista desplegable opcional de registros: vacío equivale a «ninguno». */
const optionalId = (label: string) =>
  field()
    .transform((v) => (v.trim() === '' ? null : v.trim()))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, `${label} no válido.`);

/** Alta y edición de un proveedor (pestaña Proveedores). */
export const supplierFormSchema = z.object({
  name: requiredText(200, 'El nombre del proveedor'),
  kind: z.enum(SUPPLIER_KINDS, 'Selecciona el tipo de proveedor.'),
  taxId: optionalText(20, 'RUC').refine((v) => v === null || TAX_ID.test(v), 'RUC o cédula: solo letras, dígitos o guion (5 a 20).'),
  notes: optionalLongText(2000, 'Notas'),
  active: field().transform((v) => v === 'on' || v === 'true'),
});

/** Cambio de responsable de un ítem: el responsable que se veía y el nuevo (vacío = sin asignar). */
export const responsibleChangeSchema = z.object({
  itemId: uuid('Ítem'),
  expectedWorkerId: optionalId('Responsable'),
  workerId: optionalId('Responsable'),
});

/** Un campo de la planificación de un ítem; `version` vacía significa que aún no tiene plan. */
const planTarget = {
  itemId: uuid('Ítem'),
  version: field().transform((v, ctx) => {
    if (v.trim() === '') return null;
    const parsed = version.safeParse(v);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'Versión no válida.' });
      return z.NEVER;
    }
    return parsed.data;
  }),
};
export const planChangeSchema = z.discriminatedUnion('field', [
  z.object({ ...planTarget, field: z.literal('supplierId'), value: optionalId('Proveedor') }),
  z.object({ ...planTarget, field: z.literal('plannedCost'), value: optionalAmount('Costo') }),
  z.object({ ...planTarget, field: z.literal('contractStatus'), value: z.enum(CONTRACT_STATUSES, 'Estado de contrato no válido.') }),
]);

/** Estado (vacío = sin registrar) o responsable (vacío = sin responsable) de una actividad. */
export const activityChangeSchema = z.discriminatedUnion('field', [
  z.object({
    id: uuid('Actividad'),
    version,
    field: z.literal('status'),
    value: z.enum(['', ...ACTIVITY_STATUSES], 'Estado no válido.').transform((v) => (v === '' ? null : v)),
  }),
  z.object({ id: uuid('Actividad'), version, field: z.literal('workerId'), value: optionalId('Responsable') }),
]);

/** Estado de montaje de un ítem; `version` vacía significa que aún no tiene registro de ejecución. */
export const mountChangeSchema = z.object({
  itemId: planTarget.itemId,
  version: planTarget.version,
  value: z.enum(MOUNT_STATUSES, 'Estado de montaje no válido.'),
});

/** Resultado de un control del checklist previo. */
export const checkChangeSchema = z.object({
  id: uuid('Control'),
  version,
  value: z.enum(CHECK_RESULTS, 'Resultado no válido.'),
});

/** Importe obligatorio (cero incluido), en texto decimal exacto. */
const requiredAmount = (label: string) =>
  optionalAmount(label)
    .refine((v): v is string => v !== null, `${label}: escribe un valor.`)
    .transform((v) => v as string);

/** Alta de una orden de compra en un proyecto. */
export const orderFormSchema = z.object({
  projectId: uuid('Proyecto'),
  code: requiredText(40, 'El código de la orden'),
});

/** Orden de un ítem (vacío = sin orden); `version` vacía significa que el ítem no estaba en ninguna orden. */
export const itemOrderChangeSchema = z.object({
  itemId: planTarget.itemId,
  version: planTarget.version,
  orderId: optionalId('Orden'),
});

const lineTarget = { itemId: uuid('Ítem'), version };
/** Un campo de la línea de una orden: monto o responsable de pago. Lo pagado se calcula de los pagos. */
export const orderLineChangeSchema = z.discriminatedUnion('field', [
  z.object({ ...lineTarget, field: z.literal('amount'), value: requiredAmount('Costo') }),
  z.object({ ...lineTarget, field: z.literal('paymentWorkerId'), value: optionalId('Responsable de pago') }),
]);

/** Alta y edición de un pago contra una orden. */
export const paymentFormSchema = z.object({
  orderId: z.string({ error: 'Selecciona la orden.' }).uuid('Selecciona la orden.'),
  paidOn: field()
    .transform(textOrNull)
    .refine((v): v is string => v !== null, 'La fecha es obligatoria.')
    .refine((v) => v === null || (DATE.test(v) && !Number.isNaN(Date.parse(v))), 'Fecha no válida.')
    .transform((v) => v as string),
  concept: requiredText(200, 'El concepto'),
  method: z.enum(PAYMENT_METHODS, 'Selecciona la forma de pago.'),
  amount: requiredAmount('Monto').refine((v) => Number(v) > 0, 'Monto: debe ser mayor que cero.'),
  support: z.enum(PAYMENT_SUPPORTS, 'Selecciona el respaldo.'),
});

export interface PaymentAllocationsResult {
  /** Ítems con importe mayor que cero, en el orden en que llegaron. */
  allocations: { itemId: string; amount: string }[];
  /** Errores por campo (`reparto:<ítem>`). */
  fieldErrors: FieldErrors;
  /** Error del reparto en conjunto: suma mayor que el monto del pago. */
  message: string | null;
}

/**
 * Reparto de un pago entre ítems: campos `reparto:<id del ítem>` del formulario. Vacío o cero
 * significa que ese ítem no recibe nada; el reparto puede sumar menos que el monto del pago
 * (queda «sin repartir»), pero nunca más. `paymentAmount` es el monto ya validado, o null.
 */
export function parsePaymentAllocations(values: Record<string, string>, paymentAmount: string | null): PaymentAllocationsResult {
  const allocations: PaymentAllocationsResult['allocations'] = [];
  const errors: FieldErrors = {};
  const amountSchema = optionalAmount('Importe');
  for (const [key, raw] of Object.entries(values)) {
    if (!key.startsWith(ALLOCATION_PREFIX)) continue;
    const itemId = key.slice(ALLOCATION_PREFIX.length);
    if (!z.string().uuid().safeParse(itemId).success) {
      errors[key] = ['Ítem no válido.'];
      continue;
    }
    const parsed = amountSchema.safeParse(raw);
    if (!parsed.success) {
      errors[key] = [firstIssue(parsed.error)];
      continue;
    }
    if (parsed.data !== null && compareAmounts(parsed.data, '0') > 0) allocations.push({ itemId, amount: parsed.data });
  }
  const total = sumAmounts(allocations.map((allocation) => allocation.amount));
  const exceeds = Object.keys(errors).length === 0 && paymentAmount !== null && compareAmounts(total, paymentAmount) > 0;
  return {
    allocations,
    fieldErrors: errors,
    message: exceeds ? 'El reparto entre los ítems suma más que el monto del pago. Baja algún importe o sube el monto.' : null,
  };
}

/** Primer mensaje de error de un resultado fallido de zod, para ediciones de un solo campo. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dato no válido.';
}

export const idSchema = (label: string) => uuid(label);
export const versionSchema = version;

export type FieldErrors = Record<string, string[] | undefined>;

/** Errores por campo a partir de un resultado fallido de zod. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
