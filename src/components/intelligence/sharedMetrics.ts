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
  const lower = brand.toLowerCase().replace(/[\s\-_]+/g, '');
  for (const cb of configuredBrands) {
    if (cb.toLowerCase().replace(/[\s\-_]+/g, '') === lower) return cb;
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
  brandDomain: string
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
        phrase: target?.evidence?.[0],
        model: modelLabel(q.multiModelAnalysis?.[0]),
      });
    });
  });
  return rows;
}

/** Clasifica la aparición de la marca objetivo en una pregunta (incluye 'no_aparece'). */
export function classifyQuestionForBrand(
  q: QuestionAnalysis,
  targetBrand: string,
  brandDomain: string
): { type: AppearanceType; position: number | null } {
  const targetKey = aliasKey(targetBrand);
  const target = (q.brandMentions || []).find(bm => bm.mentioned && aliasKey(bm.brand) === targetKey);
  const brandSources = (q.sources || []).filter(s => sourceBelongsToBrand(s, brandDomain));
  const blogSource = brandSources.find(s => isBrandBlog(s, brandDomain));
  let type: AppearanceType = 'no_aparece';
  if (blogSource) type = 'citacion_blog';
  else if (brandSources.length > 0) type = 'citacion_com';
  else if (target) type = 'mencion';
  return { type, position: target?.appearanceOrder || null };
}

// === Matriz de GAPS (prompt × fecha) ===

export interface GapCell { type: AppearanceType; position: number | null; }
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
  columns: { id: string; label: string; date: string }[];
  rows: GapRow[];
  allCompetitors: string[];
}

/** Empareja prompts por texto normalizado y construye la matriz prompt × análisis. */
export function buildGapsMatrix(analyses: AnalysisDetail[], targetBrand: string, brandDomain: string): GapsMatrix {
  const sorted = sortByDate(analyses);
  const columns = sorted.map(a => ({ id: a.id, label: dateLabel(a.timestamp), date: a.timestamp }));
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
      const cls = classifyQuestionForBrand(q, targetBrand, brandDomain);
      row.cells[a.id] = { type: cls.type, position: cls.position };
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
}

/** Sobre un análisis concreto: posición de la marca y competidores por prompt. */
export function buildCompetitiveView(
  analysis: AnalysisDetail | null | undefined,
  targetBrand: string,
  brandDomain: string
): { rows: CompetitiveRow[]; competitors: string[] } {
  if (!analysis) return { rows: [], competitors: [] };
  const targetKey = aliasKey(targetBrand);
  const allComp = new Set<string>();
  const rows: CompetitiveRow[] = (analysis.results?.questions || []).map(q => {
    const cls = classifyQuestionForBrand(q, targetBrand, brandDomain);
    const competitors = (q.brandMentions || [])
      .filter(bm => bm.mentioned && aliasKey(bm.brand) !== targetKey)
      .map(bm => ({ brand: bm.brand, position: bm.appearanceOrder || null }))
      .sort((a, b) => (a.position || 999) - (b.position || 999));
    competitors.forEach(c => allComp.add(c.brand));
    return { prompt: q.question, category: q.category, type: cls.type, position: cls.position, isFirst: cls.position === 1, competitors };
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
