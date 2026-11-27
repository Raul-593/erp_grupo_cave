/**
 * Rótulos en español y tono de etiqueta de los valores que la base guarda en inglés
 * (tablas de la migración 0007). El tono es el de `Pill`.
 */
import type {
  ActivityStatus,
  CheckResult,
  ContractStatus,
  ItemPaymentStatus,
  MountStatus,
  OperationalStatus,
  PaymentMethod,
  PaymentSupport,
  QuoteStatus,
  SupplierKind,
} from '@erp/db';

export type Tone = 'ok' | 'wa' | 'ba' | 'bl' | 'vi' | 'neutral';
type Labels<K extends string> = Readonly<Record<K, readonly [label: string, tone: Tone]>>;

export const CONTRACT_STATUS: Labels<ContractStatus> = {
  not_required: ['No aplica', 'neutral'],
  pending: ['Pendiente', 'wa'],
  signed: ['Firmado', 'ok'],
};

export const ACTIVITY_STATUS: Labels<ActivityStatus> = {
  not_started: ['Por iniciar', 'neutral'],
  in_progress: ['En curso', 'bl'],
  done: ['Terminada', 'ok'],
  delayed: ['Atrasada', 'ba'],
};

export const ITEM_PAYMENT_STATUS: Labels<ItemPaymentStatus> = {
  no_order: ['Pendiente', 'neutral'],
  unpaid: ['Sin pagar', 'ba'],
  partial: ['Anticipo', 'wa'],
  paid: ['Pagado', 'ok'],
};

export const PAYMENT_METHOD: Readonly<Record<PaymentMethod, string>> = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
  check: 'Cheque',
  internal: 'Interna',
};

export const PAYMENT_SUPPORT: Labels<PaymentSupport> = {
  invoice_and_receipt: ['Factura + comprobante', 'ok'],
  internal_invoice: ['Factura interna', 'vi'],
  none: ['Sin factura', 'ba'],
};

export const QUOTE_STATUS: Labels<QuoteStatus> = {
  quoted: ['Cotizó', 'ok'],
  no_response: ['Sin responder', 'wa'],
  manual_proforma: ['Proforma', 'bl'],
};

/** En el mismo orden que MOUNT_STATUSES: el índice es el número de pasos completados. */
export const MOUNT_STATUS: Readonly<Record<MountStatus, string>> = {
  not_started: 'Sin iniciar',
  in_warehouse: 'En bodega',
  on_site: 'En sitio',
  mounted: 'Montado',
  tested: 'Probado',
  in_event: 'En evento',
  dismounted: 'Desmontado',
};

export const OPERATIONAL_STATUS: Labels<OperationalStatus> = {
  pending: ['Pendiente', 'wa'],
  in_progress: ['En proceso', 'bl'],
  ready: ['Listo', 'ok'],
};

export const SUPPLIER_KIND: Readonly<Record<SupplierKind, string>> = {
  external: 'Externo',
  holding: 'Del holding',
  payroll: 'Nómina interna',
};

export const CHECK_RESULT: Labels<CheckResult> = {
  pending: ['Pendiente', 'wa'],
  pass: ['Cumple', 'ok'],
  fail: ['No cumple', 'ba'],
};
