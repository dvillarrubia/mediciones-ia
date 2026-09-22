/**
 * Tests de la dimensión "modelo de IA" en las métricas.
 *
 * Todo lo que hay aquí se rompió alguna vez en producción, así que cada bloque
 * cubre un fallo concreto y no una función por gusto:
 *
 * - La "fotografía" salía del último análisis a secas, que con una
 *   automatización por modelo es la del modelo que acabó más tarde ese día.
 * - Los agregados se calculaban promediando porcentajes por modelo.
 * - Las series pintaban un punto por análisis, con varios puntos por fecha.
 * - GAPS marcaba "no aparece" mirando un solo modelo.
 *
 * Los datos son sintéticos a propósito: los tests no pueden depender de la
 * SQLite de desarrollo, que no está en el repositorio.
 */
import { describe, it, expect } from 'vitest';
import {
  AnalysisDetail,
  BrandMention,
  QuestionAnalysis,
  analysisModelKey,
  buildGapsMatrix,
  buildModelVisibility,
  buildPositionDistribution,
  buildTopicMetrics,
  latestAnalysisPerModel,
  modelsInAnalysesBy,
  normalizeModelName,
  poolRatios,
  poolWeightedMean,
} from './sharedMetrics';

// === Fixtures ===

interface MencionSpec {
  brand: string;
  /** Posición de aparición; ausente = no aparece. */
  pos?: number;
  frequency?: number;
  sentiment?: string;
}

function mention(m: MencionSpec): BrandMention {
  return {
    brand: m.brand,
    mentioned: true,
    frequency: m.frequency ?? 1,
    context: m.sentiment ?? 'neutral',
    appearanceOrder: m.pos,
    detailedSentiment: m.sentiment,
  };
}

function question(id: string, categoria: string, menciones: MencionSpec[], modelo: string, persona: string): QuestionAnalysis {
  const brandMentions = menciones.map(mention);
  return {
    questionId: id,
    question: `pregunta ${id}`,
    category: categoria,
    summary: '',
    sources: [],
    brandMentions,
    sentiment: 'neutral',
    confidenceScore: 0.9,
    multiModelAnalysis: [{
      modelPersona: persona as 'chatgpt' | 'claude' | 'gemini' | 'perplexity',
      modelId: modelo,
      modelName: modelo,
      brandMentions,
      confidenceScore: 0.9,
    }],
  };
}

interface AnalisisSpec {
  id: string;
  fecha: string;
  modelo: string;
  persona: string;
  /** Una entrada por pregunta. */
  preguntas: Array<{ categoria?: string; menciones: MencionSpec[] }>;
  confianza?: number;
}

function analisis(spec: AnalisisSpec): AnalysisDetail {
  const questions = spec.preguntas.map((p, i) =>
    question(`q${i}`, p.categoria ?? 'General', p.menciones, spec.modelo, spec.persona));
  return {
    id: spec.id,
    timestamp: spec.fecha,
    configuration: { brand: 'Marca', competitors: ['Rival'], templateId: 't', questionsCount: questions.length },
    results: {
      analysisId: spec.id,
      timestamp: spec.fecha,
      questions,
      overallConfidence: spec.confianza ?? 0.9,
      brandSummary: { targetBrands: [], competitors: [] },
    },
  };
}

/** Tres modelos el mismo día: el caso real de las automatizaciones de Salto. */
function tresModelosMismoDia(fecha: string, aciertos: [number, number, number]): AnalysisDetail[] {
  const modelos: Array<[string, string, string]> = [
    ['chatgpt', 'ChatGPT (GPT-5 Mini) + Search 💰', '12:00'],
    ['claude', 'Claude Haiku 4.5 + Search 💰', '13:00'],
    ['gemini', 'Gemini 3.1 Flash Lite + Search 💰', '14:00'],
  ];
  return modelos.map(([persona, modelo, hora], idx) =>
    analisis({
      id: `${fecha}-${persona}`,
      fecha: `${fecha}T${hora}:00.000Z`,
      modelo,
      persona,
      // Cada modelo menciona la marca en `aciertos[idx]` de 4 preguntas.
      preguntas: Array.from({ length: 4 }, (_, i) => ({
        menciones: i < aciertos[idx]
          ? [mentionSpec(idx), { brand: 'Rival', pos: 2 }]
          : [{ brand: 'Rival', pos: 1 }],
      })),
    }));
}

