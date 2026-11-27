/**
 * Contrato de salida de la extracción de TDR (AGENTS.md §8), independiente del proveedor.
 *
 * - `extractionOutputSchema` (zod): validación en el backend de toda respuesta.
 * - `EXTRACTION_JSON_SCHEMA`: el mismo contrato en JSON Schema para la salida estructurada de
 *   cada proveedor. Solo usa palabras clave ampliamente soportadas (type, properties, required,
 *   additionalProperties, items, description); las reglas finas las aplica zod.
 *
 * Cualquier cambio de campos exige subir SCHEMA_VERSION.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 'tdr-v1';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z
  .string()
  .regex(ISO_DATE, 'Fecha con formato AAAA-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Fecha inexistente');
const nonBlank = z.string().refine((value) => value.trim() !== '', 'No puede estar vacío');
const nonNegative = z.number().finite().min(0);

export const fichaSchema = z
  .object({
    contratante: z.string().nullable(),
    ruc_contratante: z.string().nullable(),
    codigo_proceso: z.string().nullable(),
    objeto: z.string().nullable(),
    monto: nonNegative.nullable(),
    moneda: z.string().regex(/^[A-Z]{3}$/, 'Código ISO 4217 de tres letras').nullable(),
    incluye_iva: z.boolean().nullable(),
    sedes: z.array(nonBlank),
    fecha_inicio: isoDate.nullable(),
    fecha_fin: isoDate.nullable(),
    plazo: z.string().nullable(),
    administrador_contrato: z.string().nullable(),
    observacion: z.string().nullable(),
  })
  .strict()
  .refine((f) => f.fecha_inicio === null || f.fecha_fin === null || f.fecha_fin >= f.fecha_inicio, {
    message: 'fecha_fin es anterior a fecha_inicio',
    path: ['fecha_fin'],
  });

export const itemSchema = z
  .object({
    item: z.number().int().min(1),
    rubro: nonBlank,
    producto: nonBlank,
    subproducto: nonBlank.nullable(),
    descripcion: z.string(),
    cant: nonNegative.nullable(),
    unidad: z.string().nullable(),
    dias: nonNegative.nullable(),
    observacion: z.string().nullable(),
  })
  .strict();

/** Límite defensivo de filas por documento. */
export const MAX_ITEMS = 2000;

export const extractionOutputSchema = z
  .object({
    ficha: fichaSchema,
    items: z.array(itemSchema).max(MAX_ITEMS),
  })
  .strict()
  .superRefine((output, ctx) => {
    const seen = new Set<number>();
    output.items.forEach((row, index) => {
      if (seen.has(row.item)) {
        ctx.addIssue({ code: 'custom', message: `Número de ítem repetido: ${row.item}`, path: ['items', index, 'item'] });
      }
      seen.add(row.item);
    });
  });

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
export type ExtractionFicha = z.infer<typeof fichaSchema>;
export type ExtractionItem = z.infer<typeof itemSchema>;

export type ValidationResult =
  | { ok: true; output: ExtractionOutput }
  | { ok: false; issues: string[] };

/** Valida una respuesta ya convertida de JSON. Devuelve hasta 20 problemas legibles. */
export function validateExtractionOutput(value: unknown): ValidationResult {
  const result = extractionOutputSchema.safeParse(value);
  if (result.success) return { ok: true, output: result.data };
  return {
    ok: false,
    issues: result.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`),
  };
}

/** Resumen para mostrar: número de ítems y de rubros distintos. */
export function summarizeOutput(output: ExtractionOutput): { items: number; rubros: number } {
  return { items: output.items.length, rubros: new Set(output.items.map((row) => row.rubro.trim().toLowerCase())).size };
}

// ---------------------------------------------------------------------------------------
// JSON Schema equivalente (salida estructurada de los proveedores).

const nullable = (type: 'string' | 'number' | 'boolean', description: string) => ({
  type: [type, 'null'],
  description,
});

export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ficha', 'items'],
  properties: {
    ficha: {
      type: 'object',
      additionalProperties: false,
      description: 'Datos generales del proceso de contratación, transcritos del documento.',
      required: [
        'contratante',
        'ruc_contratante',
        'codigo_proceso',
        'objeto',
        'monto',
        'moneda',
        'incluye_iva',
        'sedes',
        'fecha_inicio',
        'fecha_fin',
        'plazo',
        'administrador_contrato',
        'observacion',
      ],
      properties: {
        contratante: nullable('string', 'Entidad que contrata, tal como aparece en el documento.'),
        ruc_contratante: nullable('string', 'RUC del contratante si el documento lo indica.'),
        codigo_proceso: nullable('string', 'Código del proceso de contratación.'),
        objeto: nullable('string', 'Objeto de la contratación.'),
        monto: nullable('number', 'Monto del contrato o presupuesto referencial indicado en el documento; nunca estimado.'),
        moneda: nullable('string', 'Código ISO 4217 de la moneda del monto, por ejemplo USD.'),
        incluye_iva: nullable('boolean', 'true o false solo si el documento indica si el monto incluye IVA.'),
        sedes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ciudades o lugares de ejecución; vacío si no se indican.',
        },
        fecha_inicio: nullable('string', 'Fecha de inicio explícita en formato AAAA-MM-DD; no calculada.'),
        fecha_fin: nullable('string', 'Fecha de fin explícita en formato AAAA-MM-DD; no calculada.'),
        plazo: nullable('string', 'Plazo tal como lo expresa el documento.'),
        administrador_contrato: nullable('string', 'Nombre o cargo del administrador del contrato.'),
        observacion: nullable('string', 'Incertidumbres, contradicciones y páginas de origen de estos datos.'),
      },
    },
    items: {
      type: 'array',
      description: 'Matriz de entregables: bienes, servicios y personal que el contratista debe proporcionar.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['item', 'rubro', 'producto', 'subproducto', 'descripcion', 'cant', 'unidad', 'dias', 'observacion'],
        properties: {
          item: { type: 'integer', description: 'Número secuencial de la fila, desde 1, en el orden del documento.' },
          rubro: { type: 'string', description: 'Gran grupo del requerimiento.' },
          producto: { type: 'string', description: 'Bien, servicio o personal entregable.' },
          subproducto: nullable('string', 'Componente o tipo específico dentro del producto; null si no existe.'),
          descripcion: { type: 'string', description: 'Especificaciones técnicas y características solicitadas.' },
          cant: nullable('number', 'Cantidad del recurso, sin multiplicar por días.'),
          unidad: nullable('string', 'Unidad de medida: unidad, persona, sistema, servicio, metro, etc.'),
          dias: nullable('number', 'Duración en días aplicable a ese recurso.'),
          observacion: nullable(
            'string',
            'Condiciones, alcance, inclusión en servicios, distribución, incertidumbres y páginas de origen.',
          ),
        },
      },
    },
  },
} as const;
