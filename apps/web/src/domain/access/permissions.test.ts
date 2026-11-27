import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '@erp/db';
import { can, canDeleteEvidence, homePath, PERMISSIONS, permissionsOf, ROLE_LABELS, ROLES, scopeOf } from './permissions';

describe('permisos por rol', () => {
  it('el superusuario puede todo salvo responder cotizaciones como proveedor', () => {
    for (const permission of PERMISSIONS) expect(can('admin', permission)).toBe(permission !== 'quotes.respond');
  });

  it('el empleado de campo solo cambia proveedor y costo y gestiona fotografías', () => {
    expect(permissionsOf('field')).toEqual([
      'projects.read',
      'matrix.read',
      'items.plan_cost',
      'schedule.read',
      'evidence.read',
      'evidence.upload',
      'evidence.delete_own',
    ]);
    for (const denied of ['items.assign', 'items.plan_contract', 'schedule.write', 'procurement.read', 'tdr.read', 'users.manage'] as const) {
      expect(can('field', denied)).toBe(false);
    }
  });

  it('contabilidad solo lee, más el permiso reservado de aprobar costos', () => {
    const writes = PERMISSIONS.filter((p) => /\.(write|manage|assign|plan_cost|plan_contract|upload|delete_own|delete_any)$/.test(p));
    for (const permission of writes) expect(can('accounting', permission)).toBe(false);
    expect(can('accounting', 'procurement.read')).toBe(true);
    expect(can('accounting', 'costs.approve')).toBe(true);
  });

  it('el proveedor no ve nada de la operación', () => {
    expect(permissionsOf('supplier')).toEqual(['quotes.respond']);
  });

  it('la lista de roles de la interfaz coincide con la de la base', () => {
    expect([...ROLES].sort()).toEqual([...USER_ROLES].sort());
  });

  it('cada rol tiene nombre en pantalla y página de inicio', () => {
    for (const role of USER_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(homePath(role)).toMatch(/^\//);
    }
    expect(homePath('supplier')).toBe('/proveedor');
  });
});

describe('alcance y fotografías', () => {
  it('campo queda limitado a su trabajador; proveedor no tiene alcance', () => {
    expect(scopeOf({ role: 'admin', workerId: null })).toEqual({ kind: 'all' });
    expect(scopeOf({ role: 'accounting', workerId: 'w' })).toEqual({ kind: 'all' });
    expect(scopeOf({ role: 'field', workerId: 'w' })).toEqual({ kind: 'worker', workerId: 'w' });
    expect(scopeOf({ role: 'field', workerId: null })).toEqual({ kind: 'none' });
    expect(scopeOf({ role: 'supplier', workerId: null })).toEqual({ kind: 'none' });
  });

  it('campo elimina solo sus propias fotografías; el superusuario, cualquiera', () => {
    const field = { id: 'u1', role: 'field' as const };
    expect(canDeleteEvidence(field, 'u1')).toBe(true);
    expect(canDeleteEvidence(field, 'u2')).toBe(false);
    expect(canDeleteEvidence(field, null)).toBe(false);
    expect(canDeleteEvidence({ id: 'a', role: 'admin' }, null)).toBe(true);
    expect(canDeleteEvidence({ id: 'c', role: 'accounting' }, 'c')).toBe(false);
  });
});
