/**
 * Configuración de IA desde .env (solo servidor). Nunca devuelve la clave a la interfaz:
 * `publicAiStatus` expone únicamente si está lista y qué falta.
 */
import type { AdapterFactory } from './types';

export interface ProviderInfo {
  label: string;
  /** Variable de entorno con la clave del proveedor. */
  keyEnv: string;
  /** SDK oficial que hay que instalar para su adaptador. */
  sdk: string;
}

/** Proveedores previstos en AGENTS.md §8. Añadir uno nuevo requiere aprobación. */
export const KNOWN_PROVIDERS: Readonly<Record<string, ProviderInfo>> = {
  anthropic: { label: 'Anthropic (Claude)', keyEnv: 'ANTHROPIC_API_KEY', sdk: '@anthropic-ai/sdk' },
  openai: { label: 'OpenAI', keyEnv: 'OPENAI_API_KEY', sdk: 'openai' },
  google: { label: 'Google (Gemini)', keyEnv: 'GOOGLE_API_KEY', sdk: '@google/genai' },
};

export const AI_DEFAULTS = {
  timeoutMs: 10 * 60 * 1000,
  maxRetries: 2,
  maxConcurrency: 2,
} as const;

export interface AiConfig {
  provider: string;
  providerLabel: string;
  model: string;
  apiKey: string;
  factory: AdapterFactory;
  timeoutMs: number;
  maxRetries: number;
  maxConcurrency: number;
}

export type AiConfigResult =
  | { ready: true; config: AiConfig }
  | { ready: false; provider: string | null; providerLabel: string | null; model: string | null; problems: string[] };

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

export function readAiConfig(
  env: Record<string, string | undefined>,
  getFactory: (provider: string) => AdapterFactory | undefined,
): AiConfigResult {
  const provider = env['AI_PROVIDER']?.trim().toLowerCase() || null;
  const model = env['AI_MODEL']?.trim() || null;
  const info = provider ? KNOWN_PROVIDERS[provider] : undefined;
  const problems: string[] = [];

  if (!provider) {
    problems.push(`Falta AI_PROVIDER en .env (${Object.keys(KNOWN_PROVIDERS).join(', ')}).`);
  } else if (!info) {
    problems.push(`AI_PROVIDER «${provider}» no es un proveedor previsto (${Object.keys(KNOWN_PROVIDERS).join(', ')}).`);
  }
  if (!model) problems.push('Falta AI_MODEL en .env (identificador exacto del modelo del proveedor).');
  else if (model.length > 200) problems.push('AI_MODEL es demasiado largo.');

  const apiKey = info ? env[info.keyEnv]?.trim() : undefined;
  if (info && !apiKey) problems.push(`Falta ${info.keyEnv} en .env.`);

  const factory = provider ? getFactory(provider) : undefined;
  if (info && !factory) {
    problems.push(`Falta el adaptador de ${info.label}: hay que instalar su SDK oficial (${info.sdk}) y registrarlo.`);
  }

  if (problems.length > 0 || !provider || !info || !model || !apiKey || !factory) {
    return { ready: false, provider, providerLabel: info?.label ?? null, model, problems };
  }
  return {
    ready: true,
    config: {
      provider,
      providerLabel: info.label,
      model,
      apiKey,
      factory,
      timeoutMs: positiveInt(env['AI_TIMEOUT_MS'], AI_DEFAULTS.timeoutMs, 60 * 60 * 1000),
      maxRetries: nonNegativeInt(env['AI_MAX_RETRIES'], AI_DEFAULTS.maxRetries, 5),
      maxConcurrency: positiveInt(env['AI_MAX_CONCURRENCY'], AI_DEFAULTS.maxConcurrency, 10),
    },
  };
}

/** Estado apto para mostrar en pantalla: sin la clave. */
export interface PublicAiStatus {
  ready: boolean;
  providerLabel: string | null;
  model: string | null;
  problems: string[];
}

export function toPublicStatus(result: AiConfigResult): PublicAiStatus {
  return result.ready
    ? { ready: true, providerLabel: result.config.providerLabel, model: result.config.model, problems: [] }
    : { ready: false, providerLabel: result.providerLabel, model: result.model, problems: result.problems };
}
