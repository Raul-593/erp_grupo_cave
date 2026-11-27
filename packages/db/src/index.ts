export { loadDbConfig, summarizeConnection, DbConfigError } from './config.ts';
export type { DbConfig, DbTarget, ConnectionSummary } from './config.ts';
export { createPool, withTransaction } from './client.ts';
export { PgErrorCode, getPgErrorCode } from './errors.ts';
export {
  EXTRACTION_STATUSES,
  ITEM_SOURCES,
  SUPPLIER_KINDS,
  CONTRACT_STATUSES,
  ACTIVITY_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_SUPPORTS,
  QUOTE_STATUSES,
  MOUNT_STATUSES,
  CHECK_RESULTS,
  EVIDENCE_MIME_TYPES,
  ITEM_PAYMENT_STATUSES,
  USER_ROLES,
} from './domain.ts';
export type {
  ExtractionStatus,
  ItemSource,
  SupplierKind,
  ContractStatus,
  ActivityStatus,
  PaymentMethod,
  PaymentSupport,
  QuoteStatus,
  MountStatus,
  CheckResult,
  EvidenceMimeType,
  ItemPaymentStatus,
  UserRole,
} from './domain.ts';
export { seedDemo, buildDemoRawResponse, findDemoExtraction, DemoSeedError, DEMO_PROVIDER, DEMO_PROMPT_VERSION } from './demo/seed.ts';
export type { DemoSeedOptions, DemoSeedResult, DemoPreviousProject } from './demo/seed.ts';
export type * from './demo/types.ts';
export * from './repositories/index.ts';
