/**
 * Valores permitidos por las restricciones CHECK de las migraciones.
 * Mantener sincronizado con packages/db/migrations (lo verifica tests/schema.test.ts).
 */
export const EXTRACTION_STATUSES = [
  'pending',
  'processing',
  'processed',
  'failed',
  'confirmed',
  'superseded',
] as const;

export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const ITEM_SOURCES = ['ai', 'manual'] as const;

export type ItemSource = (typeof ITEM_SOURCES)[number];

// --- Migración 0007: planificación, abastecimiento y ejecución ---------------------------

export const SUPPLIER_KINDS = ['external', 'holding', 'payroll'] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

export const CONTRACT_STATUSES = ['not_required', 'pending', 'signed'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const ACTIVITY_STATUSES = ['not_started', 'in_progress', 'done', 'delayed'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const PAYMENT_METHODS = ['transfer', 'cash', 'check', 'internal'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_SUPPORTS = ['invoice_and_receipt', 'internal_invoice', 'none'] as const;
export type PaymentSupport = (typeof PAYMENT_SUPPORTS)[number];

export const QUOTE_STATUSES = ['quoted', 'no_response', 'manual_proforma'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** En orden de avance: el índice es el número de pasos completados. */
export const MOUNT_STATUSES = [
  'not_started',
  'in_warehouse',
  'on_site',
  'mounted',
  'tested',
  'in_event',
  'dismounted',
] as const;
export type MountStatus = (typeof MOUNT_STATUSES)[number];

export const CHECK_RESULTS = ['pending', 'pass', 'fail'] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];

export const EVIDENCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type EvidenceMimeType = (typeof EVIDENCE_MIME_TYPES)[number];

/** Estado de pago de un ítem; se calcula, no se guarda. */
export const ITEM_PAYMENT_STATUSES = ['no_order', 'unpaid', 'partial', 'paid'] as const;
export type ItemPaymentStatus = (typeof ITEM_PAYMENT_STATUSES)[number];

/** Roles de usuario (migración 0009). Los permisos de cada rol se definen en la aplicación. */
export const USER_ROLES = ['admin', 'field', 'accounting', 'supplier'] as const;
export type UserRole = (typeof USER_ROLES)[number];
