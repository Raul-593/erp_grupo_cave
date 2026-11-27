import { describe, expect, it } from 'vitest';
import {
  activityChangeSchema,
  checkChangeSchema,
  firstIssue,
  itemOrderChangeSchema,
  mountChangeSchema,
  orderFormSchema,
  orderLineChangeSchema,
  parsePaymentAllocations,
  paymentFormSchema,
  planChangeSchema,
  responsibleChangeSchema,
  supplierFormSchema,
} from './schemas';

const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('cambio de responsable', () => {
  it('convierte el valor vacío en «sin asignar»', () => {
    expect(responsibleChangeSchema.parse({ itemId: ITEM, expectedWorkerId: '', workerId: OTHER })).toEqual({
      itemId: ITEM,
      expectedWorkerId: null,
      workerId: OTHER,
    });
    expect(responsibleChangeSchema.parse({ itemId: ITEM, expectedWorkerId: OTHER, workerId: '' }).workerId).toBeNull();
  });

  it('rechaza identificadores que no son UUID', () => {
    expect(responsibleChangeSchema.safeParse({ itemId: 'x', expectedWorkerId: '', workerId: OTHER }).success).toBe(false);
    expect(responsibleChangeSchema.safeParse({ itemId: ITEM, expectedWorkerId: '', workerId: "1'; DROP TABLE workers" }).success).toBe(false);
    expect(responsibleChangeSchema.safeParse(null).success).toBe(false);
  });
});

describe('cambio de un campo de la planificación', () => {
  const change = (field: string, value: string, version = '3') => planChangeSchema.safeParse({ itemId: ITEM, version, field, value });

  it('acepta costos en formato es-EC y los deja como texto decimal exacto', () => {
    expect(change('plannedCost', '8.400,50').data).toEqual({ itemId: ITEM, version: 3, field: 'plannedCost', value: '8400.50' });
    expect(change('plannedCost', '$ 1.620').data?.value).toBe('1620');
    expect(change('plannedCost', '').data?.value).toBeNull();
  });

  it('rechaza costos negativos, con más de dos decimales o que no son números', () => {
    for (const value of ['-5', '10,123', 'abc', '1e9']) {
      const result = change('plannedCost', value);
      expect(result.success, value).toBe(false);
      if (!result.success) expect(firstIssue(result.error)).toMatch(/^Costo/);
    }
  });

  it('valida proveedor y estado del contrato', () => {
    expect(change('supplierId', OTHER).data?.value).toBe(OTHER);
    expect(change('supplierId', '').data?.value).toBeNull();
    expect(change('supplierId', 'x').success).toBe(false);
    expect(change('contractStatus', 'signed').data?.value).toBe('signed');
    expect(change('contractStatus', 'firmado').success).toBe(false);
  });

  it('distingue «sin plan todavía» de una versión no válida y rechaza campos desconocidos', () => {
    expect(change('plannedCost', '10', '').data?.version).toBeNull();
    expect(change('plannedCost', '10', '0').success).toBe(false);
    expect(change('plannedCost', '10', 'abc').success).toBe(false);
    expect(change('tdr_item_id', OTHER).success).toBe(false);
  });
});

describe('cambios de estado', () => {
  it('actividad: estado vacío es «sin registrar» y responsable vacío es «sin asignar»', () => {
    expect(activityChangeSchema.parse({ id: ITEM, version: '2', field: 'status', value: '' })).toEqual({
      id: ITEM,
      version: 2,
      field: 'status',
      value: null,
    });
    expect(activityChangeSchema.parse({ id: ITEM, version: '2', field: 'status', value: 'delayed' }).value).toBe('delayed');
    expect(activityChangeSchema.parse({ id: ITEM, version: '2', field: 'workerId', value: '' }).value).toBeNull();
    expect(activityChangeSchema.safeParse({ id: ITEM, version: '2', field: 'status', value: 'atrasada' }).success).toBe(false);
    expect(activityChangeSchema.safeParse({ id: ITEM, version: '', field: 'status', value: 'done' }).success).toBe(false);
    expect(activityChangeSchema.safeParse({ id: ITEM, version: '2', field: 'name', value: 'x' }).success).toBe(false);
  });

  it('montaje: acepta un ítem sin registro previo y solo estados conocidos', () => {
    expect(mountChangeSchema.parse({ itemId: ITEM, version: '', value: 'mounted' })).toEqual({ itemId: ITEM, version: null, value: 'mounted' });
    expect(mountChangeSchema.parse({ itemId: ITEM, version: '4', value: 'dismounted' }).version).toBe(4);
    expect(mountChangeSchema.safeParse({ itemId: ITEM, version: '4', value: 'montado' }).success).toBe(false);
    expect(mountChangeSchema.safeParse({ itemId: ITEM, version: '4', value: '' }).success).toBe(false);
  });

  it('checklist previo: exige versión y un resultado conocido', () => {
    expect(checkChangeSchema.parse({ id: ITEM, version: '1', value: 'fail' })).toEqual({ id: ITEM, version: 1, value: 'fail' });
    expect(checkChangeSchema.safeParse({ id: ITEM, version: '1', value: 'cumple' }).success).toBe(false);
    expect(checkChangeSchema.safeParse({ id: 'x', version: '1', value: 'pass' }).success).toBe(false);
  });
});

