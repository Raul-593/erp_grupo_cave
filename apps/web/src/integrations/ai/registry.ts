/**
 * Registro de adaptadores de IA.
 *
 * Está vacío a propósito: el usuario aún no eligió proveedor y no se instaló ningún SDK
 * (decisión del 2026-11-26). Para habilitar un proveedor:
 *   1. Aprobar e instalar su SDK oficial en apps/web (ver MEMORY.md y PLAN.md).
 *   2. Crear su adaptador en esta carpeta (p. ej. anthropic.ts) que implemente
 *      AiProviderAdapter: enviar el PDF como documento, el prompt y EXTRACTION_JSON_SCHEMA
 *      como salida estructurada; clasificar errores con AiProviderError.
 *   3. Registrarlo abajo con el mismo id que AI_PROVIDER.
 */
import type { AdapterFactory } from './types';

const FACTORIES: Readonly<Record<string, AdapterFactory>> = {
  // anthropic: createAnthropicAdapter,   // requiere @anthropic-ai/sdk
  // openai: createOpenAiAdapter,         // requiere openai
  // google: createGoogleAdapter,         // requiere @google/genai
};

export function getAdapterFactory(provider: string): AdapterFactory | undefined {
  return Object.hasOwn(FACTORIES, provider) ? FACTORIES[provider] : undefined;
}
