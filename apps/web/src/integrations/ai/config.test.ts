import { describe, expect, it } from 'vitest';
import { readAiConfig, toPublicStatus } from './config';
import type { AdapterFactory } from './types';

const fakeFactory: AdapterFactory = () => ({
  id: 'anthropic',
  capabilities: () => ({ pdfInput: true, structuredOutput: true, maxPdfBytes: null }),
  extract: async () => ({ output: {}, providerRequestId: null, providerResponseId: null, usage: null }),
});
const none = () => undefined;
const only = (id: string) => (provider: string) => (provider === id ? fakeFactory : undefined);

describe('configuración de IA', () => {
  it('sin nada configurado explica qué falta', () => {
    const result = readAiConfig({}, none);
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.problems.join(' ')).toContain('AI_PROVIDER');
      expect(result.problems.join(' ')).toContain('AI_MODEL');
    }
  });

  it('pide la clave del proveedor y su SDK si falta el adaptador', () => {
    const result = readAiConfig({ AI_PROVIDER: 'OpenAI', AI_MODEL: 'modelo-x' }, none);
    expect(result).toMatchObject({ ready: false, provider: 'openai', providerLabel: 'OpenAI', model: 'modelo-x' });
    if (!result.ready) {
      expect(result.problems).toContain('Falta OPENAI_API_KEY en .env.');
      expect(result.problems.join(' ')).toContain('instalar su SDK oficial (openai)');
    }
  });

  it('rechaza proveedores no previstos', () => {
    const result = readAiConfig({ AI_PROVIDER: 'otro', AI_MODEL: 'm' }, none);
    expect(!result.ready && result.problems[0]).toContain('no es un proveedor previsto');
  });

  it('queda lista con proveedor, modelo, clave y adaptador; el estado público no expone la clave', () => {
    const result = readAiConfig(
      { AI_PROVIDER: 'anthropic', AI_MODEL: ' modelo-y ', ANTHROPIC_API_KEY: 'clave-secreta', AI_TIMEOUT_MS: '60000', AI_MAX_RETRIES: '9' },
      only('anthropic'),
    );
    expect(result.ready).toBe(true);
    if (result.ready) expect(result.config).toMatchObject({ model: 'modelo-y', timeoutMs: 60000, maxRetries: 5, maxConcurrency: 2 });
    const status = toPublicStatus(result);
    expect(status).toEqual({ ready: true, providerLabel: 'Anthropic (Claude)', model: 'modelo-y', problems: [] });
    expect(JSON.stringify(status)).not.toContain('clave-secreta');
  });
});
