/**
 * Orquestación en el proceso del servidor local (R-D7): crea el intento, lo encola con un
 * límite de concurrencia y lo procesa en segundo plano; la pantalla consulta el estado.
 * Antes de desplegar fuera del entorno local hay que reevaluar esta decisión (Netlify).
 */
import {
  claimExtraction,
  completeExtraction,
  createExtraction,
  failExtraction,
  failStaleExtractions,
  getDocumentFile,
  getPgErrorCode,
  importProposalItems,
  PgErrorCode,
  withTransaction,
} from '@erp/db';
import { readAiConfig, toPublicStatus, type AiConfig, type PublicAiStatus } from '@/integrations/ai/config';
import { getAdapterFactory } from '@/integrations/ai/registry';
import { SCHEMA_VERSION } from '@/domain/tdr-extraction/contract';
import { CURRENT_PROMPT } from '@/prompts/tdr-extraccion';
import { db } from './db';
import { EXTRACTION_ERROR_MESSAGES, runExtraction } from './services/tdr-extraction';
import { fileStorage } from './storage';

interface RunnerState {
  /** Intentos encolados o en curso en este proceso. */
  active: Set<string>;
  running: number;
  queue: (() => Promise<void>)[];
}

// En globalThis para sobrevivir a la recarga de módulos en desarrollo.
const store = globalThis as typeof globalThis & { __erpExtractionRunner?: RunnerState };
const state = (store.__erpExtractionRunner ??= { active: new Set(), running: 0, queue: [] });

/** Un intento activo que no está en este proceso y lleva más de esto se da por interrumpido. */
const STALE_SECONDS = 120;

export function aiStatus(): PublicAiStatus {
  return toPublicStatus(readAiConfig(process.env, getAdapterFactory));
}

/** Marca como interrumpidos los intentos que quedaron activos (p. ej. tras reiniciar). */
export async function sweepInterruptedExtractions(): Promise<void> {
  await failStaleExtractions(db(), {
    olderThanSeconds: STALE_SECONDS,
    runningIds: [...state.active],
    message: EXTRACTION_ERROR_MESSAGES.interrupted,
  });
}

function pump(maxConcurrency: number): void {
  while (state.running < maxConcurrency && state.queue.length > 0) {
    const job = state.queue.shift()!;
    state.running++;
    void job().finally(() => {
      state.running--;
      pump(maxConcurrency);
    });
  }
}

function log(event: string, data: Record<string, unknown>): void {
  // Solo metadatos: nunca el PDF, el contenido extraído ni credenciales.
  console.info(`[erp][ia] ${event}`, data);
}

function enqueue(config: AiConfig, extractionId: string, document: { storageKey: string; originalFilename: string }): void {
  state.active.add(extractionId);
  state.queue.push(async () => {
    try {
      const adapter = config.factory({ apiKey: config.apiKey });
      await runExtraction(
        {
          adapter,
          model: config.model,
          prompt: CURRENT_PROMPT,
          timeoutMs: config.timeoutMs,
          maxRetries: config.maxRetries,
          claim: (id) => claimExtraction(db(), id),
          readPdf: async () => new Uint8Array(await fileStorage().read(document.storageKey)),
          // Guarda el JSON y, en la misma transacción, lo copia a la matriz editable (etapa D, D-2).
          complete: (id, raw, meta) =>
            withTransaction(db(), async (tx) => {
              const completed = await completeExtraction(tx, id, raw, meta);
              if (completed) await importProposalItems(tx, id);
              return completed;
            }),
          fail: (id, error, meta) =>
            failExtraction(db(), id, { code: error.code, message: error.message, rawResponse: error.rawResponse ?? null }, meta),
          log,
        },
        extractionId,
        document.originalFilename,
      );
    } catch (error) {
      log('extraccion_no_iniciada', { extractionId, name: error instanceof Error ? error.name : typeof error });
      await failExtraction(db(), extractionId, { code: 'internal', message: EXTRACTION_ERROR_MESSAGES.internal }).catch(() => false);
    } finally {
      state.active.delete(extractionId);
    }
  });
  pump(config.maxConcurrency);
}

export type StartResult = { ok: true; extractionId: string } | { ok: false; message: string };

/** Crea (o recupera, por idempotencia) un intento para el documento y lo encola. */
export async function startExtraction(documentId: string, idempotencyKey: string): Promise<StartResult> {
  const result = readAiConfig(process.env, getAdapterFactory);
  if (!result.ready) return { ok: false, message: `La IA no está configurada. ${result.problems.join(' ')}` };
  const config = result.config;

  const document = await getDocumentFile(db(), documentId);
  if (!document) return { ok: false, message: 'Documento no encontrado.' };
  if (document.storageProvider !== fileStorage().provider) return { ok: false, message: 'El archivo no está disponible.' };

  await sweepInterruptedExtractions();
  let created: { id: string; documentId: string; created: boolean };
  try {
    created = await createExtraction(db(), {
      documentId: document.id,
      idempotencyKey,
      provider: config.provider,
      model: config.model,
      promptVersion: CURRENT_PROMPT.version,
      schemaVersion: SCHEMA_VERSION,
    });
  } catch (error) {
    if (getPgErrorCode(error) === PgErrorCode.uniqueViolation) {
      return { ok: false, message: 'Este documento ya tiene un procesamiento en curso.' };
    }
    throw error;
  }
  if (created.documentId !== document.id) return { ok: false, message: 'Operación no válida.' };
  if (created.created) {
    log('extraccion_creada', { extractionId: created.id, provider: config.provider, model: config.model, prompt: CURRENT_PROMPT.version });
    enqueue(config, created.id, document);
  }
  return { ok: true, extractionId: created.id };
}
