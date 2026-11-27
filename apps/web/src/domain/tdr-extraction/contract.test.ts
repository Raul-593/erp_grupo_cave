/**
 * El ejemplo es el ilustrativo de AGENTS.md §8: no representa ningún TDR real.
 */
import { describe, expect, it } from 'vitest';
import { EXTRACTION_JSON_SCHEMA, fichaSchema, itemSchema, summarizeOutput, validateExtractionOutput } from './contract';

const EJEMPLO = {
  ficha: {
    contratante: 'Entidad contratante de ejemplo',
    ruc_contratante: null,
    codigo_proceso: 'PROCESO-EJEMPLO-001',
    objeto: 'Servicios logísticos para ceremonias de graduación',
    monto: 250000,
    moneda: 'USD',
    incluye_iva: false,
    sedes: ['Guayaquil', 'Quito'],
    fecha_inicio: null,
    fecha_fin: null,
    plazo: '30 días calendario desde la firma del contrato',
    administrador_contrato: null,
    observacion: 'Monto referencial sin IVA, p. 3. Fechas de ceremonias no definidas.',
  },
  items: [
    {
      item: 1,
      rubro: 'Audio, luces y video',
      producto: 'Micrófono inalámbrico',
      subproducto: 'Sonido',
      descripcion: 'Micrófono profesional de alta gama para autoridades y presentadores',
      cant: 3,
      unidad: 'Unidad',
      dias: 18,
      observacion: 'Incluido en audio de auditorio. pp. 48-49.',
    },
  ],
};

const clone = () => structuredClone(EJEMPLO) as typeof EJEMPLO & Record<string, unknown>;

describe('contrato de salida tdr-v1', () => {
  it('acepta el ejemplo de AGENTS.md y un resultado sin requerimientos', () => {
    expect(validateExtractionOutput(EJEMPLO)).toMatchObject({ ok: true });
    expect(validateExtractionOutput({ ...EJEMPLO, items: [] })).toMatchObject({ ok: true });
    expect(summarizeOutput(validateExtractionOutput(EJEMPLO).ok ? EJEMPLO : (null as never))).toEqual({ items: 1, rubros: 1 });
  });

  it.each([
    ['falta items', (o: ReturnType<typeof clone>) => delete (o as Partial<typeof o>).items],
    ['campo extra', (o: ReturnType<typeof clone>) => (o.items[0] as Record<string, unknown>)['precio'] = 10],
    ['cantidad negativa', (o: ReturnType<typeof clone>) => (o.items[0]!.cant = -1)],
    ['ítem no entero', (o: ReturnType<typeof clone>) => (o.items[0]!.item = 1.5)],
    ['rubro vacío', (o: ReturnType<typeof clone>) => (o.items[0]!.rubro = ' ')],
    ['moneda en minúsculas', (o: ReturnType<typeof clone>) => (o.ficha.moneda = 'usd')],
    ['fecha inválida', (o: ReturnType<typeof clone>) => ((o.ficha as Record<string, unknown>)['fecha_inicio'] = '01/12/2026')],
    ['fechas invertidas', (o: ReturnType<typeof clone>) => Object.assign(o.ficha, { fecha_inicio: '2026-12-10', fecha_fin: '2026-12-01' })],
    ['falta un campo obligatorio nullable', (o: ReturnType<typeof clone>) => delete (o.items[0] as Partial<(typeof o.items)[0]>).unidad],
    ['ítems repetidos', (o: ReturnType<typeof clone>) => o.items.push({ ...o.items[0]! })],
  ])('rechaza: %s', (_label, mutate) => {
    const value = clone();
    mutate(value);
    const result = validateExtractionOutput(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it('el JSON Schema declara exactamente los mismos campos obligatorios que zod', () => {
    const ficha = EXTRACTION_JSON_SCHEMA.properties.ficha;
    const item = EXTRACTION_JSON_SCHEMA.properties.items.items;
    expect([...ficha.required].sort()).toEqual(Object.keys(fichaSchema.shape).sort());
    expect(Object.keys(ficha.properties).sort()).toEqual([...ficha.required].sort());
    expect([...item.required].sort()).toEqual(Object.keys(itemSchema.shape).sort());
    expect(Object.keys(item.properties).sort()).toEqual([...item.required].sort());
  });
});
