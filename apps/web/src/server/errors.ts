import { BusinessRuleError, DbConfigError, DraftRuleError, getPgErrorCode, PgErrorCode, VersionConflictError } from '@erp/db';
import { RAISE_COST_FIRST } from '@/lib/constants';

const UNIQUE_MESSAGES: Record<string, string> = {
  clients_tax_id_key: 'Ya existe un contratante con ese RUC o cédula.',
  companies_tax_id_key: 'Ya existe una empresa con ese RUC.',
  suppliers_name_key: 'Ya existe un proveedor con ese nombre.',
  purchase_orders_project_code_key: 'Ya existe una orden con ese código en este proyecto.',
  app_users_email_key: 'Ya existe un usuario con ese correo.',
  app_users_worker_id_key: 'Ese trabajador ya tiene un usuario.',
};

const RULE_MESSAGES: Record<BusinessRuleError['rule'], string> = {
  paid_exceeds_amount: 'El costo no puede quedar por debajo de lo que ya se le pagó al ítem.',
  line_has_payments:
    'El ítem tiene pagos repartidos. Quita antes su parte en esos pagos (botón «Editar» de cada pago) y después cámbialo o quítalo de la orden.',
  allocation_exceeds_balance: `Un ítem recibiría más que su costo en la orden. ${RAISE_COST_FIRST}`,
  allocation_exceeds_payment: 'El reparto entre los ítems suma más que el monto del pago.',
  allocation_other_order: 'Uno de los ítems ya no pertenece a la orden del pago. Recarga la página.',
  payment_has_allocations:
    'Este pago ya está repartido entre ítems de su orden. Guárdalo primero sin reparto (importes en blanco) y después cámbialo de orden.',
};

/** Mensajes de las reglas que la base aplica con triggers (por nombre de tabla). */
const CHECK_MESSAGES: Record<string, string> = {
  tdr_item_assignments: 'Ese trabajador está desactivado y no puede ser responsable.',
  tdr_items: 'Esta matriz ya está confirmada y no se puede modificar (solo su responsable).',
};

/** Reglas de la etapa D (matriz editable y confirmación). */
export const DRAFT_MESSAGES: Record<DraftRuleError['code'], string> = {
  draft_not_editable: 'Esta matriz ya está confirmada y no se puede modificar (solo su responsable).',
  project_has_confirmed_matrix:
    'El proyecto ya tiene una matriz confirmada. Por ahora solo se admite una por proyecto (las versiones y adendas llegarán después).',
  draft_empty: 'Añade al menos un ítem antes de confirmar la matriz.',
  document_has_active_extraction: 'Este documento tiene un procesamiento en curso. Espera a que termine.',
};

/** Reglas que la base aplica por su cuenta (migraciones 0008 a 0010), por nombre de restricción. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  tdr_extractions_one_confirmed_per_project: DRAFT_MESSAGES.project_has_confirmed_matrix,
  tdr_extractions_confirm_requires_items: DRAFT_MESSAGES.draft_empty,
  tdr_items_rubro_not_blank: 'El rubro no puede quedar vacío.',
  tdr_items_producto_not_blank: 'El producto no puede quedar vacío.',
  tdr_items_subproducto_not_blank: 'El subproducto no puede ser solo espacios; déjalo vacío si no hay uno.',
  tdr_items_cant_non_negative: 'La cantidad no puede ser negativa.',
  tdr_items_dias_non_negative: 'Los días no pueden ser negativos.',
  payment_allocations_same_order: RULE_MESSAGES.allocation_other_order,
  payment_allocations_within_payment: RULE_MESSAGES.allocation_exceeds_payment,
  payment_allocations_within_line: RULE_MESSAGES.allocation_exceeds_balance,
  purchase_order_lines_paid_within_amount: RULE_MESSAGES.paid_exceeds_amount,
  purchase_order_lines_order_locked: RULE_MESSAGES.line_has_payments,
  purchase_order_lines_paid_amount_derived: 'Lo pagado de un ítem se calcula a partir de los pagos; no se escribe directamente.',
  payments_order_locked: RULE_MESSAGES.payment_has_allocations,
  payments_amount_covers_allocations: RULE_MESSAGES.allocation_exceeds_payment,
  app_users_last_admin: 'Debe quedar al menos un superusuario activo. Activa o crea otro antes de cambiar este.',
  app_users_no_delete: 'Los usuarios no se borran: se desactivan.',
  app_users_field_requires_worker: 'Un empleado de campo debe estar vinculado a su trabajador.',
  app_users_supplier_link: 'Solo un usuario de tipo proveedor se vincula a un proveedor, y siempre.',
  app_users_supplier_no_worker: 'Un usuario de tipo proveedor no se vincula a un trabajador.',
  audit_log_append_only: 'El historial de cambios no se modifica.',
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
  if (error instanceof DraftRuleError) return DRAFT_MESSAGES[error.code];
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
  const table = /check_assignment_worker_active/.test(where)
    ? 'tdr_item_assignments'
    : /protect_tdr_items/.test(where)
      ? 'tdr_items'
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
      if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint];
      if (!constraint && table && CHECK_MESSAGES[table]) return CHECK_MESSAGES[table];
      return 'Algún dato no cumple las reglas del sistema. Revisa los campos.';
    default:
      return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
}
