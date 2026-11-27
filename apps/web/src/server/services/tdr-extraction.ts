/**
 * Procesamiento de un intento de extracción, independiente del proveedor y de la base:
 * todo lo externo llega por `ExtractionDeps`, lo que permite probarlo con un adaptador
 * simulado y sin coste.
 */
import { EXTRACTION_JSON_SCHEMA, SCHEMA_VERSION, validateExtractionOutput } from '@/domain/tdr-extraction/contract';
import { AiProviderError, type AiErrorKind, type AiProviderAdapter, type ExtractionResponse } from '@/integrations/ai/types';
import type { ExtractionPrompt } from '@/prompts/tdr-extraccion';

export type ExtractionErrorCode = AiErrorKind | 'storage' | 'schema_mismatch' | 'interrupted' | 'internal';

/** Mensajes seguros para el usuario: sin detalles internos del proveedor. */
export const EXTRACTION_ERROR_MESSAGES: Record<ExtractionErrorCode, string> = {
  transient: 'El proveedor de IA no respondió correctamente después de varios intentos. Inténtalo más tarde.',
  permanent: 'El proveedor de IA rechazó la solicitud. Revisa la clave y el modelo configurados en .env.',
  refusal: 'El modelo se negó a procesar el documento.',
  incomplete: 'La respuesta del modelo quedó incompleta (posible límite de salida del modelo).',
  context_limit: 'El documento es demasiado grande para el modelo configurado.',
  invalid_output: 'La respuesta del modelo no es un JSON válido. Se guardó para revisar el prompt.',
  timeout: 'Se agotó el tiempo máximo de procesamiento.',
  unsupported: 'El modelo configurado no admite PDF o salida estructurada.',
  storage: 'No se pudo leer el archivo del TDR.',
  schema_mismatch: 'La respuesta no cumple el formato de la ficha y la matriz. Se guardó para revisar el prompt.',
  interrupted: 'El procesamiento se interrumpió (por ejemplo, al reiniciar el servidor). Vuelve a procesar.',
  internal: 'Error interno al procesar el documento.',
};

/** Límite de texto inválido que se conserva para diagnóstico. */
const MAX_RAW_TEXT = 200_000;

export interface ExtractionDeps {
  adapter: AiProviderAdapter;
  model: string;
  prompt: ExtractionPrompt;
  timeoutMs: number;
  maxRetries: number;
  claim(id: string): Promise<boolean>;
  readPdf(): Promise<Uint8Array>;
  complete(id: string, raw: Record<string, unknown>, meta: ExtractionMeta): Promise<boolean>;
  fail(id: string, error: { code: ExtractionErrorCode; message: string; rawResponse?: Record<string, unknown> }, meta: ExtractionMeta): Promise<boolean>;
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
  now?(): number;
  log?(event: string, data: Record<string, unknown>): void;
}

export interface ExtractionMeta {
  providerRequestId?: string | null;
  providerResponseId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  durationMs?: number | null;
}

export type ExtractionOutcome = { status: 'processed'; items: number } | { status: 'failed'; code: ExtractionErrorCode } | { status: 'skipped' };

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Espera antes del reintento n (0, 1, …): la sugerida por el proveedor o exponencial. */
export function backoffMs(attempt: number, retryAfterMs: number | undefined): number {
  if (retryAfterMs !== undefined && retryAfterMs >= 0) return Math.min(retryAfterMs, 60_000);
  return Math.min(2_000 * 2 ** attempt, 30_000);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Ejecuta un intento: lo toma (`pending` → `processing`), llama al adaptador con tiempo
 * máximo total y reintentos acotados solo para errores transitorios, valida la respuesta
 * contra el contrato y la guarda como `processed`, o registra `failed` con un mensaje seguro.
 */
export async function runExtraction(deps: ExtractionDeps, extractionId: string, filename: string): Promise<ExtractionOutcome> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const log = deps.log ?? (() => undefined);
  if (!(await deps.claim(extractionId))) return { status: 'skipped' };

  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  const meta: ExtractionMeta = {};
  const elapsed = () => now() - started;

  const fail = async (
    code: ExtractionErrorCode,
    rawResponse?: Record<string, unknown>,
  ): Promise<ExtractionOutcome> => {
    await deps.fail(extractionId, { code, message: EXTRACTION_ERROR_MESSAGES[code], ...(rawResponse ? { rawResponse } : {}) }, {
      ...meta,
      durationMs: elapsed(),
    });
    log('extraccion_fallida', { extractionId, code, durationMs: elapsed() });
    return { status: 'failed', code };
  };

  try {
    const capabilities = deps.adapter.capabilities(deps.model);
    if (!capabilities.pdfInput || !capabilities.structuredOutput) return await fail('unsupported');

    let pdf: Uint8Array;
    try {
      pdf = await deps.readPdf();
    } catch {
      return await fail('storage');
    }
    if (capabilities.maxPdfBytes !== null && pdf.length > capabilities.maxPdfBytes) return await fail('context_limit');

    let response: ExtractionResponse | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await deps.adapter.extract({
          model: deps.model,
          pdf: { bytes: pdf, filename },
          prompt: deps.prompt,
          schema: { name: 'tdr_extraccion', version: SCHEMA_VERSION, jsonSchema: EXTRACTION_JSON_SCHEMA },
          signal: controller.signal,
        });
        break;
      } catch (error) {
        if (controller.signal.aborted) return await fail('timeout');
        if (!(error instanceof AiProviderError)) {
          log('extraccion_error_inesperado', { extractionId, name: error instanceof Error ? error.name : typeof error });
          return await fail('internal');
        }
        if (error.providerRequestId) meta.providerRequestId = error.providerRequestId;
        if (error.kind === 'transient' && attempt < deps.maxRetries) {
          log('extraccion_reintento', { extractionId, attempt: attempt + 1 });
          await sleep(backoffMs(attempt, error.retryAfterMs), controller.signal);
          if (controller.signal.aborted) return await fail('timeout');
          continue;
        }
        if (error.kind === 'invalid_output' && error.rawText !== undefined) {
          return await fail('invalid_output', { texto_no_json: error.rawText.slice(0, MAX_RAW_TEXT) });
        }
        return await fail(error.kind);
      }
    }

    meta.providerRequestId = response.providerRequestId ?? meta.providerRequestId ?? null;
    meta.providerResponseId = response.providerResponseId;
    meta.inputTokens = response.usage?.inputTokens ?? null;
    meta.outputTokens = response.usage?.outputTokens ?? null;
    meta.totalTokens = response.usage?.totalTokens ?? null;

    const validation = validateExtractionOutput(response.output);
    if (!validation.ok || !isRecord(response.output)) {
      return await fail('schema_mismatch', {
        salida_recibida: response.output as unknown,
        problemas: validation.ok ? ['La respuesta no es un objeto JSON.'] : validation.issues,
      });
    }

    // Se guarda el JSON tal como lo devolvió el modelo (ya validado): es el original inmutable.
    await deps.complete(extractionId, response.output, { ...meta, durationMs: elapsed() });
    log('extraccion_procesada', { extractionId, items: validation.output.items.length, durationMs: elapsed(), totalTokens: meta.totalTokens });
    return { status: 'processed', items: validation.output.items.length };
  } catch (error) {
    log('extraccion_error_interno', { extractionId, name: error instanceof Error ? error.name : typeof error });
    return fail('internal').catch(() => ({ status: 'failed', code: 'internal' }) as const);
  } finally {
    clearTimeout(timer);
  }
}
