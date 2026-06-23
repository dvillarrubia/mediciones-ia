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
