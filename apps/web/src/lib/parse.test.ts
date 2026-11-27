import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate } from './format';
import { parseDecimal, parseList, textOrNull } from './parse';

describe('parseDecimal', () => {
  it.each([
    ['286.400,50', '286400.50'],
    ['286400.50', '286400.50'],
    ['286,400.50', '286400.50'],
    ['286.400', '286400'],
    ['1.234.567', '1234567'],
    ['1,234,567', '1234567'],
    ['1,5', '1.5'],
    ['$ 12 000', '12000'],
    ['007', '7'],
    ['0,25', '0.25'],
  ])('convierte %j en %j', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it('devuelve null si está vacío y undefined si no es un número', () => {
    expect(parseDecimal('  ')).toBeNull();
    expect(parseDecimal('abc')).toBeUndefined();
    expect(parseDecimal('-5')).toBeUndefined();
    expect(parseDecimal('1.2.3,4,5')).toBeUndefined();
  });
});

describe('parseList y textOrNull', () => {
  it('separa sedes, recorta y quita duplicados', () => {
    expect(parseList('Guayaquil, Quito;\n quito ,, Cuenca')).toEqual(['Guayaquil', 'Quito', 'Cuenca']);
    expect(parseList('')).toEqual([]);
  });

  it('convierte vacíos en null y normaliza espacios', () => {
    expect(textOrNull('   ')).toBeNull();
    expect(textOrNull('  Grupo   CAVE ')).toBe('Grupo CAVE');
  });
});

describe('formato', () => {
  it('formatea importes exactos sin coma flotante', () => {
    expect(formatAmount('286400.00', 'USD')).toBe('$286.400');
    expect(formatAmount('1234567.5', 'USD')).toBe('$1.234.567,50');
    expect(formatAmount('99.99', 'EUR')).toBe('EUR 99,99');
    expect(formatAmount(null, 'USD')).toBe('—');
  });

  it('no desplaza fechas operativas por la zona horaria', () => {
    expect(formatDate('2026-12-01')).toMatch(/^01/);
    expect(formatDate(null)).toBe('—');
  });
});
