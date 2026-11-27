import { DbConfigError, getPgErrorCode, PgErrorCode, VersionConflictError } from '@erp/db';

const UNIQUE_MESSAGES: Record<string, string> = {
  clients_tax_id_key: 'Ya existe un contratante con ese RUC o cédula.',
  companies_tax_id_key: 'Ya existe una empresa con ese RUC.',
};

/**
 * Traduce un error técnico a un mensaje seguro en español. Nunca devuelve SQL, valores
 * internos ni datos de conexión; en el servidor se registra solo el código y la restricción.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof VersionConflictError) {
    return 'El registro cambió desde que lo abriste. Recarga la página y vuelve a intentarlo.';
  }
  if (error instanceof DbConfigError) {
    console.error('[erp] Configuración de base de datos:', error.message);
    return 'La aplicación no está configurada para conectarse a la base de datos.';
  }
  const code = getPgErrorCode(error);
  const constraint =
    typeof error === 'object' && error !== null && 'constraint' in error && typeof error.constraint === 'string'
      ? error.constraint
      : undefined;
  console.error('[erp] Error de servidor', { code: code ?? 'desconocido', constraint });

  switch (code) {
    case PgErrorCode.uniqueViolation:
      return (constraint && UNIQUE_MESSAGES[constraint]) ?? 'Ya existe un registro con esos datos.';
    case PgErrorCode.foreignKeyViolation:
      return 'Uno de los datos relacionados ya no existe. Recarga la página.';
    case PgErrorCode.restrictViolation:
      return 'No se puede eliminar porque tiene información relacionada.';
    case PgErrorCode.checkViolation:
      return 'Algún dato no cumple las reglas del sistema. Revisa los campos.';
    default:
      return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
}