describe('órdenes y pagos', () => {
  it('orden nueva: exige proyecto y código', () => {
    expect(orderFormSchema.parse({ projectId: ITEM, code: '  OC-019 ' })).toEqual({ projectId: ITEM, code: 'OC-019' });
    expect(orderFormSchema.safeParse({ projectId: ITEM, code: ' ' }).success).toBe(false);
    expect(orderFormSchema.safeParse({ projectId: 'x', code: 'OC-1' }).success).toBe(false);
  });

  it('orden de un ítem: vacío es «sin orden» y la versión vacía es «sin línea»', () => {
    expect(itemOrderChangeSchema.parse({ itemId: ITEM, version: '', orderId: OTHER })).toEqual({ itemId: ITEM, version: null, orderId: OTHER });
    expect(itemOrderChangeSchema.parse({ itemId: ITEM, version: '2', orderId: '' })).toEqual({ itemId: ITEM, version: 2, orderId: null });
    expect(itemOrderChangeSchema.safeParse({ itemId: ITEM, version: '2', orderId: 'x' }).success).toBe(false);
  });

  it('línea de orden: importes obligatorios, exactos y no negativos', () => {
    const change = (field: string, value: string) => orderLineChangeSchema.safeParse({ itemId: ITEM, version: '1', field, value });
    expect(change('amount', '8.400,50').data?.value).toBe('8400.50');
    expect(change('amount', '0').data?.value).toBe('0');
    expect(change('paymentWorkerId', '').data?.value).toBeNull();
    // Lo pagado ya no es un campo editable: se calcula a partir de los pagos.
    for (const [field, value] of [['amount', ''], ['amount', '-1'], ['amount', '1,234'], ['amount', 'abc'], ['paidAmount', '10'], ['order', OTHER]]) {
      expect(change(field!, value!).success, `${field}=${value}`).toBe(false);
    }
    expect(orderLineChangeSchema.safeParse({ itemId: ITEM, version: '', field: 'amount', value: '1' }).success).toBe(false);
  });

  it('pago: valida fecha, monto mayor que cero y listas', () => {
    const base = { orderId: ITEM, paidOn: '2026-11-14', concept: ' Anticipo  50% ', method: 'transfer', amount: '8.400', support: 'none' };
    expect(paymentFormSchema.parse(base)).toEqual({ ...base, concept: 'Anticipo 50%', amount: '8400' });
    const bad = (patch: Record<string, string>) => paymentFormSchema.safeParse({ ...base, ...patch }).success;
    expect(bad({ amount: '0' })).toBe(false);
    expect(bad({ amount: '' })).toBe(false);
    expect(bad({ paidOn: '' })).toBe(false);
    expect(bad({ paidOn: '14/11/2026' })).toBe(false);
    expect(bad({ method: 'bitcoin' })).toBe(false);
    expect(bad({ support: '' })).toBe(false);
    expect(bad({ orderId: '' })).toBe(false);
    expect(bad({ concept: '  ' })).toBe(false);
  });

  it('reparto del pago: ignora vacíos y ceros, admite repartir solo una parte y no más que el monto', () => {
    const values = {
      orderId: ITEM,
      amount: '8.400',
      [`reparto:${ITEM}`]: '4.200,50',
      [`reparto:${OTHER}`]: ' ',
      'reparto:33333333-3333-4333-8333-333333333333': '0',
    };
    expect(parsePaymentAllocations(values, '8400')).toEqual({
      allocations: [{ itemId: ITEM, amount: '4200.50' }],
      fieldErrors: {},
      message: null,
    });
    // Justo el monto es válido; un centavo más, no.
    const full = { [`reparto:${ITEM}`]: '8.000', [`reparto:${OTHER}`]: '400' };
    expect(parsePaymentAllocations(full, '8400').message).toBeNull();
    expect(parsePaymentAllocations({ ...full, [`reparto:${OTHER}`]: '400,01' }, '8400').message).toMatch(/suma más que el monto/);
    // Sin monto válido no se compara la suma (el error está en el monto).
    expect(parsePaymentAllocations(full, null).message).toBeNull();
  });

  it('reparto del pago: señala cada importe o ítem no válido', () => {
    const result = parsePaymentAllocations(
      { [`reparto:${ITEM}`]: 'abc', [`reparto:${OTHER}`]: '1,234', 'reparto:x': '5', 'reparto:44444444-4444-4444-8444-444444444444': '-3' },
      '100',
    );
    expect(result.allocations).toEqual([]);
    expect(Object.keys(result.fieldErrors).sort()).toEqual(
      ['reparto:44444444-4444-4444-8444-444444444444', `reparto:${ITEM}`, `reparto:${OTHER}`, 'reparto:x'].sort(),
    );
    expect(result.fieldErrors['reparto:x']).toEqual(['Ítem no válido.']);
    expect(result.message).toBeNull();
  });
});

describe('formulario de proveedor', () => {
  it('normaliza los campos', () => {
    expect(supplierFormSchema.parse({ name: '  Proveedor   Uno ', kind: 'holding', taxId: '', notes: '', active: 'on' })).toEqual({
      name: 'Proveedor Uno',
      kind: 'holding',
      taxId: null,
      notes: null,
      active: true,
    });
    expect(supplierFormSchema.parse({ name: 'X', kind: 'external' }).active).toBe(false);
  });

  it('exige nombre, un tipo válido y un RUC con formato', () => {
    expect(supplierFormSchema.safeParse({ name: ' ', kind: 'external' }).success).toBe(false);
    expect(supplierFormSchema.safeParse({ name: 'X', kind: 'otro' }).success).toBe(false);
    expect(supplierFormSchema.safeParse({ name: 'X', kind: 'external', taxId: '12' }).success).toBe(false);
    expect(supplierFormSchema.safeParse({ name: 'X', kind: 'external', taxId: '0990000000001' }).success).toBe(true);
  });
});
