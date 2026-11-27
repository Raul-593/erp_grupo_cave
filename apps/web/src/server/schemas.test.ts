import { describe, expect, it } from 'vitest';
import { projectValueToForm } from '@/lib/project-value';
import { fichaFormSchema, fieldErrors, NEW_CLIENT, projectFormSchema, projectValueSchema, workerFormSchema } from './schemas';

const CLIENT_ID = '8b2f0c1e-5d4a-4c3b-9a1e-2f6d7c8b9a01';

describe('formulario de proyecto', () => {
  it('acepta un proyecto con contratante existente y normaliza los campos', () => {
    const result = projectFormSchema.safeParse({
      name: '  Proyecto   sintético ',
      clientId: CLIENT_ID,
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      venues: 'Quito, Cuenca',
      notes: '',
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ name: 'Proyecto sintético', venues: ['Quito', 'Cuenca'], notes: null });
  });

  it('exige nombre, contratante válido y fechas en orden', () => {
    const result = projectFormSchema.safeParse({
      name: ' ',
      clientId: 'x',
      startDate: '2026-12-03',
      endDate: '2026-12-01',
    });
    expect(result.success).toBe(false);
    const errors = fieldErrors(result.error!);
    expect(errors['name']).toBeDefined();
    expect(errors['clientId']).toBeDefined();
  });

  it('rechaza fecha de fin anterior a la de inicio', () => {
    const result = projectFormSchema.safeParse({ name: 'P', clientId: CLIENT_ID, startDate: '2026-12-03', endDate: '2026-12-01' });
    expect(fieldErrors(result.error!)['endDate']).toEqual(['La fecha de fin no puede ser anterior a la de inicio.']);
  });

  it('pide el nombre de un contratante nuevo y valida el RUC', () => {
    const result = projectFormSchema.safeParse({ name: 'P', clientId: NEW_CLIENT, newClientName: '', newClientTaxId: 'RUC con espacios' });
    const errors = fieldErrors(result.error!);
    expect(errors['newClientName']).toBeDefined();
    expect(errors['newClientTaxId']).toBeDefined();
  });
});

describe('ficha del proyecto', () => {
  const base = { clientId: CLIENT_ID, version: '1' };

  it('convierte monto, moneda, IVA y sedes', () => {
    const result = fichaFormSchema.safeParse({
      ...base,
      contractAmount: '286.400,50',
      currency: 'usd',
      amountIncludesVat: 'no',
      venues: 'Guayaquil; Quito',
      processCode: 'PROCESO-001',
    });
    expect(result.data).toMatchObject({
      contractAmount: '286400.50',
      currency: 'USD',
      amountIncludesVat: false,
      venues: ['Guayaquil', 'Quito'],
      version: 1,
    });
  });

  it('rechaza montos no numéricos, con más de dos decimales o sin moneda', () => {
    expect(fieldErrors(fichaFormSchema.safeParse({ ...base, contractAmount: 'mil', currency: 'USD' }).error!)['contractAmount']).toBeDefined();
    // "10.555" son miles en es-EC (10555), no tres decimales.
    expect(fichaFormSchema.safeParse({ ...base, contractAmount: '10.555', currency: 'USD' }).data?.contractAmount).toBe('10555');
    expect(fieldErrors(fichaFormSchema.safeParse({ ...base, contractAmount: '10,555', currency: 'USD' }).error!)['contractAmount']).toBeDefined();
    expect(fieldErrors(fichaFormSchema.safeParse({ ...base, contractAmount: '10', currency: '' }).error!)['currency']).toBeDefined();
  });

  it('acepta una ficha vacía', () => {
    const result = fichaFormSchema.safeParse(base);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ contractAmount: null, currency: null, amountIncludesVat: null, venues: [] });
  });
});

describe('trabajador', () => {
  it('exige nombre y valida el correo', () => {
    const result = workerFormSchema.safeParse({ fullName: '', email: 'no-es-correo' });
    const errors = fieldErrors(result.error!);
    expect(errors['fullName']).toBeDefined();
    expect(errors['email']).toBeDefined();
  });

  it('interpreta la casilla de activo', () => {
    expect(workerFormSchema.parse({ fullName: 'Persona sintética', active: 'on' }).active).toBe(true);
    expect(workerFormSchema.parse({ fullName: 'Persona sintética' }).active).toBe(false);
  });
});

describe('valor del proyecto', () => {
  it('se valida igual en el formulario propio y en el alta del proyecto', () => {
    const value = { contractAmount: '286.400,50', currency: 'usd', amountIncludesVat: 'si' };
    expect(projectValueSchema.parse({ ...value, version: '3' })).toEqual({
      contractAmount: '286400.50',
      currency: 'USD',
      amountIncludesVat: true,
      version: 3,
    });
    expect(projectFormSchema.parse({ name: 'P', clientId: CLIENT_ID, ...value })).toMatchObject({
      contractAmount: '286400.50',
      currency: 'USD',
      amountIncludesVat: true,
    });
  });

  it('es opcional y exige moneda solo si hay valor', () => {
    expect(projectValueSchema.parse({ version: '1' })).toMatchObject({ contractAmount: null, amountIncludesVat: null });
    expect(fieldErrors(projectValueSchema.safeParse({ version: '1', contractAmount: '10', currency: '' }).error!)['currency']).toEqual([
      'Indica la moneda del valor.',
    ]);
    expect(fieldErrors(projectFormSchema.safeParse({ name: 'P', clientId: CLIENT_ID, contractAmount: 'abc' }).error!)['contractAmount']).toBeDefined();
  });

  it('convierte el valor guardado al formato del formulario', () => {
    expect(projectValueToForm({ contractAmount: '286400.50', currency: 'USD', amountIncludesVat: false })).toEqual({
      contractAmount: '286400,50',
      currency: 'USD',
      amountIncludesVat: 'no',
    });
    expect(projectValueToForm(null)).toEqual({ contractAmount: '', currency: 'USD', amountIncludesVat: '' });
  });
});
