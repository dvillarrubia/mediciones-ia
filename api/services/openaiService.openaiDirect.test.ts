/**
 * Tests de la integración directa con OpenAI (Responses API + web_search).
 *
 * Cubren los fallos que ya tuvo esta ruta:
 * - Tener key de OpenAI forzaba OpenAI directo ignorando el modelo elegido.
 * - La generación usaba `web_search_options` de chat/completions, que solo
 *   existía para los *-search-preview deprecados (404).
 * - La fase 2 iba siempre por OpenRouter aunque la fase 1 fuera por OpenAI.
 *
 * El cliente se sustituye por un doble: no se llama a la API real.
 */
import { describe, it, expect, vi } from 'vitest';
import OpenAIService from './openaiService.js';

const responsesFixture = {
  output_text: 'Las mejores aseguradoras son Mapfre y Occident según https://ejemplo.com.',
  output: [
    { type: 'web_search_call', id: 'ws_1', status: 'completed' },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: 'Las mejores aseguradoras son Mapfre y Occident.',
          annotations: [
            { type: 'url_citation', url: 'https://ejemplo.com/ranking', title: 'Ranking', start_index: 0, end_index: 10 },
            { type: 'url_citation', url: 'https://ejemplo.com/ranking', title: 'Ranking', start_index: 11, end_index: 20 },
            { type: 'url_citation', url: 'https://otro.es/a', title: 'Otro', start_index: 21, end_index: 30 },
          ],
        },
      ],
    },
  ],
};

const withFakeOpenAI = (service: any) => {
  const create = vi.fn().mockResolvedValue(responsesFixture);
  service.openaiClient = { responses: { create } };
  return create;
};

describe('OpenAI directo', () => {
  it('genera con la Responses API y la herramienta web_search, y extrae las citas sin duplicados', async () => {
    const service: any = new OpenAIService({ openai: 'sk-test' });
    const create = withFakeOpenAI(service);

    const result = await service.generateWithOpenAI('¿Mejor aseguradora?', 'gpt-5-mini', { countryCode: 'es' });

    const body = create.mock.calls[0][0];
    expect(body.model).toBe('gpt-5-mini');
    expect(body.tools).toEqual([{ type: 'web_search', user_location: { type: 'approximate', country: 'ES' } }]);
    // web_search no admite razonamiento 'minimal' en OpenAI
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body).not.toHaveProperty('web_search_options');

    expect(result.content).toBe(responsesFixture.output_text);
    expect(result.webSources.map((s: any) => s.url)).toEqual(['https://ejemplo.com/ranking', 'https://otro.es/a']);
  });

  it('no envía reasoning a modelos sin razonamiento', async () => {
    const service: any = new OpenAIService({ openai: 'sk-test' });
    const create = withFakeOpenAI(service);
    await service.generateWithOpenAI('q', 'gpt-4.1-mini', {});
    expect(create.mock.calls[0][0]).not.toHaveProperty('reasoning');
  });

  it('el proveedor lo decide el modelo seleccionado, no la presencia de la key', () => {
    const service: any = new OpenAIService({ openai: 'sk-test', openrouter: 'sk-or-test' });

    const openrouterCfg = service.getPersonaProviderConfig({ selectedModel: 'openai/gpt-5-mini:online' });
    expect(openrouterCfg.provider).toBe('openrouter');
    expect(openrouterCfg.generationModel).toBe('openai/gpt-5-mini:online');

    const directCfg = service.getPersonaProviderConfig({ selectedModel: 'gpt-5-mini' });
    expect(directCfg.provider).toBe('openai');
    expect(directCfg.generationModel).toBe('gpt-5-mini');
    expect(directCfg.analysisModel).toBe('gpt-4o-mini');
  });

  it('la fase 2 va por el mismo proveedor que la fase 1', () => {
    const service: any = new OpenAIService({ openai: 'sk-test', openrouter: 'sk-or-test' });
    expect(service.getAnalysisClientAndModel('gpt-5-mini').queue).toBe('openai');
    expect(service.getAnalysisClientAndModel('openai/gpt-5-mini:online').queue).toBe('openrouter');
  });

  it('con solo key de OpenAI funciona sin OpenRouter', () => {
    const service: any = new OpenAIService({ openai: 'sk-test' });
    expect(service.getPersonaProviderConfig({}).provider).toBe('openai');
    expect(service.getAnalysisClientAndModel().queue).toBe('openai');
    expect(service.validateApiKeyForModel('chatgpt').valid).toBe(true);
  });

  it('un modelo OpenAI directo sin key de OpenAI falla con un error claro', () => {
    const service: any = new OpenAIService({ openrouter: 'sk-or-test' });
    expect(() => service.getPersonaProviderConfig({ selectedModel: 'gpt-5-mini' })).toThrow(/API key de OpenAI/);
  });
});
