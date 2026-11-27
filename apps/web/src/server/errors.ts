import { BusinessRuleError, DbConfigError, getPgErrorCode, PgErrorCode, VersionConflictError } from '@erp/db';

const UNIQUE_MESSAGES: Record<string, string> = {
  clients_tax_id_key: 'Ya existe un contratante con ese RUC o cédula.',
  companies_tax_id_key: 'Ya existe una empresa con ese RUC.',
  suppliers_name_key: 'Ya existe un proveedor con ese nombre.',
  purchase_orders_project_code_key: 'Ya existe una orden con ese código en este proyecto.',
};

const RULE_MESSAGES: Record<BusinessRuleError['rule'], string> = {
  paid_exceeds_amount: 'Lo pagado no puede superar el costo del ítem en la orden.',
  line_has_payments: 'El ítem ya tiene un valor pagado: pon lo pagado en cero antes de quitarlo de la orden.',
};

/** Mensajes de las reglas que la base aplica con triggers (por nombre de tabla). */
const CHECK_MESSAGES: Record<string, string> = {
  tdr_item_assignments: 'Ese trabajador está desactivado y no puede ser responsable.',
};

/**
 * Traduce un error técnico a un mensaje seguro en español. Nunca devuelve SQL, valores
 * internos ni datos de conexión; en el servidor se registra solo el código y la restricción.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof VersionConflictError) {
    return 'El registro cambió desde que lo abriste. Recarga la página y vuelve a intentarlo.';
  }
  if (error instanceof BusinessRuleError) return RULE_MESSAGES[error.rule];
  if (error instanceof DbConfigError) {
    console.error('[erp] Configuración de base de datos:', error.message);
    return 'La aplicación no está configurada para conectarse a la base de datos.';
  }
  const code = getPgErrorCode(error);
  const constraint =
    typeof error === 'object' && error !== null && 'constraint' in error && typeof error.constraint === 'string'
      ? error.constraint
      : undefined;
  // Los triggers no informan la tabla en el error: se toma de la línea de contexto de PL/pgSQL.
  const where = typeof error === 'object' && error !== null && 'where' in error && typeof error.where === 'string' ? error.where : '';
  const table = /check_assignment_worker_active/.test(where) ? 'tdr_item_assignments' : undefined;
  console.error('[erp] Error de servidor', { code: code ?? 'desconocido', constraint });

  switch (code) {
    case PgErrorCode.uniqueViolation:
      return (constraint && UNIQUE_MESSAGES[constraint]) ?? 'Ya existe un registro con esos datos.';
    case PgErrorCode.foreignKeyViolation:
      return 'Uno de los datos relacionados ya no existe. Recarga la página.';
    case PgErrorCode.restrictViolation:
      return 'No se puede eliminar porque tiene información relacionada.';
    case PgErrorCode.checkViolation:
      if (!constraint && table && CHECK_MESSAGES[table]) return CHECK_MESSAGES[table];
      return 'Algún dato no cumple las reglas del sistema. Revisa los campos.';
    default:
      return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
}