/** La marca aparece en posición distinta según el modelo, para que los
 *  promedios ponderados tengan algo que distinguir. */
function mentionSpec(idx: number): MencionSpec {
  return { brand: 'Marca', pos: idx + 1, frequency: 2 };
}

// === Tests ===

describe('normalizeModelName', () => {
  it('quita el emoji de los modelos baratos, que partía en dos la misma serie', () => {
    expect(normalizeModelName('Claude Haiku 4.5 + Search 💰')).toBe('Claude Haiku 4.5 + Search');
    expect(normalizeModelName('Claude Haiku 4.5 + Search'))
      .toBe(normalizeModelName('Claude Haiku 4.5 + Search 💰'));
  });

  it('tolera vacío', () => {
    expect(normalizeModelName(undefined)).toBe('');
  });
});

describe('analysisModelKey', () => {
  const [chatgpt] = tresModelosMismoDia('2026-09-21', [4, 4, 4]);

  it('por familia devuelve la etiqueta de la persona', () => {
    expect(analysisModelKey(chatgpt, 'persona')).toBe('ChatGPT');
  });

  it('por versión devuelve el modelo concreto, ya normalizado', () => {
    expect(analysisModelKey(chatgpt, 'modelo')).toBe('ChatGPT (GPT-5 Mini) + Search');
  });
});

describe('modelsInAnalysesBy', () => {
  // Dos versiones de la misma familia: el caso que rompía las claves de React.
  const analyses = [
    analisis({ id: 'a', fecha: '2026-07-20T12:00:00.000Z', modelo: 'ChatGPT (GPT-5.5) + Search', persona: 'chatgpt', preguntas: [{ menciones: [] }] }),
    analisis({ id: 'b', fecha: '2026-09-21T12:00:00.000Z', modelo: 'ChatGPT (GPT-5 Mini) + Search', persona: 'chatgpt', preguntas: [{ menciones: [] }] }),
  ];

  it('funde las versiones de una familia al agrupar por persona', () => {
    expect(modelsInAnalysesBy(analyses, 'persona').map(m => m.key)).toEqual(['ChatGPT']);
  });

  it('las separa al agrupar por versión', () => {
    expect(modelsInAnalysesBy(analyses, 'modelo')).toHaveLength(2);
  });

  it('da a cada versión de la misma familia un color distinto pero emparentado', () => {
    const [v1, v2] = modelsInAnalysesBy(analyses, 'modelo');
    expect(v1.color).not.toBe(v2.color);
    expect(v1.persona).toBe(v2.persona);
  });
});

