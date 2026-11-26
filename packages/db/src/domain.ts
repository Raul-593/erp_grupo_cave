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
