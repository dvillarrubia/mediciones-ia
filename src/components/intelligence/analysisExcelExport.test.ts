/**
 * Tests del Excel de un análisis.
 *
 * La promesa del Excel es que cuadra con la interfaz: cada cifra del resumen
 * tiene que poder reproducirse filtrando la hoja de preguntas, con el glosario
 * de alias aplicado como en los dashboards. El Excel anterior (servidor) no
 * aplicaba alias y marcaba la marca objetivo como "Descubierto".
 */
import { describe, it, expect } from 'vitest';
import { buildAnalysisExcelSheets } from './analysisExcelExport';
import type { AnalysisDetail, BrandMention, QuestionAnalysis } from './sharedMetrics';

const mention = (brand: string, pos: number, extra: Partial<BrandMention> = {}): BrandMention => ({
  brand, mentioned: true, frequency: 1, context: 'positive', appearanceOrder: pos, ...extra,
});

const question = (i: number, category: string, mentions: BrandMention[], sources: string[] = []): QuestionAnalysis => ({
  questionId: `q${i}`,
  question: `Pregunta ${i}`,
  category,
  summary: '',
  sources: sources.map(url => ({ url, title: url, snippet: '', domain: new URL(url).hostname.replace('www.', ''), isPriority: false })),
  brandMentions: mentions,
  sentiment: 'neutral',
  confidenceScore: 0.8,
  multiModelAnalysis: [{ modelPersona: 'chatgpt', modelId: 'openai/gpt-5-mini:online', modelName: 'GPT-5 Mini', response: 'texto' }],
});

const analysis: AnalysisDetail = {
  id: 'a1',
  timestamp: '2026-10-28T10:00:00Z',
  configuration: { brand: 'Marca (Nombre largo)', competitors: ['Rival'], templateId: 'custom', questionsCount: 4 },
  results: {
    analysisId: 'a1',
    timestamp: '2026-10-28T10:00:00Z',
    overallConfidence: 0.8,
    brandSummary: { targetBrands: [], competitors: [] },
    questions: [
      // Variante del glosario y nombre compuesto: las dos son la marca objetivo
      question(1, 'A', [mention('Marca', 1), mention('Rival', 2)], ['https://www.marca.com/x']),
      question(2, 'A', [mention('Marca 360 (Nombre largo)', 2), mention('Otra', 1)]),
      question(3, 'B', [mention('Rival', 1)], ['https://rival.com/y']),
      question(4, 'B', []),
    ],
  },
};

const project = {
  name: 'Proyecto',
  brandDomain: 'marca.com',
  brandAliases: [{ canonical: 'Marca (Nombre largo)', variants: ['Marca', 'Marca 360'] }],
};

const sheet = (name: string) => buildAnalysisExcelSheets(analysis, project).find(s => s.name === name)!.aoa;
const metric = (label: string) => sheet('Resumen').find(r => r[0] === label);

describe('buildAnalysisExcelSheets', () => {
  it('aplica el glosario: las variantes cuentan como la marca objetivo', () => {
    expect(metric('Respuestas con mención')?.[1]).toBe(2);
    expect(metric('Respuestas con mención')?.[2]).toBe(50);
  });

  it('el resumen se reproduce filtrando la hoja Preguntas', () => {
    const [header, ...rows] = sheet('Preguntas');
    const col = header.indexOf('¿La nombra?');
    expect(rows.filter(r => r[col] === 'Sí').length).toBe(metric('Respuestas con mención')?.[1]);
  });

  it('clasifica objetivo, competidor y descubierta', () => {
    const [header, ...rows] = sheet('Marcas');
    const tipo = header.indexOf('Tipo');
    const byBrand = Object.fromEntries(rows.map(r => [r[1], r[tipo]]));
    expect(byBrand['Marca (Nombre largo)']).toBe('Marca objetivo');
    expect(byBrand['Rival']).toBe('Competidor');
    expect(byBrand['Otra']).toBe('Descubierta');
  });

  it('cuenta las citaciones al dominio de marca y marca el dominio en Fuentes', () => {
    expect(metric('Citaciones al sitio')?.[1]).toBe(1);
    const fuentes = sheet('Fuentes');
    expect(fuentes.find(r => r[0] === 'marca.com')?.[5]).toBe('Sí');
    expect(fuentes.find(r => r[0] === 'rival.com')?.[5]).toBe('');
  });

  it('cada URL aparece una sola vez', () => {
    expect(sheet('URLs citadas').length - 1).toBe(2);
  });
});
