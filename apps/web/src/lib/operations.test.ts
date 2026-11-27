import { describe, expect, it } from 'vitest';
import { formatDayMonth, formatQuantity } from './format';
import { ganttBar, ganttRange, ganttTicks } from './gantt';
import { compareAmounts, percentOf, sumAmounts } from './money';
import { compactCodes } from './numbering';

describe('importes exactos', () => {
  it('suma en centavos sin coma flotante e ignora nulos', () => {
    expect(sumAmounts(['0.10', '0.20', null, '100'])).toBe('100.30');
    expect(sumAmounts(['8400.00', '5860.00', '3900.00', '380.00'])).toBe('18540.00');
    expect(sumAmounts(['10.5', '-0.55'])).toBe('9.95');
    expect(sumAmounts([])).toBe('0.00');
  });

  it('compara importes y calcula porcentajes para mostrar', () => {
    expect(compareAmounts('2160.00', '2340')).toBeLessThan(0);
    expect(compareAmounts('10.50', '10.5')).toBe(0);
    expect(compareAmounts('10.51', '10.5')).toBeGreaterThan(0);
    expect(percentOf('19220.00', '47572.00')).toBe(40.4);
    expect(percentOf('1', '0')).toBeNull();
  });

  it('rechaza textos que no son importes', () => {
    expect(() => sumAmounts(['1.234'])).toThrow();
    expect(() => sumAmounts(['abc'])).toThrow();
  });
});

describe('formato de cantidades y fechas cortas', () => {
  it('quita ceros sobrantes y agrupa miles', () => {
    expect(formatQuantity('1200.0000')).toBe('1.200');
    expect(formatQuantity('1.5000')).toBe('1,5');
    expect(formatQuantity('3.00')).toBe('3');
    expect(formatQuantity(null)).toBe('—');
  });

  it('muestra día y mes sin el año', () => {
    expect(formatDayMonth('2026-11-14')).toMatch(/^14 nov\.?$/);
    expect(formatDayMonth(null)).toBe('—');
  });
});

describe('códigos de ítems agrupados', () => {
  it('agrupa consecutivos del mismo rubro', () => {
    expect(compactCodes(['2.1', '2.2', '2.3'])).toBe('2.1 – 2.3');
    expect(compactCodes(['1.1'])).toBe('1.1');
    expect(compactCodes(['1.1', '1.3', '2.1', '2.2'])).toBe('1.1, 1.3, 2.1 – 2.2');
    expect(compactCodes([])).toBe('');
  });
});

describe('geometría del cronograma', () => {
  const activities = [
    { startDate: '2026-11-12', endDate: '2026-11-14' },
    { startDate: '2026-11-19', endDate: '2026-11-19' },
  ];

  it('cubre las actividades y las fechas del proyecto', () => {
    expect(ganttRange(activities)).toEqual({ start: '2026-11-12', end: '2026-11-19', days: 8 });
    expect(ganttRange(activities, { startDate: '2026-11-10', endDate: '2026-11-23' })).toEqual({
      start: '2026-11-10',
      end: '2026-11-23',
      days: 14,
    });
    expect(ganttRange([])).toBeNull();
  });

  it('ubica cada barra en porcentaje del rango, con extremos inclusive', () => {
    const range = ganttRange(activities, { startDate: '2026-11-10', endDate: '2026-11-23' })!;
    const first = ganttBar(range, activities[0]!);
    expect(first.left).toBeCloseTo((2 / 14) * 100);
    expect(first.width).toBeCloseTo((3 / 14) * 100);
    const last = ganttBar(range, { startDate: '2026-11-23', endDate: '2026-11-23' });
    expect(last.left + last.width).toBeCloseTo(100);
  });

  it('reparte pocas marcas en el eje y cruza de mes sin desplazar días', () => {
    const range = ganttRange([{ startDate: '2026-11-28', endDate: '2026-12-03' }])!;
    expect(range.days).toBe(6);
    expect(ganttTicks(range, 3).map((tick) => tick.date)).toEqual(['2026-11-28', '2026-11-30', '2026-12-02']);
    expect(ganttTicks(ganttRange(activities, { startDate: '2026-11-10', endDate: '2026-11-23' })!).map((tick) => tick.date)).toEqual([
      '2026-11-10',
      '2026-11-13',
      '2026-11-16',
      '2026-11-19',
      '2026-11-22',
    ]);
  });
});
