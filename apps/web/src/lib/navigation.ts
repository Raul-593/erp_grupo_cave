/**
 * Navegación según el rol: solo aparecen los módulos y pestañas que el usuario puede abrir
 * (AGENTS.md §6, «Navegación»). Cada página vuelve a comprobar su permiso en el servidor.
 */
import type { UserRole } from '@erp/db';
import { can, homePath, type Permission } from '@/domain/access/permissions';

export interface NavLink {
  href: string;
  label: string;
}

export interface NavModule extends NavLink {
  icon: 'box' | 'users';
  /** Prefijo de ruta que marca el módulo como activo. */
  prefix: string;
}

const OPERATION_TABS: readonly (NavLink & { permission: Permission })[] = [
  { href: '/operacion/proyectos', label: 'Proyectos', permission: 'projects.read' },
  { href: '/operacion/requerimiento', label: 'Requerimiento', permission: 'matrix.read' },
  { href: '/operacion/planificacion', label: 'Planificación', permission: 'matrix.read' },
  { href: '/operacion/abastecimiento', label: 'Abastecimiento', permission: 'procurement.read' },
  { href: '/operacion/ejecucion', label: 'Ejecución', permission: 'schedule.read' },
];

const ADMIN_TABS: readonly (NavLink & { permission: Permission })[] = [
  { href: '/administracion/usuarios', label: 'Usuarios', permission: 'users.manage' },
  { href: '/administracion/trabajadores', label: 'Trabajadores', permission: 'catalogs.read' },
  { href: '/administracion/proveedores', label: 'Proveedores', permission: 'catalogs.read' },
];

export function operationTabs(role: UserRole): NavLink[] {
  return OPERATION_TABS.filter((tab) => can(role, tab.permission)).map(({ href, label }) => ({ href, label }));
}

/**
 * Administración solo la abre el superusuario (`users.manage`, como exige su layout). Contabilidad
 * tiene `catalogs.read`, pero aún no entra a Administración (decisión del usuario, 2026-11-28).
 */
export function adminTabs(role: UserRole): NavLink[] {
  if (!can(role, 'users.manage')) return [];
  return ADMIN_TABS.filter((tab) => can(role, tab.permission)).map(({ href, label }) => ({ href, label }));
}

export function navModules(role: UserRole): NavModule[] {
  const modules: NavModule[] = [];
  if (operationTabs(role).length > 0) {
    // La página de inicio de cada rol con Operación está dentro del módulo.
    modules.push({ href: homePath(role), label: 'Operación', icon: 'box', prefix: '/operacion' });
  }
  const admin = adminTabs(role);
  if (admin[0]) modules.push({ href: admin[0].href, label: 'Administración', icon: 'users', prefix: '/administracion' });
  return modules;
}
