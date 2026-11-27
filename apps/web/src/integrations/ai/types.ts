/**
 * Interfaz común de proveedores de IA (AGENTS.md §8). El dominio, la validación y la
 * persistencia solo conocen estos tipos; cada compañía se integra con un adaptador propio
 * que usa su SDK oficial y traduce esta interfaz a su API.
 */
import type { ExtractionPrompt } from '@/prompts/tdr-extraccion';

/** Clasificación de errores; determina si se reintenta y qué mensaje ve el usuario. */
export type AiErrorKind =
  /** Red, sobrecarga, límite de peticiones o error 5xx: se reintenta con espera. */
  | 'transient'
  /** Credenciales, modelo inexistente, petición inválida: no se reintenta. */
  | 'permanent'
  /** El modelo se negó a responder. */
  | 'refusal'
  /** La respuesta se cortó (límite de salida u otra causa). */
  | 'incomplete'
  /** El documento no cabe en el contexto del modelo o supera el tamaño de archivo. */
  | 'context_limit'
  /** La respuesta no es JSON. */
  | 'invalid_output'
  /** Se agotó el tiempo máximo. */
  | 'timeout'
  /** El modelo o el adaptador no admiten lo necesario (PDF, salida estructurada). */
  | 'unsupported';

export class AiProviderError extends Error {
  override name = 'AiProviderError';
  readonly kind: AiErrorKind;
  /** Espera sugerida por el proveedor antes de reintentar. */
  readonly retryAfterMs: number | undefined;
  readonly providerRequestId: string | undefined;
  /** Texto devuelto por el modelo cuando no se pudo interpretar (para ajustar el prompt). */
  readonly rawText: string | undefined;

  constructor(
    kind: AiErrorKind,
    message: string,
    options: { retryAfterMs?: number; providerRequestId?: string; rawText?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.kind = kind;
    this.retryAfterMs = options.retryAfterMs;
    this.providerRequestId = options.providerRequestId;
    this.rawText = options.rawText;
  }
}

/** Capacidades declaradas por el adaptador para un modelo. */
export interface AiCapabilities {
  /** Acepta el PDF como documento (texto e imágenes de páginas). */
  pdfInput: boolean;
  /** Admite salida estructurada con JSON Schema. */
  structuredOutput: boolean;
  /** Tamaño máximo de PDF que acepta, si se conoce. */
  maxPdfBytes: number | null;
}

export interface ExtractionRequest {
  model: string;
  pdf: { bytes: Uint8Array; filename: string };
  prompt: ExtractionPrompt;
  schema: { name: string; version: string; jsonSchema: Record<string, unknown> };
  /** Se aborta al superar el tiempo máximo. */
  signal: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

/** Resultado normalizado: el JSON ya convertido (sin validar) y metadatos del proveedor. */
export interface ExtractionResponse {
  output: unknown;
  providerRequestId: string | null;
  providerResponseId: string | null;
  usage: TokenUsage | null;
}

export interface AiProviderAdapter {
  /** Identificador en minúsculas, igual a AI_PROVIDER y a tdr_extractions.provider. */
  readonly id: string;
  capabilities(model: string): AiCapabilities;
  extract(request: ExtractionRequest): Promise<ExtractionResponse>;
}

/** Crea el adaptador con la clave leída de .env (solo en el servidor). */
export type AdapterFactory = (options: { apiKey: string }) => AiProviderAdapter;
