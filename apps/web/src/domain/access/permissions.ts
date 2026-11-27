/**
 * Permisos por rol (PLAN.md, parte U, decisiones U-D2 a U-D9). Funciones puras: no conocen la
 * base ni la sesión. El servidor las aplica en cada acción y ruta; la interfaz solo las usa
 * para ocultar o deshabilitar controles.
 */
import type { UserRole } from '@erp/db';

export const PERMISSIONS = [
  /** Ver la lista de proyectos y la ficha (campo: solo los proyectos con ítems suyos). */
  'projects.read',
  /** Crear y editar proyectos, contratantes, ficha y valor del proyecto. */
  'projects.write',
  /** Ver los documentos TDR, sus PDF y los intentos de extracción. */
  'tdr.read',
  /** Cargar, borrar y procesar TDR con IA. */
  'tdr.manage',
  /** Ver la matriz de entregables (campo: solo sus ítems). */
  'matrix.read',
  /** Asignar o cambiar el responsable de un ítem. */
  'items.assign',
  /** Proveedor adjudicado y costo del ítem en Planificación (campo: solo sus ítems). */
  'items.plan_cost',
  /** Estado del contrato del ítem. */
  'items.plan_contract',
  /** Ver actividades, estado de montaje y checklist previo (campo: solo sus ítems). */
  'schedule.read',
  /** Cambiar actividades (responsable y estado). */
  'schedule.write',
  /**
   * Cambiar el estado de montaje de un ítem en el checklist de entregables (campo: solo sus
   * ítems). Decisión del usuario, 2026-11-27.
   */
  'mount.update',
  /**
   * Marcar si cumple o no cumple un control del checklist previo al evento (campo: solo los
   * controles de los que es responsable). Decisión del usuario, 2026-11-27.
   */
  'checks.update',
  /** Ver órdenes de compra y pagos. */
  'procurement.read',
  /** Registrar y cambiar órdenes de compra y pagos. */
  'procurement.write',
  /** Ver solicitudes de cotización y el comparativo. */
  'quotes.read',
  /** Ver fotografías de evidencia (campo: solo de sus ítems). */
  'evidence.read',
  /** Subir fotografías de evidencia (campo: solo en sus ítems). */
  'evidence.upload',
  /** Eliminar las fotografías que subió uno mismo (campo: solo en sus ítems). */
  'evidence.delete_own',
  /** Eliminar cualquier fotografía. */
  'evidence.delete_any',
  /** Ver los catálogos de trabajadores y proveedores. */
  'catalogs.read',
  /** Crear, editar, activar y desactivar trabajadores y proveedores. */
  'catalogs.write',
  /** Crear, editar, activar y desactivar usuarios. */
  'users.manage',
  /** Futuro módulo de Contabilidad: aprobar costos. Sin pantalla todavía. */
  'costs.approve',
  /** Futuro portal del proveedor: responder sus cotizaciones. Sin pantalla todavía. */
  'quotes.respond',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ADMIN: readonly Permission[] = PERMISSIONS.filter((permission) => permission !== 'quotes.respond');

const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  admin: new Set(ADMIN),
  field: new Set<Permission>([
    'projects.read',
    'matrix.read',
    'items.plan_cost',
    'schedule.read',
    'mount.update',
    'checks.update',
    'evidence.read',
    'evidence.upload',
    'evidence.delete_own',
  ]),
  accounting: new Set<Permission>([
    'projects.read',
    'tdr.read',
    'matrix.read',
    'schedule.read',
    'procurement.read',
    'quotes.read',
    'evidence.read',
    'catalogs.read',
    'costs.approve',
  ]),
  supplier: new Set<Permission>(['quotes.respond']),
};

/**
 * Roles en el orden de pantalla. Copia de USER_ROLES de @erp/db para los componentes de
 * cliente, que no pueden importar valores de la capa de datos (arrastrarían el driver pg al
 * navegador); una prueba comprueba que coinciden.
 */
export const ROLES = ['admin', 'field', 'accounting', 'supplier'] as const satisfies readonly UserRole[];

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  admin: 'Superusuario',
  field: 'Empleado de campo',
  accounting: 'Contabilidad',
  supplier: 'Proveedor',
};

export const ROLE_DESCRIPTIONS: Readonly<Record<UserRole, string>> = {
  admin: 'Ve y cambia todo el sistema, y gestiona los usuarios.',
  field:
    'Ve solo los ítems donde es responsable; cambia su proveedor y costo, el estado de montaje y las fotografías de sus ítems, y marca si cumplen los controles previos que tiene a cargo.',
  accounting: 'Ve todos los proyectos, órdenes y pagos sin cambiarlos. Aprobará costos cuando exista su módulo.',
  supplier: 'Responderá sus cotizaciones cuando exista el portal del proveedor. Hoy no ve otros datos.',
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsOf(role: UserRole): Permission[] {
  return PERMISSIONS.filter((permission) => ROLE_PERMISSIONS[role].has(permission));
}

/**
 * Alcance de los datos de un usuario: todo el sistema, solo los ítems de su trabajador o nada.
 * El empleado de campo siempre tiene trabajador (la base lo exige).
 */
export type Scope = { kind: 'all' } | { kind: 'worker'; workerId: string } | { kind: 'none' };

export function scopeOf(user: { role: UserRole; workerId: string | null }): Scope {
  switch (user.role) {
    case 'admin':
    case 'accounting':
      return { kind: 'all' };
    case 'field':
      return user.workerId ? { kind: 'worker', workerId: user.workerId } : { kind: 'none' };
    case 'supplier':
      return { kind: 'none' };
  }
}

/** Página de inicio según el rol. */
export function homePath(role: UserRole): string {
  if (role === 'supplier') return '/proveedor';
  if (role === 'field') return '/operacion/planificacion';
  return '/operacion/requerimiento';
}

/**
 * ¿Puede eliminar esta fotografía? Quien tiene `evidence.delete_any`, cualquiera; quien solo
 * tiene `evidence.delete_own`, únicamente las que subió (las anteriores a los usuarios, no).
 */
export function canDeleteEvidence(user: { id: string; role: UserRole }, uploadedBy: string | null): boolean {
  if (can(user.role, 'evidence.delete_any')) return true;
  return can(user.role, 'evidence.delete_own') && uploadedBy !== null && uploadedBy === user.id;
}
