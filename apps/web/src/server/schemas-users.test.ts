import { describe, expect, it } from 'vitest';
import { adminTabs, navModules, operationTabs } from '@/lib/navigation';
import { userFormSchema } from './schemas';

const WORKER = '6f1c2a34-9b7d-4e21-8c3f-0a1b2c3d4e5f';
const SUPPLIER = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d';

describe('formulario de usuario', () => {
  it('exige trabajador al empleado de campo y proveedor al proveedor', () => {
    const field = userFormSchema.safeParse({ fullName: 'Campo', role: 'field', workerId: '', supplierId: '' });
    expect(field.success).toBe(false);
    expect(field.error?.issues[0]?.path).toEqual(['workerId']);
    const supplier = userFormSchema.safeParse({ fullName: 'Prov', role: 'supplier', workerId: '', supplierId: '' });
    expect(supplier.error?.issues[0]?.path).toEqual(['supplierId']);
  });

  it('vacía el vínculo que no corresponde al rol y normaliza el correo', () => {
    const accounting = userFormSchema.parse({
      fullName: 'Contable',
      email: 'Contable@Ejemplo.TEST',
      role: 'accounting',
      workerId: WORKER,
      supplierId: SUPPLIER,
      active: 'on',
    });
    expect(accounting).toMatchObject({ email: 'contable@ejemplo.test', workerId: WORKER, supplierId: null, active: true });
    const supplier = userFormSchema.parse({ fullName: 'Prov', role: 'supplier', workerId: WORKER, supplierId: SUPPLIER });
    expect(supplier).toMatchObject({ workerId: null, supplierId: SUPPLIER, active: false, email: null });
  });

  it('rechaza roles y correos no válidos', () => {
    expect(userFormSchema.safeParse({ fullName: 'X', role: 'guest' }).success).toBe(false);
    expect(userFormSchema.safeParse({ fullName: 'X', role: 'admin', email: 'sin-arroba' }).success).toBe(false);
    expect(userFormSchema.safeParse({ fullName: '  ', role: 'admin' }).success).toBe(false);
  });
});

describe('navegación por rol', () => {
  const labels = (tabs: { label: string }[]) => tabs.map((tab) => tab.label);

  it('el superusuario ve todo, incluida Administración', () => {
    expect(labels(operationTabs('admin'))).toEqual([
      'Proyectos',
      'Requerimiento',
      'Planificación',
      'Abastecimiento',
      'Ejecución',
      'Trabajadores',
      'Proveedores',
    ]);
    expect(labels(navModules('admin'))).toEqual(['Operación', 'Administración']);
  });

  it('campo no ve Abastecimiento ni catálogos; contabilidad no ve Administración', () => {
    expect(labels(operationTabs('field'))).toEqual(['Proyectos', 'Requerimiento', 'Planificación', 'Ejecución']);
    expect(labels(operationTabs('accounting'))).toContain('Abastecimiento');
    expect(adminTabs('accounting')).toEqual([]);
    expect(labels(navModules('accounting'))).toEqual(['Operación']);
  });

  it('el proveedor no ve módulos de la operación', () => {
    expect(operationTabs('supplier')).toEqual([]);
    expect(navModules('supplier')).toEqual([]);
  });
});