describe('latestAnalysisPerModel', () => {
  const dia1 = tresModelosMismoDia('2026-09-14', [4, 3, 4]);
  const dia2 = tresModelosMismoDia('2026-09-21', [4, 3, 4]);
  const todos = [...dia1, ...dia2];

  it('devuelve un análisis por modelo, no solo el que acabó más tarde', () => {
    const foto = latestAnalysisPerModel(todos, 'persona');
    expect(foto.map(f => f.modelKey).sort()).toEqual(['ChatGPT', 'Claude', 'Gemini']);
  });

  it('coge la ejecución más reciente de cada modelo', () => {
    const foto = latestAnalysisPerModel(todos, 'persona');
    expect(foto.every(f => f.analysis.timestamp.startsWith('2026-09-21'))).toBe(true);
  });

  it('descarta un modelo retirado si supera la ventana de frescura', () => {
    // Un modelo que no corre desde hace dos meses no puede formar parte de la
    // fotografía de hoy, pero sin ventana se colaba congelado en su última
    // ejecución (el caso real de "ChatGPT (GPT-5.5)").
    const retirado = analisis({
      id: 'viejo', fecha: '2026-07-20T12:00:00.000Z',
      modelo: 'Perplexity Sonar Pro', persona: 'perplexity',
      preguntas: [{ menciones: [{ brand: 'Marca', pos: 1 }] }],
    });
    const conRetirado = [retirado, ...dia2];

    expect(latestAnalysisPerModel(conRetirado, 'persona', { freshnessDays: 14 })).toHaveLength(3);
    expect(latestAnalysisPerModel(conRetirado, 'persona')).toHaveLength(4);
  });

  it('con un solo modelo devuelve exactamente el último análisis', () => {
    // Invariante de no-regresión: los proyectos mono-modelo no deben ver ningún
    // cambio respecto al cálculo anterior.
    const soloChatgpt = todos.filter(a => analysisModelKey(a, 'persona') === 'ChatGPT');
    const foto = latestAnalysisPerModel(soloChatgpt, 'persona');
    expect(foto).toHaveLength(1);
    expect(foto[0].analysis.id).toBe(soloChatgpt[soloChatgpt.length - 1].id);
  });
});

describe('agregación pooled', () => {
  it('no es la media de las medias: pondera por denominador', () => {
    // 65% sobre 40 respuestas y 25% sobre 12. La media de medias da 45% y le
    // otorga a los 12 el mismo peso que a los 40.
    const pooled = poolRatios([{ num: 26, den: 40 }, { num: 3, den: 12 }]);
    expect(pooled.pct).toBeCloseTo(55.77, 1);

    const mediaDeMedias = (65 + 25) / 2;
    expect(pooled.pct).not.toBeCloseTo(mediaDeMedias, 1);
  });

  it('devuelve 0% sin denominador en vez de dividir por cero', () => {
    expect(poolRatios([{ num: 0, den: 0 }]).pct).toBe(0);
  });

  it('poolWeightedMean devuelve null sin observaciones, no 0', () => {
    // Un 0 en posición media significaría "el mejor puesto posible", lo
    // contrario de "no hay dato".
    expect(poolWeightedMean([{ sum: 0, n: 0 }])).toBeNull();
    expect(poolWeightedMean([{ sum: 10, n: 4 }, { sum: 2, n: 1 }])).toBeCloseTo(2.4, 5);
  });
});

describe('buildTopicMetrics', () => {
  const dia = tresModelosMismoDia('2026-09-21', [4, 2, 4]);

  it('suma el último análisis de cada modelo, no solo el más reciente', () => {
    const soloUltimo = buildTopicMetrics([dia[2]], 'persona');
    const losTres = buildTopicMetrics(dia, 'persona');
    const total = (ts: ReturnType<typeof buildTopicMetrics>) => ts.reduce((s, t) => s + t.mentions, 0);
    expect(total(losTres)).toBeGreaterThan(total(soloUltimo));
  });

  it('con un solo modelo da lo mismo que el cálculo anterior', () => {
    const uno = [dia[0]];
    expect(buildTopicMetrics(uno, 'persona')).toEqual(buildTopicMetrics(uno, 'modelo'));
  });
});

describe('buildPositionDistribution', () => {
  const dia1 = tresModelosMismoDia('2026-09-14', [4, 4, 4]);
  const dia2 = tresModelosMismoDia('2026-09-21', [4, 4, 4]);

  it('la fotografía suma los tres modelos', () => {
    const { current } = buildPositionDistribution([...dia1, ...dia2], 'Marca', 'persona');
    // 3 modelos × 4 preguntas con la marca presente.
    expect(current.total).toBe(12);
  });

  it('la serie da un punto por fecha, no por análisis', () => {
    const { overTime } = buildPositionDistribution([...dia1, ...dia2], 'Marca', 'persona');
    expect(overTime).toHaveLength(2);
    expect(overTime.every(p => p.modelos === 3)).toBe(true);
  });
});

