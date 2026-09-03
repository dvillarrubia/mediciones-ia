// Tipos y helpers compartidos por los dashboards de visualización del Intelligence Hub
// (SentimentDashboard, TopicsDashboard, CitationsDashboard). Reutiliza la misma forma de
// datos que MetricsDashboard: cada dashboard recibe `analyses: AnalysisDetail[]` y deriva
// todo en cliente desde los `timestamp` de cada análisis.

export interface BrandMention {
  brand: string;
  mentioned: boolean;
  frequency: number;
  context: string;
  evidence?: string[];
  appearanceOrder?: number;
  isDiscovered?: boolean;
  detailedSentiment?: string;
}

export interface AnalysisSource {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  isPriority: boolean;
}

export interface MultiModelAnalysis {
  modelPersona: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
  modelId?: string;
  modelName?: string;
  response?: string;
  brandMentions?: BrandMention[];
  overallSentiment?: string;
  sourcesCited?: { name?: string; url?: string | null; type?: string; credibility?: string }[];
  confidenceScore?: number;
}

export interface QuestionAnalysis {
  questionId: string;
  question: string;
  category: string;
  summary: string;
  sources: AnalysisSource[];
  brandMentions: BrandMention[];
  sentiment: string;
  confidenceScore: number;
  multiModelAnalysis?: MultiModelAnalysis[];
}

export interface AnalysisDetail {
  id: string;
  timestamp: string;
  configuration: {
    name?: string;
    brand: string;
    competitors: string[];
    templateId: string;
    questionsCount: number;
  };
  results: {
    analysisId: string;
    timestamp: string;
    questions: QuestionAnalysis[];
    overallConfidence: number;
    totalSources?: number;
    prioritySources?: number;
    brandSummary: {
      targetBrands: BrandMention[];
      competitors: BrandMention[];
    };
  };
  metadata?: {
    duration?: number;
    modelsUsed?: string[];
    totalQuestions?: number;
  };
}

// === Sentimiento ===

export type SentimentKey = 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';

export const SENTIMENT_KEYS: SentimentKey[] = ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'];

export const SENTIMENT_LABELS: Record<SentimentKey, string> = {
  very_positive: 'Muy Positivo',
  positive: 'Positivo',
  neutral: 'Neutral',
  negative: 'Negativo',
  very_negative: 'Muy Negativo',
};

export const SENTIMENT_COLORS: Record<SentimentKey, string> = {
  very_positive: '#15803d',
  positive: '#4ade80',
  neutral: '#d1d5db',
  negative: '#f87171',
  very_negative: '#dc2626',
};

/** Normaliza cualquier string de sentimiento a una de las 5 claves canónicas. */
export function normalizeSentimentKey(s: string | undefined): SentimentKey {
  if (!s) return 'neutral';
  const lower = s.toLowerCase();
  if (lower.includes('very_positive') || lower.includes('muy_positiv')) return 'very_positive';
  if (lower.includes('very_negative') || lower.includes('muy_negativ')) return 'very_negative';
  if (lower.includes('positiv')) return 'positive';
  if (lower.includes('negativ')) return 'negative';
  return 'neutral';
}

/** Escala numérica -2..+2 para agregaciones (net sentiment, promedios). */
export function sentimentToNumeric(s: string | undefined): number {
  switch (normalizeSentimentKey(s)) {
    case 'very_positive': return 2;
    case 'positive': return 1;
    case 'negative': return -1;
    case 'very_negative': return -2;
    default: return 0;
  }
}

/** Colapsa a 3 categorías (positivo / neutral / negativo). */
export function sentimentBucket3(s: string | undefined): 'positive' | 'neutral' | 'negative' {
  const k = normalizeSentimentKey(s);
  if (k === 'very_positive' || k === 'positive') return 'positive';
  if (k === 'very_negative' || k === 'negative') return 'negative';
  return 'neutral';
}

