/**
 * Pruebas del procesamiento con un adaptador simulado: sin llamadas reales ni coste.
 * Los datos son los del ejemplo ilustrativo de AGENTS.md, no de un TDR real.
 */
import { describe, expect, it, vi } from 'vitest';
import { AiProviderError, type AiCapabilities, type AiProviderAdapter, type ExtractionRequest } from '@/integrations/ai/types';
import { CURRENT_PROMPT } from '@/prompts/tdr-extraccion';
import { backoffMs, runExtraction, type ExtractionDeps } from './tdr-extraction';

const VALID = {
  ficha: {
    contratante: 'Entidad contratante de ejemplo',
    ruc_contratante: null,
    codigo_proceso: null,
    objeto: null,
    monto: null,
    moneda: null,
    incluye_iva: null,
    sedes: [],
    fecha_inicio: null,
    fecha_fin: null,
    plazo: null,
    administrador_contrato: null,
    observacion: null,
  },
  items: [
    {
      item: 1,
      rubro: 'Audio, luces y video',
      producto: 'Micrófono inalámbrico',
      subproducto: null,
      descripcion: 'Micrófono profesional',
      cant: 3,
      unidad: 'Unidad',
      dias: null,
      observacion: null,
    },
  ],
};

const FULL: AiCapabilities = { pdfInput: true, structuredOutput: true, maxPdfBytes: null };

function setup(extract: (request: ExtractionRequest) => Promise<unknown>, overrides: Partial<ExtractionDeps> = {}) {
  const adapter: AiProviderAdapter = {
    id: 'simulado',
    capabilities: () => FULL,
    extract: vi.fn(async (request: ExtractionRequest) => {
      const output = await extract(request);
      return { output, providerRequestId: 'req-1', providerResponseId: 'resp-1', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
    }),
  };
  const deps = {
    adapter,
    model: 'modelo-simulado',
    prompt: CURRENT_PROMPT,
    timeoutMs: 5_000,
    maxRetries: 2,
    claim: vi.fn(async () => true),
    readPdf: vi.fn(async () => new TextEncoder().encode('%PDF-1.7')),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => true),
    sleep: vi.fn(async () => undefined),
    ...overrides,
  } satisfies ExtractionDeps;
  return { deps, adapter };
}

describe('procesamiento de un intento', () => {
  it('envía PDF, prompt versionado y esquema, y guarda el JSON validado con tokens', async () => {
    const { deps, adapter } = setup(async () => VALID);
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'processed', items: 1 });
    const request = vi.mocked(adapter.extract).mock.calls[0]![0];
    expect(request).toMatchObject({ model: 'modelo-simulado', pdf: { filename: 'tdr.pdf' }, schema: { version: 'tdr-v1' } });
    expect(request.prompt.version).toBe('tdr-extraccion-v1');
    expect(deps.complete).toHaveBeenCalledWith('x1', VALID, expect.objectContaining({ totalTokens: 15, providerRequestId: 'req-1' }));
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it('no hace nada si otro proceso ya tomó el intento (doble clic)', async () => {
    const { deps, adapter } = setup(async () => VALID, { claim: vi.fn(async () => false) });
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'skipped' });
    expect(adapter.extract).not.toHaveBeenCalled();
  });

  it('reintenta errores transitorios con espera y luego procesa', async () => {
    let calls = 0;
    const { deps } = setup(async () => {
      calls++;
      if (calls < 3) throw new AiProviderError('transient', 'sobrecarga', { retryAfterMs: 1000 });
      return VALID;
    });
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toMatchObject({ status: 'processed' });
    expect(deps.sleep).toHaveBeenCalledTimes(2);
  });

  it('deja de reintentar al agotar los reintentos', async () => {
    const { deps, adapter } = setup(async () => {
      throw new AiProviderError('transient', 'sobrecarga');
    });
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'failed', code: 'transient' });
    expect(adapter.extract).toHaveBeenCalledTimes(3);
  });

  it.each(['permanent', 'refusal', 'incomplete', 'context_limit'] as const)('no reintenta un error %s', async (kind) => {
    const { deps, adapter } = setup(async () => {
      throw new AiProviderError(kind, 'detalle interno del proveedor');
    });
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'failed', code: kind });
    expect(adapter.extract).toHaveBeenCalledTimes(1);
    const [, error] = vi.mocked(deps.fail).mock.calls[0]!;
    expect(error.message).not.toContain('detalle interno');
  });

  it('conserva la respuesta que no cumple el contrato para ajustar el prompt', async () => {
    const bad = { ficha: VALID.ficha, items: [{ ...VALID.items[0], cant: -2 }] };
    const { deps } = setup(async () => bad);
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'failed', code: 'schema_mismatch' });
    const [, error] = vi.mocked(deps.fail).mock.calls[0]!;
    expect(error.rawResponse).toMatchObject({ salida_recibida: bad });
    expect((error.rawResponse?.['problemas'] as string[])[0]).toContain('items.0.cant');
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('conserva el texto cuando la respuesta no es JSON', async () => {
    const { deps } = setup(async () => {
      throw new AiProviderError('invalid_output', 'no es JSON', { rawText: 'Aquí tienes la tabla: …' });
    });
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'failed', code: 'invalid_output' });
    expect(vi.mocked(deps.fail).mock.calls[0]![1].rawResponse).toEqual({ texto_no_json: 'Aquí tienes la tabla: …' });
  });

  it('marca timeout si se supera el tiempo máximo', async () => {
    const { deps } = setup(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('abortado')));
        }),
      { timeoutMs: 20 },
    );
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'failed', code: 'timeout' });
  });

  it('informa un modelo sin PDF o sin salida estructurada sin llamarlo', async () => {
    const { deps, adapter } = setup(async () => VALID);
    adapter.capabilities = () => ({ ...FULL, structuredOutput: false });
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'failed', code: 'unsupported' });
    expect(adapter.extract).not.toHaveBeenCalled();
  });

  it('informa un error de almacenamiento si no se puede leer el PDF', async () => {
    const { deps } = setup(async () => VALID, {
      readPdf: vi.fn(async () => {
        throw new Error('ENOENT');
      }),
    });
    expect(await runExtraction(deps, 'x1', 'tdr.pdf')).toEqual({ status: 'failed', code: 'storage' });
  });

  it('calcula esperas acotadas', () => {
    expect(backoffMs(0, undefined)).toBe(2000);
    expect(backoffMs(5, undefined)).toBe(30_000);
    expect(backoffMs(0, 120_000)).toBe(60_000);
  });
});