describe('buildGapsMatrix', () => {
  /** Los tres modelos ven el mismo prompt; solo `ausentesEn` no mencionan. */
  function conAusencias(ausentesEn: number[]): AnalysisDetail[] {
    const modelos: Array<[string, string]> = [
      ['chatgpt', 'ChatGPT (GPT-5 Mini) + Search'],
      ['claude', 'Claude Haiku 4.5 + Search'],
      ['gemini', 'Gemini 3.1 Flash Lite + Search'],
    ];
    return modelos.map(([persona, modelo], idx) =>
      analisis({
        id: `g-${persona}`,
        fecha: `2026-09-21T1${idx}:00:00.000Z`,
        modelo,
        persona,
        preguntas: [{
          menciones: ausentesEn.includes(idx)
            ? [{ brand: 'Rival', pos: 1 }]
            : [{ brand: 'Marca', pos: 1 }],
        }],
      }));
  }

  it('un prompt que falla en un solo modelo es parcial, no un gap', () => {
    // Antes esto se marcaba como "no aparece" o no según qué modelo hubiera
    // corrido el último, que es azar.
    const matriz = buildGapsMatrix(conAusencias([1]), 'Marca', '', ['Marca'], undefined, 'persona');
    const fila = matriz.rows[0];
    expect(fila.absentLatest).toBe(false);
    expect(fila.absentSomeModel).toBe(true);
    expect(fila.absentModels).toEqual(['Claude']);
  });

  it('un prompt que falla en todos los modelos sí es un gap', () => {
    const matriz = buildGapsMatrix(conAusencias([0, 1, 2]), 'Marca', '', ['Marca'], undefined, 'persona');
    expect(matriz.rows[0].absentLatest).toBe(true);
    expect(matriz.rows[0].absentSomeModel).toBe(false);
  });

  it('un prompt que aparece en todos no es ni gap ni parcial', () => {
    const matriz = buildGapsMatrix(conAusencias([]), 'Marca', '', ['Marca'], undefined, 'persona');
    expect(matriz.rows[0].absentLatest).toBe(false);
    expect(matriz.rows[0].absentSomeModel).toBe(false);
  });
});

describe('buildModelVisibility', () => {
  const analyses = [
    analisis({ id: 'v1', fecha: '2026-07-20T12:00:00.000Z', modelo: 'ChatGPT (GPT-5.5) + Search', persona: 'chatgpt', preguntas: [{ menciones: [{ brand: 'Marca', pos: 1 }] }] }),
    analisis({ id: 'v2', fecha: '2026-09-21T12:00:00.000Z', modelo: 'ChatGPT (GPT-5 Mini) + Search', persona: 'chatgpt', preguntas: [{ menciones: [{ brand: 'Marca', pos: 3 }] }] }),
  ];

  it('respeta la granularidad en vez de agrupar siempre por familia', () => {
    expect(buildModelVisibility(analyses, 'Marca', 'persona')).toHaveLength(1);
    expect(buildModelVisibility(analyses, 'Marca', 'modelo')).toHaveLength(2);
  });

  it('la posición media usa la mejor por respuesta, no una vez por alias', () => {
    // El glosario puede dejar dos entradas de la misma marca en una respuesta;
    // sumarlas por separado duplicaba el promedio.
    const conAlias = [analisis({
      id: 'alias', fecha: '2026-09-21T12:00:00.000Z',
      modelo: 'ChatGPT (GPT-5 Mini) + Search', persona: 'chatgpt',
      preguntas: [{ menciones: [{ brand: 'Marca', pos: 1 }, { brand: 'Marca', pos: 5 }] }],
    })];
    const [fila] = buildModelVisibility(conAlias, 'Marca', 'persona');
    expect(fila.avgPosition).toBe(1);
  });
});