export function fmtSentiment(n: number): string {
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

export const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

/** Agrupa variantes del mismo nombre de marca usando la lista configurada como referencia canónica. */
export function normalizeBrandName(brand: string, configuredBrands: string[]): string {
  // Misma clave que aliasKey (ignora espacios, guiones, guiones bajos y puntos)
  // para que todas las métricas agrupen igual (p.ej. "U.O.C." → "UOC").
  const lower = brand.toLowerCase().replace(/[\s\-_.]+/g, '');
  for (const cb of configuredBrands) {
    if (cb.toLowerCase().replace(/[\s\-_.]+/g, '') === lower) return cb;
  }
  return brand;
}

// === Glosario de marcas (alias) ===

export interface BrandAlias {
  canonical: string;
  variants: string[];
}

const aliasKey = (s: string) => s.toLowerCase().replace(/[\s\-_.]+/g, '').trim();

/** Construye un mapa variante-normalizada → marca canónica desde el glosario. */
export function buildAliasMap(aliases: BrandAlias[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  (aliases || []).forEach(a => {
    if (!a.canonical) return;
    map.set(aliasKey(a.canonical), a.canonical);
    (a.variants || []).forEach(v => { if (v) map.set(aliasKey(v), a.canonical); });
  });
  return map;
}

/** Resuelve un nombre de marca a su forma canónica si está en el glosario; si no, lo deja igual. */
export function resolveBrandName(name: string, aliasMap: Map<string, string>): string {
  if (!name) return name;
  return aliasMap.get(aliasKey(name)) || name;
}

/**
 * Nombres con los que puede aparecer la marca objetivo en un texto: el canónico más las
 * variantes de su entrada en el glosario (submarcas tipo "i-DE", "Curenergía"…).
 * Se descartan variantes de menos de 3 caracteres para evitar falsos positivos.
 */
export function brandNameVariants(targetBrand: string, aliases?: BrandAlias[]): string[] {
  const names = new Set<string>();
  if (targetBrand) names.add(targetBrand);
  (aliases || []).forEach(a => {
    if (!a.canonical || aliasKey(a.canonical) !== aliasKey(targetBrand)) return;
    names.add(a.canonical);
    (a.variants || []).forEach(v => { if (v && v.trim().length >= 3) names.add(v.trim()); });
  });
  return Array.from(names);
}

/** Canonicaliza los nombres de marca de un conjunto de análisis aplicando el glosario, una sola vez. */
export function applyAliasesToAnalyses(analyses: AnalysisDetail[], aliases: BrandAlias[] | undefined): AnalysisDetail[] {
  if (!aliases || aliases.length === 0) return analyses;
  const map = buildAliasMap(aliases);
  if (map.size === 0) return analyses;

  const fixMention = (bm: BrandMention): BrandMention => ({ ...bm, brand: resolveBrandName(bm.brand, map) });
  const fixMentions = (arr?: BrandMention[]) => (arr ? arr.map(fixMention) : arr);

  return analyses.map(a => ({
    ...a,
    results: {
      ...a.results,
      questions: (a.results?.questions || []).map(q => ({
        ...q,
        brandMentions: fixMentions(q.brandMentions) || [],
        multiModelAnalysis: q.multiModelAnalysis
          ? q.multiModelAnalysis.map(m => ({ ...m, brandMentions: fixMentions(m.brandMentions) }))
          : q.multiModelAnalysis,
      })),
      brandSummary: a.results?.brandSummary
        ? {
            targetBrands: fixMentions(a.results.brandSummary.targetBrands) || [],
            competitors: fixMentions(a.results.brandSummary.competitors) || [],
          }
        : a.results?.brandSummary,
    },
  }));
}

// === Modelo / Proveedor (dimensión transversal) ===

export type ModelPersona = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

export const PERSONA_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

export const PERSONA_COLORS: Record<string, string> = {
  chatgpt: '#10a37f',
  claude: '#d97757',
  gemini: '#4285f4',
  perplexity: '#20808d',
};

/** Etiqueta legible para un análisis multi-modelo: usa modelName si existe, si no la persona. */
export function modelLabel(mm: MultiModelAnalysis | undefined): string {
  if (!mm) return 'IA';
  if (mm.modelName) return mm.modelName;
  return PERSONA_LABELS[mm.modelPersona] || mm.modelPersona || 'IA';
}

/** Infiere el proveedor/transporte a partir del modelId (los de OpenRouter llevan prefijo "x/..."). */
export function inferProvider(mm: MultiModelAnalysis | undefined): string {
  if (!mm) return 'desconocido';
  const id = (mm.modelId || '').toLowerCase();
  if (id.includes('/')) return 'openrouter';
  switch (mm.modelPersona) {
    case 'chatgpt': return 'openai';
    case 'claude': return 'anthropic';
    case 'gemini': return 'google';
    case 'perplexity': return 'perplexity';
    default: return 'desconocido';
  }
}

/** Personas presentes en una pregunta (desde multiModelAnalysis). */
export function personasInQuestion(q: QuestionAnalysis): ModelPersona[] {
  const mm = q.multiModelAnalysis || [];
  const set = new Set<ModelPersona>();
  mm.forEach(m => { if (m.modelPersona) set.add(m.modelPersona); });
  return Array.from(set);
}

/** Etiqueta de fecha corta (es-ES) para ejes temporales. */
export function dateLabel(ts: string): string {
  return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

/** Ordena los análisis por fecha ascendente. */
export function sortByDate(analyses: AnalysisDetail[]): AnalysisDetail[] {
  return [...analyses].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/** Dominios que no son fuentes web reales (placeholders de IA). */
export function isRealDomain(domain: string | undefined): boolean {
  if (!domain) return false;
  return !['ai-models', 'unknown', 'ai-generated', 'ai-analysis', 'generative'].includes(domain.toLowerCase());
}

export function isWebUrl(url: string | undefined): boolean {
  return !!url && url.startsWith('http') && !url.includes('ai-generated') && !url.includes('generative');
}

// === Gap de citaciones (Hito 6.B — GEO) ===

/** Normaliza un nombre de marca para comparar: minúsculas, sin acentos y con
 *  los separadores convertidos en espacios ("ASSA ABLOY (TESA Hotel)" →
 *  "assa abloy tesa hotel"). A diferencia de aliasKey NO colapsa los espacios,
 *  porque necesitamos comparar por palabra completa. */
const normBrandName = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ¿La marca mencionada es la de referencia? Compara por palabra completa en
 *  AMBOS sentidos, porque los modelos devuelven el nombre con coletillas:
 *
 *    "ASSA ABLOY (TESA Hotel)" ~ "Assa Abloy"   (la mención contiene a la referencia)
 *    "HID"                     ~ "HID Global"   (la referencia contiene a la mención)
 *
 *  La comparación por palabra completa evita falsos positivos por subcadena
 *  ("tesa" no casa dentro de "protesta"). Se exigen 3 caracteres mínimo para no
 *  emparejar por siglas de dos letras.
 */
export function brandMatches(mentionName: string, referenceName: string): boolean {
  const a = normBrandName(mentionName);
  const b = normBrandName(referenceName);
  if (!a || !b) return false;
  if (a === b) return true;
  const containsWord = (haystack: string, needle: string) =>
    needle.length >= 3 && new RegExp(`(^| )${escapeRe(needle)}( |$)`).test(haystack);
  return containsWord(a, b) || containsWord(b, a);
}

export interface CitationGap {
  domain: string;
  /** Preguntas donde el dominio se cita junto a un competidor CONFIGURADO y SIN la marca. */
  competitorCitations: number;
  /** Competidores configurados presentes, con su nombre canónico. */
  competitors: string[];
  /** Preguntas donde solo acompañan marcas DESCUBIERTAS por el modelo (sin competidor configurado). */
  discoveredCitations: number;
  /** Marcas descubiertas presentes. Pueden ser competencia real sin declarar
   *  (Brivo, Genetec) o simplemente marcas del sector, clientes o verticales. */
  discovered: string[];
}

/** Dominios (de terceros) que la IA cita junto a competidores pero nunca con tu marca → oportunidades de presencia. */
export function buildCitationGaps(analyses: AnalysisDetail[], targetBrand: string): CitationGap[] {
  const acc: Record<string, { targetCount: number; compCount: number; comps: Set<string>; discCount: number; disc: Set<string> }> = {};

  // Claves de marca (objetivo + competidores) para excluir dominios PROPIOS de marcas (no son oportunidades).
  const brandKeys = new Set<string>();
  const addBrandKey = (name: string) => { const k = aliasKey(name); if (k.length >= 4) brandKeys.add(k); };
  addBrandKey(targetBrand);

  // Competidores CONFIGURADOS del proyecto. El gap solo puede considerar
  // competencia lo que el gestor haya declarado como tal: antes se tomaba
  // cualquier marca mencionada que no fuera la objetivo, y eso metía en la lista
  // a clientes y verticales de la marca. En los análisis de Salto suponía 1.120
  // "competidores" frente a los 11 configurados: hoteles, gimnasios, portales de
  // reservas e incluso un hospital, que la IA nombra en la misma respuesta
  // porque Salto les vende control de accesos.
  const configuredCompetitors: string[] = [];
  const addCompetitor = (name: string) => {
    const clean = (name || '').trim();
    if (clean.length < 2) return;
    if (!configuredCompetitors.some(c => brandMatches(c, clean))) configuredCompetitors.push(clean);
  };
  analyses.forEach(a => (a.configuration?.competitors || []).forEach(addCompetitor));

  // Sin competidores declarados el gap no significa nada: su premisa es
  // "dominios citados junto a la COMPETENCIA y nunca contigo". Devolver la lista
  // completa de marcas mencionadas sería exactamente el error que esto corrige.
  if (configuredCompetitors.length === 0) return [];

  analyses.forEach(a => {
    addBrandKey(a.configuration?.brand || '');
    (a.configuration?.competitors || []).forEach(addBrandKey);
    (a.results?.questions || []).forEach(q => {
      const mentions = (q.brandMentions || []).filter(bm => bm.mentioned);
      mentions.forEach(bm => addBrandKey(bm.brand));
      // Comparación tolerante a variantes: el modelo devuelve "Salto Systems",
      // "SALTO" o "Assa Abloy (VingCard)" para la misma marca. Con igualdad
      // estricta la marca objetivo no se reconocía y el dominio se contaba como
      // hueco aunque la marca SÍ estuviera presente.
      const targetHere = mentions.some(bm => brandMatches(bm.brand, targetBrand));
      // Cada mención se reduce a su competidor configurado (nombre canónico), de
      // modo que las variantes dejan de contarse por separado y dejan de diluir
      // al competidor real fuera del top.
      // Competidores DECLARADOS presentes, reducidos a su nombre canónico.
      const comps = mentions
        .map(bm => configuredCompetitors.find(c => brandMatches(bm.brand, c)))
        .filter((c): c is string => !!c && !brandMatches(c, targetBrand));
      // Marcas DESCUBIERTAS por el modelo: ni la objetivo, ni un competidor
      // declarado. No se descartan —entre ellas hay competencia real sin
      // configurar, como Brivo o Genetec— pero se cuentan aparte para que no se
      // presenten como competencia confirmada.
      const discovered = mentions
        .filter(bm => !brandMatches(bm.brand, targetBrand))
        .filter(bm => !configuredCompetitors.some(c => brandMatches(bm.brand, c)))
        .map(bm => bm.brand);
      const domains = new Set(
        (q.sources || []).filter(s => isWebUrl(s.url) && isRealDomain(s.domain)).map(s => s.domain)
      );
      domains.forEach(d => {
        if (!acc[d]) acc[d] = { targetCount: 0, compCount: 0, comps: new Set(), discCount: 0, disc: new Set() };
        if (targetHere) { acc[d].targetCount++; return; }
        if (comps.length > 0) {
          acc[d].compCount++;
          comps.forEach(c => acc[d].comps.add(c));
          discovered.forEach(c => acc[d].disc.add(c));
        } else if (discovered.length > 0) {
          // Solo marcas descubiertas: sigue siendo señal, pero más débil.
          acc[d].discCount++;
          discovered.forEach(c => acc[d].disc.add(c));
        }
      });
    });
  });

  // ¿El dominio pertenece a una marca? Compara por etiqueta (endesa.com → "endesa"),
  // no substring del dominio entero.
  //
  // El nombre de marca no siempre encabeza la etiqueta: "accentra-assaabloy.com"
  // es de Assa Abloy y con startsWith se colaba como "oportunidad". Un dominio de
  // la propia competencia nunca es un hueco donde ganar presencia. Para la
  // comparación por contención se exigen 5 caracteres, más que los 4 de prefijo,
  // porque una marca corta dentro de una etiqueta larga es fácil que sea casual.
  const isBrandOwnedDomain = (domain: string): boolean => {
    const labels = domain.toLowerCase().split('.').map(l => aliasKey(l)).filter(Boolean);
    for (const label of labels) {
      for (const bk of brandKeys) {
        if (label === bk) return true;
        if (bk.length >= 4 && label.startsWith(bk)) return true;
        if (bk.length >= 5 && label.includes(bk)) return true;
      }
    }
    return false;
  };

  return Object.entries(acc)
    .filter(([domain, d]) => d.targetCount === 0 && (d.compCount > 0 || d.discCount > 0) && !isBrandOwnedDomain(domain))
    .map(([domain, d]) => ({
      domain,
      competitorCitations: d.compCount,
      competitors: Array.from(d.comps).slice(0, 6),
      discoveredCitations: d.discCount,
      discovered: Array.from(d.disc).slice(0, 6),
    }))
    // Los dominios respaldados por competencia DECLARADA van primero: son los
    // que se pueden afirmar sin matices. Los de solo marcas descubiertas quedan
    // debajo, visibles pero sin mezclarse con los anteriores.
    .sort((a, b) => (b.competitorCitations - a.competitorCitations) || (b.discoveredCitations - a.discoveredCitations))
    .slice(0, 20);
}



/**
 * Etiqueta del modelo con el que se ejecutó un análisis.
 *
 * La dimensión "modelo" NO vive dentro de cada pregunta: en producción ninguna
 * pregunta tiene más de una entrada en `multiModelAnalysis` (2.268 con una, 105
 * con ninguna). Vive ENTRE análisis, porque las automatizaciones se configuran
 * una por modelo (p.ej. "Salto gen ES - chatgpt", "- claude", "- gemini").
 *
 * De ahí que mirar solo el análisis más reciente enseñe un único modelo: el del
 * último que corrió ese día. Para comparar modelos hay que agrupar por análisis.
 */
export function analysisModelLabel(a: AnalysisDetail): string {
  // La fuente fiable son las propias preguntas. `metadata.modelsUsed` NO sirve:
  // guarda los modelos SOLICITADOS, no los ejecutados. En producción hay
  // análisis con modelsUsed = ["claude","gemini","chatgpt"] cuyas 103 preguntas
  // corrieron todas con Gemini; fiarse de ese campo etiquetaría el gráfico con
  // tres modelos que nunca intervinieron.
  const encontrados = new Set<string>();
  (a.results?.questions || []).forEach(q => {
    (q.multiModelAnalysis || []).forEach(mm => {
      const l = modelLabel(mm);
      if (l) encontrados.add(l);
    });
  });
  if (encontrados.size > 0) return Array.from(encontrados).sort().join(' + ');

  // Sin datos por pregunta, metadata es lo único que queda. Se ordena para que
  // el mismo conjunto no genere dos etiquetas distintas según el orden.
  const desdeMetadata = (a.metadata?.modelsUsed || []).filter(Boolean);
  if (desdeMetadata.length > 0) return Array.from(new Set(desdeMetadata)).sort().join(' + ');
  return 'Sin modelo';
}

/** Modelos distintos presentes en un conjunto de análisis, en orden estable. */
export function modelsInAnalyses(analyses: AnalysisDetail[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  (analyses || []).forEach(a => {
    const m = analysisModelLabel(a);
    if (!vistos.has(m)) { vistos.add(m); out.push(m); }
  });
  return out.sort((x, y) => x.localeCompare(y));
}


/**
 * Etiqueta de modelo para nombrar una descarga: el modelo si solo hay uno en el
 * rango, "multimodelo" si hay varios. Un nombre de fichero con cuatro modelos
 * concatenados sería ilegible y se comería el límite de longitud.
 */
export function modelosDelRango(analyses: AnalysisDetail[]): string {
  const ms = modelsInAnalyses(analyses || []);
  if (ms.length === 0) return '';
  if (ms.length === 1) return ms[0];
  return 'multimodelo';
}

// === Topics (extraído de TopicsDashboard para que pantalla y Excel no diverjan) ===

export interface TopicMetric {
  topic: string;
  mentions: number;
  positive: number; neutral: number; negative: number;
  pctPositive: number; pctNegative: number; pctNeutral: number;
  net: number;
}

/**
 * Agrega menciones por categoría del ÚLTIMO análisis del rango.
 * Vive aquí y no en el dashboard porque la pestaña de Descargas necesita el
 * mismo cálculo: si cada uno tuviera el suyo, el Excel podría decir una cosa y
 * la pantalla otra.
 */
export function buildTopicMetrics(analyses: AnalysisDetail[]): TopicMetric[] {
  if (!analyses || analyses.length === 0) return [];
  const latest = sortByDate(analyses).slice(-1)[0];

  const acc: Record<string, { mentions: number; pos: number; neu: number; neg: number }> = {};
  (latest.results?.questions || []).forEach(q => {
    const topic = q.category || 'Sin categoría';
    if (!acc[topic]) acc[topic] = { mentions: 0, pos: 0, neu: 0, neg: 0 };
    (q.brandMentions || []).forEach(bm => {
      if (!bm.mentioned) return;
      acc[topic].mentions++;
      const k = normalizeSentimentKey(bm.detailedSentiment || bm.context);
      if (k === 'very_positive' || k === 'positive') acc[topic].pos++;
      else if (k === 'very_negative' || k === 'negative') acc[topic].neg++;
      else acc[topic].neu++;
    });
  });

  return Object.entries(acc)
    .map(([topic, d]) => {
      const total = d.mentions || 1;
      return {
        topic,
        mentions: d.mentions,
        positive: d.pos, neutral: d.neu, negative: d.neg,
        pctPositive: (d.pos / total) * 100,
        pctNegative: (d.neg / total) * 100,
        pctNeutral: (d.neu / total) * 100,
        net: ((d.pos - d.neg) / total) * 100,
      };
    })
    .filter(t => t.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions);
}

// === Sentimiento por marca (extraído de SentimentDashboard, misma razón) ===

export interface BrandSentimentRow {
  brand: string;
  total: number;
  counts: Record<SentimentKey, number>;
  positive: number; neutral: number; negative: number;
  net: number;
  isTarget: boolean;
}

/** Distribución de sentimiento por marca sobre TODOS los análisis del rango. */
export function buildBrandSentiment(analyses: AnalysisDetail[], targetBrand: string): BrandSentimentRow[] {
  const acc: Record<string, BrandSentimentRow> = {};
  (analyses || []).forEach(a => {
    (a.results?.questions || []).forEach(q => {
      (q.brandMentions || []).forEach(bm => {
        if (!bm.mentioned || !bm.brand) return;
        const brand = bm.brand;
        if (!acc[brand]) {
          acc[brand] = {
            brand, total: 0,
            counts: { very_positive: 0, positive: 0, neutral: 0, negative: 0, very_negative: 0 },
            positive: 0, neutral: 0, negative: 0, net: 0,
            isTarget: brandMatches(brand, targetBrand),
          };
        }
        acc[brand].counts[normalizeSentimentKey(bm.detailedSentiment || bm.context)]++;
        acc[brand].total++;
      });
    });
  });

  return Object.values(acc).map(b => {
    const positive = b.counts.very_positive + b.counts.positive;
    const negative = b.counts.very_negative + b.counts.negative;
    return {
      ...b, positive, negative, neutral: b.counts.neutral,
      net: b.total > 0 ? ((positive - negative) / b.total) * 100 : 0,
    };
  }).sort((a, b) => b.net - a.net);
}

// === Distribución de posición (Hito 5) ===

export const POSITION_BUCKETS = ['Posición 1', 'Posición 2-3', 'Posición 4-7', 'Posición 8+'] as const;
export const POSITION_COLORS = ['#1e3a8a', '#3b82f6', '#93c5fd', '#dbeafe'];

export interface PositionDist { p1: number; p2_3: number; p4_7: number; p8plus: number; total: number; }

function positionBucketKey(pos: number): 'p1' | 'p2_3' | 'p4_7' | 'p8plus' {
  if (pos === 1) return 'p1';
  if (pos <= 3) return 'p2_3';
  if (pos <= 7) return 'p4_7';
  return 'p8plus';
}

function positionDistFor(analysis: AnalysisDetail, targetKey: string): PositionDist {
  const d: PositionDist = { p1: 0, p2_3: 0, p4_7: 0, p8plus: 0, total: 0 };
  (analysis.results?.questions || []).forEach(q => {
    const t = (q.brandMentions || []).find(bm => bm.mentioned && aliasKey(bm.brand) === targetKey && bm.appearanceOrder && bm.appearanceOrder > 0);
    if (t && t.appearanceOrder) { d[positionBucketKey(t.appearanceOrder)]++; d.total++; }
  });
  return d;
}

/** Distribución de la posición de la marca por buckets (actual + evolución). */
export function buildPositionDistribution(analyses: AnalysisDetail[], targetBrand: string): {
  current: PositionDist;
  overTime: { label: string; p1: number; p2_3: number; p4_7: number; p8plus: number }[];
} {
  const sorted = sortByDate(analyses);
  const targetKey = aliasKey(targetBrand);
  const current = sorted.length > 0 ? positionDistFor(sorted[sorted.length - 1], targetKey) : { p1: 0, p2_3: 0, p4_7: 0, p8plus: 0, total: 0 };
  const overTime = sorted.map(a => {
    const d = positionDistFor(a, targetKey);
    return { label: dateLabel(a.timestamp), p1: d.p1, p2_3: d.p2_3, p4_7: d.p4_7, p8plus: d.p8plus };
  });
  return { current, overTime };
}


/**
 * Posición media de la marca objetivo por MODELO y fecha, para el gráfico
 * multilínea de tracking.
 *
 * Devuelve una fila por fecha con una columna por modelo. El valor es `null`
 * —no 0— cuando ese modelo no corrió ese día o la marca no apareció en ninguna
 * respuesta: con 0 la línea se desplomaría al mejor puesto posible, que es
 * justo lo contrario de lo que significa.
 *
 * La posición de cada pregunta es la MEJOR (mínima) del target, igual que en el
 * resto de métricas de posición: el glosario de alias puede dejar varias
 * entradas de la misma marca en una pregunta.
 *
 * Nota: usa la comparación estricta por `aliasKey`, la misma que
 * `positionDistFor` y `buildModelVisibility`, para que los tres gráficos de
 * posición cuenten igual. Es más estricta que `brandMatches` y puede perder
 * variantes ("Salto Systems" frente a "Salto"); unificarlas es un cambio aparte
 * porque movería números que los clientes ya tienen en sus informes.
 */
export function buildPositionByModelOverTime(
  analyses: AnalysisDetail[],
  targetBrand: string
): { rows: Array<Record<string, string | number | null>>; models: string[] } {
  const sorted = sortByDate(analyses);
  const targetKey = aliasKey(targetBrand);
  const models = modelsInAnalyses(sorted);

  // fecha -> modelo -> acumulado de posiciones
  const porFecha = new Map<string, Map<string, { suma: number; n: number }>>();

  sorted.forEach(a => {
    const modelo = analysisModelLabel(a);
    const fecha = dateLabel(a.timestamp);
    if (!porFecha.has(fecha)) porFecha.set(fecha, new Map());
    const porModelo = porFecha.get(fecha)!;
    if (!porModelo.has(modelo)) porModelo.set(modelo, { suma: 0, n: 0 });
    const acc = porModelo.get(modelo)!;

    (a.results?.questions || []).forEach(q => {
      let mejor: number | null = null;
      (q.brandMentions || []).forEach(bm => {
        if (!bm.mentioned || aliasKey(bm.brand) !== targetKey) return;
        if (!bm.appearanceOrder || bm.appearanceOrder <= 0) return;
        mejor = mejor === null ? bm.appearanceOrder : Math.min(mejor, bm.appearanceOrder);
      });
      if (mejor !== null) { acc.suma += mejor; acc.n++; }
    });
  });

  const rows = [...porFecha.entries()].map(([fecha, porModelo]) => {
    const fila: Record<string, string | number | null> = { label: fecha };
    models.forEach(m => {
      const acc = porModelo.get(m);
      fila[m] = acc && acc.n > 0 ? +(acc.suma / acc.n).toFixed(2) : null;
    });
    return fila;
  });

  return { rows, models };
}

// === Visibilidad por modelo (Hito 6.1 — GEO) ===

export interface ModelVisibility {
  persona: string;
  label: string;
  color: string;
  responses: number;
  mentioned: number;
  mentionRate: number; // %
  sovPct: number;      // % menciones de la marca sobre el total, en ese modelo
  avgPosition: number | null;
}

/** Visibilidad de la marca objetivo desglosada por modelo de IA (¿visible en ChatGPT pero no en Gemini?). */
export function buildModelVisibility(analyses: AnalysisDetail[], targetBrand: string): ModelVisibility[] {
  const targetKey = aliasKey(targetBrand);
  const acc: Record<string, { responses: number; mentioned: number; brandFreq: number; totalFreq: number; posSum: number; posCount: number }> = {};

  analyses.forEach(a => {
    (a.results?.questions || []).forEach(q => {
      (q.multiModelAnalysis || []).forEach(m => {
        const persona = m.modelPersona || 'otros';
        if (!acc[persona]) acc[persona] = { responses: 0, mentioned: 0, brandFreq: 0, totalFreq: 0, posSum: 0, posCount: 0 };
        acc[persona].responses++;
        const mentions = (m.brandMentions && m.brandMentions.length > 0 ? m.brandMentions : q.brandMentions) || [];
        let here = false;
        mentions.forEach(bm => {
          if (!bm.mentioned || (bm.frequency || 0) <= 0) return;
          acc[persona].totalFreq += bm.frequency;
          if (aliasKey(bm.brand) === targetKey) {
            acc[persona].brandFreq += bm.frequency;
            here = true;
            if (bm.appearanceOrder && bm.appearanceOrder > 0) { acc[persona].posSum += bm.appearanceOrder; acc[persona].posCount++; }
          }
        });
        if (here) acc[persona].mentioned++;
      });
    });
  });

  return Object.entries(acc)
    .map(([persona, d]) => ({
      persona,
      label: PERSONA_LABELS[persona] || persona,
      color: PERSONA_COLORS[persona] || '#888',
      responses: d.responses,
      mentioned: d.mentioned,
      mentionRate: d.responses > 0 ? (d.mentioned / d.responses) * 100 : 0,
      sovPct: d.totalFreq > 0 ? (d.brandFreq / d.totalFreq) * 100 : 0,
      avgPosition: d.posCount > 0 ? d.posSum / d.posCount : null,
    }))
    .filter(m => m.responses > 0)
    .sort((a, b) => b.mentionRate - a.mentionRate);
}

// === Clasificación mención vs citación (Hito 2) ===

export type AppearanceType = 'no_aparece' | 'mencion' | 'citacion_com' | 'citacion_blog';

/** Normaliza un dominio de marca (sin protocolo/www/barras). */
export function normalizeDomain(d: string | undefined): string {
  return (d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').trim();
}

/** ¿La fuente (dominio o url) pertenece al dominio de la marca? */
export function sourceBelongsToBrand(source: AnalysisSource, brandDomain: string): boolean {
  const bd = normalizeDomain(brandDomain);
  if (!bd) return false;
  const d = (source.domain || '').toLowerCase();
  if (d && (d === bd || d.endsWith('.' + bd))) return true;
  const u = (source.url || '').toLowerCase();
  return u.includes('//' + bd) || u.includes('.' + bd + '/') || u.includes('/' + bd + '/');
}

/** ¿Es una citación al blog de la marca? (dominio de marca + ruta /blog) */
export function isBrandBlog(source: AnalysisSource, brandDomain: string): boolean {
  if (!sourceBelongsToBrand(source, brandDomain)) return false;
  return (source.url || '').toLowerCase().includes('/blog');
}

export const APPEARANCE_LABELS: Record<AppearanceType, string> = {
  no_aparece: 'No aparece',
  mencion: 'Mención',
  citacion_com: 'Citación al sitio',
  citacion_blog: 'Citación al blog',
};

// Código de color del brief de Pichincha: rojo / naranja / amarillo / verde
export const APPEARANCE_COLORS: Record<AppearanceType, string> = {
  no_aparece: '#dc2626',
  mencion: '#f59e0b',
  citacion_com: '#eab308',
  citacion_blog: '#16a34a',
};

export interface BrandAppearanceRow {
  analysisId: string;
  date: string;
  prompt: string;
  type: AppearanceType;
  url?: string;
  phrase?: string;
  model?: string;
}

/** Filas por prompt con el tipo de aparición de la marca (mención/citación). Excluye "no aparece". */
export function getBrandAppearanceRows(
  analyses: AnalysisDetail[],
  targetBrand: string,
  brandDomain: string,
  brandNames?: string[]
): BrandAppearanceRow[] {
  const targetKey = aliasKey(targetBrand);
  const rows: BrandAppearanceRow[] = [];
  analyses.forEach(a => {
    (a.results?.questions || []).forEach(q => {
      const target = (q.brandMentions || []).find(bm => bm.mentioned && aliasKey(bm.brand) === targetKey);
      const brandSources = (q.sources || []).filter(s => sourceBelongsToBrand(s, brandDomain));
      const blogSource = brandSources.find(s => isBrandBlog(s, brandDomain));
      let type: AppearanceType;
      let url: string | undefined;
      if (blogSource) { type = 'citacion_blog'; url = blogSource.url; }
      else if (brandSources.length > 0) { type = 'citacion_com'; url = brandSources[0].url; }
      else if (target) { type = 'mencion'; }
      else return; // no aparece → no se lista
      rows.push({
        analysisId: a.id,
        date: a.timestamp,
        prompt: q.question,
        type,
        url,
        phrase: verifiedEvidence(q, target, brandNames || [targetBrand])[0],
        model: modelLabel(q.multiModelAnalysis?.[0]),
      });
    });
  });
  return rows;
}

/**
 * Evidencias de una mención como lista de strings, pase lo que pase con el dato guardado.
 *
 * El modelo no siempre respeta el esquema: en producción hay análisis (UOC jun-jul/2026,
 * Saunier Duval 27/08/2026) con `evidence: [["frase"]]` —arrays anidados— que llegaron a la
 * base de datos sin sanear. Un `.replace` sobre ese elemento lanzaba TypeError dentro de
 * buildGapsMatrix y, sin ErrorBoundary, la pestaña GAPS quedaba en blanco.
 * Aplana un nivel, descarta lo que no sea texto y recorta espacios.
 */
export function evidenceStrings(evidence: unknown): string[] {
  if (!Array.isArray(evidence)) return [];
  const out: string[] = [];
  evidence.forEach(item => {
    const items = Array.isArray(item) ? item : [item];
    items.forEach(v => {
      if (typeof v === 'string' && v.trim()) out.push(v.trim());
    });
  });
  return out;
}

/** Limpia una frase de evidencia para mostrarla: quita enlaces markdown "([dominio](url))" y espacios repetidos. */
export function cleanEvidencePhrase(e: unknown): string {
  return (typeof e === 'string' ? e : '').replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, '').replace(/\s+/g, ' ').trim();
}

const normEvidenceText = (s: string) =>
  (s || '').toLowerCase().replace(/[‘’“”"']/g, '').replace(/\s+/g, ' ').trim();

/**
 * Evidencias de la mención verificadas contra la respuesta de la pregunta.
 * Algunos análisis históricos guardaron en cada pregunta las evidencias de TODO el
 * análisis (repetidas por modelo), así que una frase solo se acepta si (a) aparece
 * literalmente en las respuestas de esta pregunta y (b) nombra a la marca. Si ninguna
 * evidencia guardada cumple ambas, se extraen de la propia respuesta las frases que
 * nombran la marca (la respuesta conserva el contexto, p.ej. "**Marca**: …", que la
 * evidencia guardada a veces pierde). `brandNames` admite las variantes del glosario
 * (submarcas) además del nombre canónico.
 */
export function verifiedEvidence(q: QuestionAnalysis, target: BrandMention | undefined, brandNames: string[]): string[] {
  if (!target) return [];
  const names = Array.from(new Set([target.brand, ...brandNames].filter(Boolean).map(n => n.toLowerCase())));
  const namesBrand = (s: string) => { const l = s.toLowerCase(); return names.some(n => l.includes(n)); };

  const responseRaw = (q.multiModelAnalysis || []).map(m => m.response || '').join('\n');
  const responseText = normEvidenceText(responseRaw);

  // La marca se busca en la frase ORIGINAL (un enlace "([marca.es](…))" también la nombra);
  // la versión limpia es solo para mostrar y para cotejar contra la respuesta.
  const seen = new Set<string>();
  const pairs: { raw: string; clean: string }[] = [];
  evidenceStrings(target.evidence).forEach(raw => {
    const c = cleanEvidencePhrase(raw);
    if (c.length > 10 && !seen.has(c)) { seen.add(c); pairs.push({ raw, clean: c }); }
  });
  const verified = pairs
    .filter(p => namesBrand(p.raw) && (!responseText || responseText.includes(normEvidenceText(p.clean).slice(0, 80))))
    .map(p => p.clean);
  if (verified.length > 0) return verified;

  // Fallback: frases de la respuesta que nombran la marca (sin URLs ni markdown, que ensucian el corte).
  if (responseRaw) {
    const stripped = responseRaw
      .replace(/\(\[[^\]]*\]\([^)]*\)\)/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\*\*/g, '');
    const sentences = (stripped.match(/[^.!?\n]+[.!?]?/g) || []).map(s => s.trim()).filter(s => s.length > 10);
    return Array.from(new Set(sentences.filter(namesBrand))).slice(0, 3);
  }
  return [];
}

/** Clasifica la aparición de la marca objetivo en una pregunta (incluye 'no_aparece'). */
export function classifyQuestionForBrand(
  q: QuestionAnalysis,
  targetBrand: string,
  brandDomain: string,
  brandNames?: string[]
): { type: AppearanceType; position: number | null; urls: string[]; evidence: string[] } {
  const targetKey = aliasKey(targetBrand);
  const target = (q.brandMentions || []).find(bm => bm.mentioned && aliasKey(bm.brand) === targetKey);
  const brandSources = (q.sources || []).filter(s => sourceBelongsToBrand(s, brandDomain));
  const blogSource = brandSources.find(s => isBrandBlog(s, brandDomain));
  let type: AppearanceType = 'no_aparece';
  if (blogSource) type = 'citacion_blog';
  else if (brandSources.length > 0) type = 'citacion_com';
  else if (target) type = 'mencion';
  // Blog primero para que la URL más relevante encabece el desglose.
  const ordered = blogSource ? [blogSource, ...brandSources.filter(s => s !== blogSource)] : brandSources;
  const urls = Array.from(new Set(ordered.map(s => s.url).filter(Boolean)));
  return { type, position: target?.appearanceOrder || null, urls, evidence: verifiedEvidence(q, target, brandNames || [targetBrand]) };
}

// === Matriz de GAPS (prompt × fecha) ===

export interface GapCell {
  type: AppearanceType;
  position: number | null;
  urls?: string[];      // URLs del dominio de marca citadas como fuente
  evidence?: string[];  // frases donde la IA menciona la marca
}
export interface GapRow {
  promptKey: string;
  prompt: string;
  category?: string;
  cells: Record<string, GapCell>; // por analysisId
  competitors: string[];          // competidores que aparecen (en cualquier análisis)
  absentCount: number;            // nº de análisis donde la marca no aparece (severidad)
  absentLatest: boolean;          // no aparece en el análisis más reciente
}
export interface GapsMatrix {
  /**
   * Una columna por análisis. `model` desambigua: cuando un proyecto lanza
   * varios modelos el mismo día, la fecha sola produce columnas idénticas e
   * indistinguibles. `labelWithModel` es la etiqueta lista para mostrar.
   */
  columns: { id: string; label: string; date: string; model: string; labelWithModel: string }[];
  rows: GapRow[];
  allCompetitors: string[];
}

/** Empareja prompts por texto normalizado y construye la matriz prompt × análisis. */
export function buildGapsMatrix(analyses: AnalysisDetail[], targetBrand: string, brandDomain: string, brandNames?: string[]): GapsMatrix {
  const sorted = sortByDate(analyses);
  // Si todos los análisis son del mismo modelo, añadirlo a cada columna solo
  // añade ruido: se incluye únicamente cuando hay más de uno que distinguir.
  const modelosDistintos = modelsInAnalyses(sorted);
  const columns = sorted.map(a => {
    const label = dateLabel(a.timestamp);
    const model = analysisModelLabel(a);
    return {
      id: a.id,
      label,
      date: a.timestamp,
      model,
      labelWithModel: modelosDistintos.length > 1 ? `${label} · ${model}` : label,
    };
  });
  const targetKey = aliasKey(targetBrand);
  const rowMap = new Map<string, GapRow>();
  const order: string[] = [];

  sorted.forEach(a => {
    (a.results?.questions || []).forEach(q => {
      const key = (q.question || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key) return;
      if (!rowMap.has(key)) {
        rowMap.set(key, { promptKey: key, prompt: q.question, category: q.category, cells: {}, competitors: [], absentCount: 0, absentLatest: false });
        order.push(key);
      }
      const row = rowMap.get(key)!;
      const cls = classifyQuestionForBrand(q, targetBrand, brandDomain, brandNames);
      row.cells[a.id] = { type: cls.type, position: cls.position, urls: cls.urls, evidence: cls.evidence };
      (q.brandMentions || []).forEach(bm => {
        if (!bm.mentioned || aliasKey(bm.brand) === targetKey) return;
        if (!row.competitors.includes(bm.brand)) row.competitors.push(bm.brand);
      });
    });
  });

  const latestId = columns.length ? columns[columns.length - 1].id : null;
  const allComp = new Set<string>();
  const rows = order.map(k => {
    const row = rowMap.get(k)!;
    row.absentCount = columns.reduce((n, c) => n + ((!row.cells[c.id] || row.cells[c.id].type === 'no_aparece') ? 1 : 0), 0);
    row.absentLatest = !latestId || !row.cells[latestId] || row.cells[latestId].type === 'no_aparece';
    row.competitors.forEach(c => allComp.add(c));
    return row;
  });
  rows.sort((a, b) => b.absentCount - a.absentCount); // severidad: más ausencias primero
  return { columns, rows, allCompetitors: Array.from(allComp).sort() };
}

// === Vista por competencia (Hito 4) ===

export interface CompetitorPos { brand: string; position: number | null; }
export interface CompetitiveRow {
  prompt: string;
  category?: string;
  type: AppearanceType;        // tipo de aparición de la marca
  position: number | null;     // posición de la marca
  isFirst: boolean;            // la marca ocupa el nº1
  competitors: CompetitorPos[]; // competidores presentes, ordenados por posición
  urls: string[];              // URLs del dominio de marca citadas como fuente
  evidence: string[];          // frases donde la IA menciona la marca
}

/** Sobre un análisis concreto: posición de la marca y competidores por prompt. */
export function buildCompetitiveView(
  analysis: AnalysisDetail | null | undefined,
  targetBrand: string,
  brandDomain: string,
  brandNames?: string[]
): { rows: CompetitiveRow[]; competitors: string[] } {
  if (!analysis) return { rows: [], competitors: [] };
  const targetKey = aliasKey(targetBrand);
  const allComp = new Set<string>();
  const rows: CompetitiveRow[] = (analysis.results?.questions || []).map(q => {
    const cls = classifyQuestionForBrand(q, targetBrand, brandDomain, brandNames);
    const competitors = (q.brandMentions || [])
      .filter(bm => bm.mentioned && aliasKey(bm.brand) !== targetKey)
      .map(bm => ({ brand: bm.brand, position: bm.appearanceOrder || null }))
      .sort((a, b) => (a.position || 999) - (b.position || 999));
    competitors.forEach(c => allComp.add(c.brand));
    return {
      prompt: q.question, category: q.category, type: cls.type, position: cls.position,
      isFirst: cls.position === 1, competitors, urls: cls.urls, evidence: cls.evidence,
    };
  });
  // Peores primero: no aparece, luego peor posición
  const worseness = (r: CompetitiveRow) => (r.type === 'no_aparece' ? 9999 : (r.position || 999));
  rows.sort((a, b) => worseness(b) - worseness(a));
  return { rows, competitors: Array.from(allComp).sort() };
}

export interface BrandAppearanceCounts {
  mentionedResponses: number; // respuestas donde la marca aparece nombrada
  citacionCom: number;        // fuentes que enlazan al dominio de marca (no blog)
  citacionBlog: number;       // fuentes que enlazan al blog de la marca
  posSum: number;
  posCount: number;
}

/** Cuenta menciones/citaciones de la marca objetivo en un conjunto de análisis. */
export function countBrandAppearances(
  analyses: AnalysisDetail[],
  targetBrand: string,
  brandDomain: string
): BrandAppearanceCounts {
  const targetKey = aliasKey(targetBrand);
  const acc: BrandAppearanceCounts = { mentionedResponses: 0, citacionCom: 0, citacionBlog: 0, posSum: 0, posCount: 0 };

  analyses.forEach(a => {
    (a.results?.questions || []).forEach(q => {
      const target = (q.brandMentions || []).find(bm => bm.mentioned && aliasKey(bm.brand) === targetKey);
      if (target) {
        acc.mentionedResponses++;
        if (target.appearanceOrder && target.appearanceOrder > 0) {
          acc.posSum += target.appearanceOrder;
          acc.posCount++;
        }
      }
      (q.sources || []).forEach(s => {
        if (!sourceBelongsToBrand(s, brandDomain)) return;
        if (isBrandBlog(s, brandDomain)) acc.citacionBlog++;
        else acc.citacionCom++;
      });
    });
  });
  return acc;
}
