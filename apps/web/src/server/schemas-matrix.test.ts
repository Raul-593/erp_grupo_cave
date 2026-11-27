import { describe, expect, it } from 'vitest';
import { can } from '@/domain/access/permissions';
import { fichaApplySchema, matrixItemChangeSchema, matrixItemFormSchema, matrixItemMoveSchema } from './schemas';

const ITEM = '6f1c2a34-9b7d-4e21-8c3f-0a1b2c3d4e5f';
const change = (field: string, value: string) => matrixItemChangeSchema.safeParse({ itemId: ITEM, version: '3', field, value });

describe('cambios en la matriz editable', () => {
  it('convierte cantidades y días escritos en formato es-EC y acepta vacío como desconocido', () => {
    expect(change('cant', '1,5').data).toMatchObject({ field: 'cant', value: '1.5', version: 3 });
    expect(change('cant', '').data).toMatchObject({ value: null });
    expect(change('dias', '18').data).toMatchObject({ value: '18' });
    expect(change('cant', '2.000').data).toMatchObject({ value: '2000' });
  });

  it('rechaza números no válidos, negativos o con demasiados decimales', () => {
    expect(change('cant', 'tres').success).toBe(false);
    expect(change('cant', '-1').success).toBe(false);
    expect(change('cant', '1,12345').success).toBe(false);
    expect(change('dias', '1,555').success).toBe(false);
    expect(change('dias', '1234567').success).toBe(false);
  });

  it('exige rubro y producto; los demás textos pueden quedar vacíos', () => {
    expect(change('rubro', '   ').success).toBe(false);
    expect(change('producto', '').success).toBe(false);
    expect(change('subproducto', '  ').data).toMatchObject({ value: null });
    expect(change('descripcion', '').data).toMatchObject({ value: '' });
    expect(change('observacion', 'Línea 1\nLínea 2').data).toMatchObject({ value: 'Línea 1\nLínea 2' });
    expect(change('otro', 'x').success).toBe(false);
  });

  it('valida el alta de una fila y la dirección al mover', () => {
    expect(matrixItemFormSchema.safeParse({ extractionId: ITEM, rubro: 'Audio', producto: 'Parlantes', descripcion: '' }).success).toBe(true);
    expect(matrixItemFormSchema.safeParse({ extractionId: ITEM, rubro: '', producto: 'Parlantes' }).success).toBe(false);
    expect(matrixItemMoveSchema.safeParse({ itemId: ITEM, version: '1', direction: 'up' }).success).toBe(true);
    expect(matrixItemMoveSchema.safeParse({ itemId: ITEM, version: '1', direction: 'left' }).success).toBe(false);
  });

  it('solo admite campos conocidos de la ficha y un contratante válido', () => {
    const base = { projectId: ITEM, version: '1', extractionId: ITEM };
    expect(fichaApplySchema.safeParse({ ...base, fields: ['monto', 'sedes'], client: '' }).success).toBe(true);
    expect(fichaApplySchema.safeParse({ ...base, fields: [], client: 'nuevo' }).success).toBe(true);
    expect(fichaApplySchema.safeParse({ ...base, fields: ['nombre'], client: '' }).success).toBe(false);
    expect(fichaApplySchema.safeParse({ ...base, fields: [], client: 'otro' }).success).toBe(false);
  });

  it('solo el superusuario edita y confirma la matriz', () => {
    expect(can('admin', 'matrix.edit')).toBe(true);
    for (const role of ['field', 'accounting', 'supplier'] as const) expect(can(role, 'matrix.edit')).toBe(false);
  });
});
