/** Códigos SQLSTATE de PostgreSQL que la aplicación traduce a mensajes controlados. */
export const PgErrorCode = {
  restrictViolation: '23001',
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
  checkViolation: '23514',
} as const;

export type PgErrorCode = (typeof PgErrorCode)[keyof typeof PgErrorCode];

export function getPgErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}
