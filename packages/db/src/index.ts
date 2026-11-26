export { loadDbConfig, summarizeConnection, DbConfigError } from './config.ts';
export type { DbConfig, DbTarget, ConnectionSummary } from './config.ts';
export { createPool, withTransaction } from './client.ts';
export { PgErrorCode, getPgErrorCode } from './errors.ts';
export { EXTRACTION_STATUSES, ITEM_SOURCES } from './domain.ts';
export type { ExtractionStatus, ItemSource } from './domain.ts';
