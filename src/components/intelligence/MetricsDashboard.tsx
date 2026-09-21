import React, { useMemo, useState } from 'react';
import {
  Award, ArrowUp, TrendingUp, TrendingDown, CheckCircle2,
  Globe, Users, Minus, Download, BarChart3
} from 'lucide-react';
import InfoTip from './InfoTip';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import BrandPositionChart from './charts/BrandPositionChart';
import {
  countBrandAppearances,
  buildModelVisibility,
  buildPositionDistribution,
  POSITION_BUCKETS,
  POSITION_COLORS,
  sentimentToNumeric,
  fmtSentiment,
  COLORS,
  normalizeBrandName,
  isRealDomain,
  buildPositionByModelOverTime,
  modelosDelRango,
  latestAnalysisPerModel,
  groupAnalysesByModel,
  analysisModelKey,
  poolWeightedMean,
  type AnalysisDetail as SharedAnalysisDetail,
  modelsInAnalysesBy,
  SNAPSHOT_FRESHNESS_DAYS,
  type ModelGranularity,
} from './sharedMetrics';
import { DateRangeFilter, filterAnalysesByDateRange, ModelGranularityToggle } from './dashboardFilters';
import { exportSheetsToExcel, downloadFilename } from './dashboardExcelExport';

// Re-use types from IntelligenceHub
interface BrandMention {
  brand: string;
  mentioned: boolean;
  frequency: number;
  context: string;
  evidence?: string[];
  appearanceOrder?: number;
  isDiscovered?: boolean;
  detailedSentiment?: string;
}

interface QuestionAnalysis {
  questionId: string;
  question: string;
  category: string;
  summary: string;
  sources: { url: string; title: string; snippet: string; domain: string; isPriority: boolean }[];
  brandMentions: BrandMention[];
  sentiment: string;
  confidenceScore: number;
}

interface AnalysisDetail {
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
    totalSources: number;
    prioritySources: number;
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

interface Props {
  analyses: AnalysisDetail[];
  loading?: boolean;
  brandDomain?: string;
  brandBlogPattern?: string;
}

// === CALCULATION ===

/** Nombre de la serie agregada en los gráficos con desglose por modelo. */
const TOTAL_KEY = 'Total';

interface SovItem {
  brand: string;
  mentions: number;
  percentage: number;
  sentimentScore: number;
  isTarget: boolean;
}

interface DomainRank {
  domain: string;
  count: number;
  percentage: number;
}

interface CategoryMetric {
  category: string;
  count: number;
  avgSentiment: number;
  avgConfidence: number;
}

interface DiscoveredBrand {
  brand: string;
  frequency: number;
  sentiment: number;
}

interface CategoryBrandMention {
  category: string;
  totalQuestions: number;
  brands: Record<string, { mentions: number; percentage: number; avgSentiment: number }>;
}

interface CurrentState {
  targetBrand: string;
  shareOfVoice: SovItem[];
  avgAppearanceOrder: number | null;
  netSentimentScore: number;
  aiConfidence: number;
  discoveredBrands: DiscoveredBrand[];
  topDomains: DomainRank[];
  categoryBreakdown: CategoryMetric[];
  categoryBrandMentions: CategoryBrandMention[];
  totalMentions: number;
}

interface HistoricalPoint {
  date: string;
  label: string;
  analysisId: string;
  /** Modelo con el que corrió este análisis, según la granularidad activa. */
  modelKey: string;
  sovByBrand: Record<string, number>;
  avgAppearanceOrder: number | null;
  sentimentScore: number;
  confidence: number;
  // Componentes crudos para poder agregar varios análisis del mismo día sin
  // promediar porcentajes ya calculados.
  mentionsByBrand: Record<string, number>;
  totalMentionsAll: number;
  orderSum: number;
  orderCount: number;
  sentSum: number;
  sentCount: number;
  questionCount: number;
}

/** Una fecha del eje X con una columna por modelo más el total pooled. */
interface TrendRow {
  label: string;
  date: string;
  [modelOrTotal: string]: string | number | null;
}

/** Fotografía de un solo modelo, para el desglose. */
interface ModelBreakdown {
  modelKey: string;
  timestamp: string;
  staleDays: number;
  state: CurrentState;
}

/**
 * Calcula la "fotografía" a partir de un conjunto de preguntas ya agregado.
 *
 * Recibe las preguntas en vez de un análisis porque la fotografía del total
 * agrupa las del último análisis de CADA modelo: sumar aquí numeradores y
 * denominadores es lo que hace que los porcentajes sean pooled y no una media
 * de las medias por modelo.
 */
function buildCurrentState(
  questions: QuestionAnalysis[],
  targetBrand: string,
  competitors: string[],
  aiConfidence: number,
): CurrentState {
  // Build canonical brand list for normalization
  const configuredBrandsList = [targetBrand, ...competitors];
  const configuredSet = new Set(configuredBrandsList.map(b => b.toLowerCase()));

  // SoV
  const brandAcc: Record<string, { mentions: number; sentSum: number; sentCount: number; isTarget: boolean }> = {};
  const domainAcc: Record<string, number> = {};
  const catAcc: Record<string, { count: number; sentSum: number; confSum: number }> = {};
  const discoveredMap: Record<string, { freq: number; sentSum: number; count: number }> = {};
  let targetOrderSum = 0, targetOrderCount = 0;

  questions.forEach(q => {
    // Categories
    const cat = q.category || 'Sin categoría';
    if (!catAcc[cat]) catAcc[cat] = { count: 0, sentSum: 0, confSum: 0 };
    catAcc[cat].count++;
    catAcc[cat].sentSum += sentimentToNumeric(q.sentiment);
    catAcc[cat].confSum += q.confidenceScore || 0;

    // Domains
    (q.sources || []).forEach(s => {
      if (isRealDomain(s.domain)) domainAcc[s.domain] = (domainAcc[s.domain] || 0) + 1;
    });

    // Brands
    // La posición del target se toma una vez por pregunta (la mejor), no por entrada:
    // el glosario de alias puede dejar varias entradas de la misma marca en una pregunta.
    let qTargetOrder: number | null = null;
    (q.brandMentions || []).forEach(bm => {
      if (!bm.mentioned || bm.frequency <= 0) return;
      const brandName = normalizeBrandName(bm.brand, configuredBrandsList);
      const isTarget = brandName.toLowerCase() === targetBrand.toLowerCase();

      if (!brandAcc[brandName]) brandAcc[brandName] = { mentions: 0, sentSum: 0, sentCount: 0, isTarget };
      brandAcc[brandName].mentions += bm.frequency;
      brandAcc[brandName].sentSum += sentimentToNumeric(bm.detailedSentiment || bm.context);
      brandAcc[brandName].sentCount++;

      if (isTarget && bm.appearanceOrder && bm.appearanceOrder > 0) {
        qTargetOrder = qTargetOrder === null ? bm.appearanceOrder : Math.min(qTargetOrder, bm.appearanceOrder);
      }

      // Una marca configurada no es "descubierta" aunque la IA la marque así
      // (pasa cuando el glosario canonicaliza una variante descubierta).
      if (bm.isDiscovered && !configuredSet.has(brandName.toLowerCase())) {
        if (!discoveredMap[brandName]) discoveredMap[brandName] = { freq: 0, sentSum: 0, count: 0 };
        discoveredMap[brandName].freq += bm.frequency;
        discoveredMap[brandName].sentSum += sentimentToNumeric(bm.detailedSentiment || bm.context);
        discoveredMap[brandName].count++;
      }
    });
    if (qTargetOrder !== null) {
      targetOrderSum += qTargetOrder;
      targetOrderCount++;
    }
  });

  const totalMentions = Object.values(brandAcc).reduce((s, b) => s + b.mentions, 0);

  const shareOfVoice: SovItem[] = Object.entries(brandAcc)
    .map(([brand, d]) => ({
      brand,
      mentions: d.mentions,
      percentage: totalMentions > 0 ? (d.mentions / totalMentions) * 100 : 0,
      sentimentScore: d.sentCount > 0 ? d.sentSum / d.sentCount : 0,
      isTarget: d.isTarget,
    }))
    .sort((a, b) => b.mentions - a.mentions);

  const targetSov = shareOfVoice.find(s => s.isTarget);

  const totalDomainRefs = Object.values(domainAcc).reduce((s, c) => s + c, 0);
  const topDomains: DomainRank[] = Object.entries(domainAcc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count, percentage: totalDomainRefs > 0 ? (count / totalDomainRefs) * 100 : 0 }));

  const categoryBreakdown: CategoryMetric[] = Object.entries(catAcc)
    .map(([category, d]) => ({
      category,
      count: d.count,
      avgSentiment: d.count > 0 ? d.sentSum / d.count : 0,
      avgConfidence: d.count > 0 ? d.confSum / d.count : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const discoveredBrands: DiscoveredBrand[] = Object.entries(discoveredMap)
    .map(([brand, d]) => ({
      brand,
      frequency: d.freq,
      sentiment: d.count > 0 ? d.sentSum / d.count : 0,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 15);

  // Category × Brand mentions
  const catBrandAcc: Record<string, { total: number; brands: Record<string, { count: number; sentSum: number; sentCount: number }> }> = {};
  const configuredBrands = configuredSet;

  questions.forEach(q => {
    const cat = q.category || 'Sin categoría';
    if (!catBrandAcc[cat]) catBrandAcc[cat] = { total: 0, brands: {} };
    catBrandAcc[cat].total++;

    // count = preguntas distintas donde aparece la marca (una pregunta puede traer
    // varias entradas de la misma marca tras aplicar alias); así el % nunca supera 100.
    const seenInQuestion = new Set<string>();
    (q.brandMentions || []).forEach(bm => {
      if (!bm.mentioned) return;
      const brandName = normalizeBrandName(bm.brand, configuredBrandsList);
      // Only include target + configured competitors (skip discovered brands)
      if (!configuredBrands.has(brandName.toLowerCase())) return;

      if (!catBrandAcc[cat].brands[brandName]) catBrandAcc[cat].brands[brandName] = { count: 0, sentSum: 0, sentCount: 0 };
      if (!seenInQuestion.has(brandName)) {
        catBrandAcc[cat].brands[brandName].count++;
        seenInQuestion.add(brandName);
      }
      catBrandAcc[cat].brands[brandName].sentSum += sentimentToNumeric(bm.detailedSentiment || bm.context);
      catBrandAcc[cat].brands[brandName].sentCount++;
    });
  });

  const categoryBrandMentions: CategoryBrandMention[] = Object.entries(catBrandAcc)
    .map(([category, d]) => ({
      category,
      totalQuestions: d.total,
      brands: Object.fromEntries(
        Object.entries(d.brands).map(([brand, info]) => [
          brand,
          {
            mentions: info.count,
            percentage: d.total > 0 ? (info.count / d.total) * 100 : 0,
            avgSentiment: info.sentCount > 0 ? info.sentSum / info.sentCount : 0,
          },
        ])
      ),
    }))
    .sort((a, b) => b.totalQuestions - a.totalQuestions);

  const currentState: CurrentState = {
    targetBrand,
    shareOfVoice,
    avgAppearanceOrder: targetOrderCount > 0 ? targetOrderSum / targetOrderCount : null,
    netSentimentScore: targetSov?.sentimentScore || 0,
    aiConfidence,
    discoveredBrands,
    topDomains,
    categoryBreakdown,
    categoryBrandMentions,
    totalMentions,
  };
  return currentState;
}

function calculateMetrics(analyses: AnalysisDetail[], granularity: ModelGranularity) {
  if (analyses.length === 0) return null;

  const sorted = [...analyses].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const targetBrand = latest.configuration.brand;
  const competitors = latest.configuration.competitors;
  const configuredBrandsList = [targetBrand, ...competitors];

  // === FOTOGRAFÍA ACTUAL ===
  // El último análisis de CADA modelo, no el último a secas: con una
  // automatización por modelo, `sorted[length - 1]` es solo la del modelo que
  // acabó más tarde ese día, y la fotografía entera salía de un único modelo.
  const snapshots = latestAnalysisPerModel(sorted, granularity, {
    freshnessDays: SNAPSHOT_FRESHNESS_DAYS,
  });
  const snapshotAnalyses = snapshots.map(s => s.analysis);
  const questions = snapshotAnalyses.flatMap(a => a.results?.questions || []);

  // Confianza pooled: ponderada por nº de preguntas de cada análisis. Promediar
  // los `overallConfidence` daría el mismo peso a un modelo con 32 preguntas
  // que a uno con 12.
  const aiConfidence = poolWeightedMean(
    snapshotAnalyses.map(a => {
      const n = (a.results?.questions || []).length;
      return { sum: (a.results?.overallConfidence || 0) * n, n };
    })
  ) || 0;

  const currentState = buildCurrentState(questions, targetBrand, competitors, aiConfidence);

  // Mismo cálculo por modelo, para el desglose que abre la fotografía.
  const currentByModel: ModelBreakdown[] = snapshots.map(s => ({
    modelKey: s.modelKey,
    timestamp: s.analysis.timestamp,
    staleDays: s.staleDays,
    state: buildCurrentState(
      s.analysis.results?.questions || [],
      targetBrand,
      competitors,
      s.analysis.results?.overallConfidence || 0,
    ),
  }));


  // === HISTORICAL ===
  const historicalTrend: HistoricalPoint[] = sorted.map(analysis => {
    const qs = analysis.results?.questions || [];
    const brand = analysis.configuration.brand;
    const hBrand: Record<string, { mentions: number; total: number }> = {};
    let hOrderSum = 0, hOrderCount = 0;
    let hSentSum = 0, hSentCount = 0;

    qs.forEach(q => {
      let qOrder: number | null = null;
      (q.brandMentions || []).forEach(bm => {
        if (!bm.mentioned || bm.frequency <= 0) return;
        const bmName = normalizeBrandName(bm.brand, configuredBrandsList);
        if (!hBrand[bmName]) hBrand[bmName] = { mentions: 0, total: 0 };
        hBrand[bmName].mentions += bm.frequency;

        if (bmName.toLowerCase() === brand.toLowerCase()) {
          hSentSum += sentimentToNumeric(bm.detailedSentiment || bm.context);
          hSentCount++;
          if (bm.appearanceOrder && bm.appearanceOrder > 0) {
            qOrder = qOrder === null ? bm.appearanceOrder : Math.min(qOrder, bm.appearanceOrder);
          }
        }
      });
      if (qOrder !== null) {
        hOrderSum += qOrder;
        hOrderCount++;
      }
    });

    const hTotal = Object.values(hBrand).reduce((s, b) => s + b.mentions, 0);
    const sovByBrand: Record<string, number> = {};
    Object.entries(hBrand).forEach(([b, d]) => {
      sovByBrand[b] = hTotal > 0 ? (d.mentions / hTotal) * 100 : 0;
    });

    const mentionsByBrand: Record<string, number> = {};
    Object.entries(hBrand).forEach(([b, d]) => { mentionsByBrand[b] = d.mentions; });

    return {
      date: analysis.timestamp,
      label: new Date(analysis.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      analysisId: analysis.id,
      modelKey: analysisModelKey(analysis, granularity),
      sovByBrand,
      avgAppearanceOrder: hOrderCount > 0 ? hOrderSum / hOrderCount : null,
      sentimentScore: hSentCount > 0 ? hSentSum / hSentCount : 0,
      confidence: analysis.results?.overallConfidence || 0,
      mentionsByBrand,
      totalMentionsAll: hTotal,
      orderSum: hOrderSum,
      orderCount: hOrderCount,
      sentSum: hSentSum,
      sentCount: hSentCount,
      questionCount: qs.length,
    };
  });

  // Modelos presentes en el histórico, en orden estable, para que las series
  // no bailen de color entre renders.
  const trendModels = modelsInAnalysesBy(sorted, granularity).map(m => m.key);

  /**
   * Convierte el histórico (un punto por análisis) en un punto por FECHA con una
   * columna por modelo y otra de total pooled.
   *
   * Antes había N puntos consecutivos con la misma etiqueta de día, uno por
   * modelo, y la línea zigzagueaba entre modelos como si fuera evolución.
   *
   * `valor` saca numerador y denominador de cada análisis; el total los suma y
   * divide una vez. `null` cuando un modelo no corrió ese día: con 0, una línea
   * de posición se desplomaría al mejor puesto posible.
   */
  const pivotByDate = (
    valor: (h: HistoricalPoint) => { num: number; den: number },
  ): TrendRow[] => {
    const porFecha = new Map<string, HistoricalPoint[]>();
    historicalTrend.forEach(h => {
      if (!porFecha.has(h.label)) porFecha.set(h.label, []);
      porFecha.get(h.label)!.push(h);
    });

    return Array.from(porFecha.entries()).map(([label, puntos]) => {
      const fila: TrendRow = { label, date: puntos[0].date };
      trendModels.forEach(m => {
        const delModelo = puntos.filter(p => p.modelKey === m).map(valor);
        const den = delModelo.reduce((s, v) => s + v.den, 0);
        fila[m] = den > 0 ? delModelo.reduce((s, v) => s + v.num, 0) / den : null;
      });
      const todos = puntos.map(valor);
      const denTotal = todos.reduce((s, v) => s + v.den, 0);
      fila[TOTAL_KEY] = denTotal > 0 ? todos.reduce((s, v) => s + v.num, 0) / denTotal : null;
      return fila;
    });
  };

  const positionTrend = pivotByDate(h => ({ num: h.orderSum, den: h.orderCount }));
  const sentimentTrend = pivotByDate(h => ({ num: h.sentSum, den: h.sentCount }));

  return { currentState, currentByModel, historicalTrend, trendModels, positionTrend, sentimentTrend };
}

// === COMPONENTS ===

// Colores por ángulo áureo: distinguibles entre sí para cualquier nº de series.
const goldenColor = (i: number) => `hsl(${Math.round((i * 137.508) % 360)}, 62%, 42%)`;

// Tooltip con las series ordenadas por valor descendente (el orden visual de las líneas).
const SortedPctTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const items = [...payload].sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0));
  const fmt = (v: any) => (Number(v) % 1 === 0 ? `${v}%` : `${Number(v).toFixed(1)}%`);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[220px]">
      <p className="font-semibold text-gray-900 text-sm mb-2">{label}</p>
      {items.map((e: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-xs text-gray-700">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.stroke || e.color }} />
            {e.name}
          </span>
          <span className="text-xs font-semibold text-gray-900">{fmt(e.value)}</span>
        </div>
      ))}
    </div>
  );
};

// Leyenda propia de chips clicables (mostrar/ocultar serie), fuera del área de dibujo.
const ChipLegend: React.FC<{
  items: string[];
  colorOf: Record<string, string>;
  hidden: string[];
  onToggle: (item: string) => void;
  bold?: (item: string) => boolean;
}> = ({ items, colorOf, hidden, onToggle, bold }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100">
    {items.map(item => {
      const off = hidden.includes(item);
      return (
        <button
          key={item}
          onClick={() => onToggle(item)}
          className={`inline-flex items-center gap-1.5 text-xs transition-colors ${off ? 'text-gray-300 line-through' : 'text-gray-700 hover:text-gray-900'} ${bold?.(item) && !off ? 'font-semibold' : ''}`}
          title={off ? 'Mostrar' : 'Ocultar'}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: off ? '#d1d5db' : colorOf[item] }} />
          {item}
        </button>
      );
    })}
  </div>
);

const KpiCard: React.FC<{ label: string; value: string; icon: React.ReactNode; color: string; subtitle?: string; info?: string }> = ({ label, value, icon, color, subtitle, info }) => (
  <div className={`bg-white rounded-xl shadow-sm border p-5`}>
    <div className="flex items-center gap-3 mb-2">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <span className="text-sm text-gray-500 inline-flex items-center gap-1.5">{label}{info && <InfoTip text={info} />}</span>
    </div>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
    {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
  </div>
);

const MetricsDashboard: React.FC<Props> = ({ analyses, loading, brandDomain, brandBlogPattern }) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [trendBrand, setTrendBrand] = useState('');
  // Por familia es el defecto: es la única clave de modelo estable en el tiempo.
  const [modelGranularity, setModelGranularity] = useState<ModelGranularity>('persona');
  const [showModelBreakdown, setShowModelBreakdown] = useState(false);
  const [hiddenCats, setHiddenCats] = useState<string[]>([]);
  const [hiddenSovBrands, setHiddenSovBrands] = useState<string[]>([]);

  const scoped = useMemo(
    () => filterAnalysesByDateRange(analyses || [], dateFrom, dateTo),
    [analyses, dateFrom, dateTo]
  );

  const metrics = useMemo(() => calculateMetrics(scoped, modelGranularity), [scoped, modelGranularity]);

  // Evolución de menciones por categoría (topics): % de preguntas de cada categoría
  // donde la marca seleccionada es mencionada, un punto por análisis.
  const categoryTrend = useMemo(() => {
    if (!scoped || scoped.length < 2) return null;
    const sorted = [...scoped].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const latest = sorted[sorted.length - 1];
    const brandOptions = [latest.configuration.brand, ...latest.configuration.competitors];
    const brand = brandOptions.includes(trendBrand) ? trendBrand : latest.configuration.brand;
    // Solo las categorías del análisis más reciente: si la taxonomía de topics cambió
    // con el tiempo, las categorías retiradas ensuciarían la gráfica con líneas muertas.
    const latestCatCount: Record<string, number> = {};
    (latest.results?.questions || []).forEach(q => {
      const cat = q.category || 'Sin categoría';
      latestCatCount[cat] = (latestCatCount[cat] || 0) + 1;
    });
    const categories = Object.entries(latestCatCount).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const catSet = new Set(categories);
    // Un punto por FECHA, no por análisis: con una automatización por modelo
    // había tres puntos seguidos con la misma etiqueta de día. Se acumulan las
    // preguntas de todos los modelos del día y se divide una sola vez, así que
    // el % es sobre el total de respuestas de ese día.
    const porFecha = new Map<string, { modelos: Set<string>; acc: Record<string, { total: number; hit: number }> }>();
    sorted.forEach(a => {
      const label = new Date(a.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      if (!porFecha.has(label)) porFecha.set(label, { modelos: new Set(), acc: {} });
      const dia = porFecha.get(label)!;
      dia.modelos.add(analysisModelKey(a as unknown as SharedAnalysisDetail, modelGranularity));
      (a.results?.questions || []).forEach(q => {
        const cat = q.category || 'Sin categoría';
        if (!catSet.has(cat)) return;
        if (!dia.acc[cat]) dia.acc[cat] = { total: 0, hit: 0 };
        dia.acc[cat].total++;
        const mentioned = (q.brandMentions || []).some(bm =>
          bm.mentioned && normalizeBrandName(bm.brand, brandOptions).toLowerCase() === brand.toLowerCase()
        );
        if (mentioned) dia.acc[cat].hit++;
      });
    });

    const points = Array.from(porFecha.entries()).map(([label, dia]) => {
      const row: Record<string, any> = { label, modelos: dia.modelos.size };
      Object.entries(dia.acc).forEach(([cat, d]) => {
        row[cat] = d.total > 0 ? Math.round((d.hit / d.total) * 100) : 0;
      });
      return row;
    });
    return { points, categories, brand, brandOptions };
  }, [scoped, trendBrand, modelGranularity]);

  // KPIs de menciones/citaciones con delta vs análisis anterior (Hito 2)
  const mentionKpis = useMemo(() => {
    if (!scoped || scoped.length === 0) return null;
    const sorted = [...scoped].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const target = sorted[sorted.length - 1].configuration.brand;

    // Actual: el último análisis de cada modelo, agregado.
    const snapshots = latestAnalysisPerModel(sorted, modelGranularity, {
      freshnessDays: SNAPSHOT_FRESHNESS_DAYS,
    });
    const curAnalyses = snapshots.map(s => s.analysis);
    const cur = countBrandAppearances(curAnalyses as any, target, brandDomain || '', brandBlogPattern);

    // Anterior: la ejecución PREVIA DE CADA MODELO, no el análisis anterior por
    // fecha. Con una automatización por modelo, el anterior por fecha es otro
    // modelo del mismo día, así que el delta mostraba la diferencia entre
    // Gemini y Claude con pinta de evolución temporal.
    const porModelo = groupAnalysesByModel(sorted, modelGranularity);
    const prevAnalyses = snapshots
      .map(s => {
        const list = porModelo.get(s.modelKey) || [];
        return list.length > 1 ? list[list.length - 2] : null;
      })
      .filter((a): a is AnalysisDetail => a !== null);
    const prev = prevAnalyses.length > 0
      ? countBrandAppearances(prevAnalyses as any, target, brandDomain || '', brandBlogPattern)
      : null;

    // El delta solo es comparable si TODOS los modelos de la fotografía tienen
    // ejecución previa; si no, cur suma 3 modelos y prev 2.
    const deltaComparable = prevAnalyses.length === snapshots.length;

    return {
      cur,
      prev: deltaComparable ? prev : null,
      hasDomain: !!brandDomain,
      totalQuestions: curAnalyses.reduce((n, a) => n + (a.results?.questions?.length || 0), 0),
      modelCount: snapshots.length,
    };
  }, [scoped, brandDomain, brandBlogPattern, modelGranularity]);

  // Visibilidad por modelo (Hito 6.1 — GEO)
  const modelVis = useMemo(() => {
    if (!scoped || scoped.length === 0) return [];
    const sorted = [...scoped].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return buildModelVisibility(scoped as any, sorted[sorted.length - 1].configuration.brand);
  }, [scoped]);

  // Tracking de posición POR MODELO (petición de Salto: una línea por modelo).
  // Se calcula aparte de posDist porque aquella agrega todos los modelos en una
  // sola serie, que es justo lo que los usuarios pedían dejar de ver.
  const posPorModelo = useMemo(() => {
    if (!scoped || scoped.length === 0) return { rows: [], models: [] };
    // La marca sale del propio rango, no de `cs`: este hook corre antes de que
    // `metrics` esté disponible. Mismo patrón que posDist.
    const sorted = [...scoped].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return buildPositionByModelOverTime(scoped as unknown as AnalysisDetail[], sorted[sorted.length - 1].configuration.brand);
  }, [scoped]);

  // Distribución de posición (Hito 5)
  const posDist = useMemo(() => {
    if (!scoped || scoped.length === 0) return null;
    const sorted = [...scoped].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return buildPositionDistribution(scoped as any, sorted[sorted.length - 1].configuration.brand);
  }, [scoped]);

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl shadow-sm border p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-32 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="space-y-4">
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={({ dateFrom, dateTo }) => { setDateFrom(dateFrom); setDateTo(dateTo); }}
          count={scoped.length}
          total={analyses?.length}
        />
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">Sin datos de métricas</h3>
          <p className="text-gray-500">
            {analyses?.length ? 'No hay análisis en el rango de fechas seleccionado.' : 'Ejecuta al menos un análisis para ver métricas cuantitativas.'}
          </p>
        </div>
      </div>
    );
  }

  const { currentState: cs, currentByModel: cbm, historicalTrend: ht, trendModels, positionTrend, sentimentTrend } = metrics;
  // Color por familia, compartido con los gráficos por modelo.
  const modelColors = Object.fromEntries(
    modelsInAnalysesBy(scoped, modelGranularity).map(m => [m.key, m.color])
  );
  const targetSov = cs.shareOfVoice.find(s => s.isTarget);

  // Prepare historical SoV data for area chart
  const allBrandsInHistory = new Set<string>();
  ht.forEach(h => Object.keys(h.mentionsByBrand).forEach(b => allBrandsInHistory.add(b)));

  // El ranking se hace sobre menciones absolutas, no sumando porcentajes de
  // cada análisis: sumar SoV daba más peso a las fechas con más modelos.
  const topBrands = [...allBrandsInHistory]
    .map(b => ({ brand: b, total: ht.reduce((s, h) => s + (h.mentionsByBrand[b] || 0), 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map(b => b.brand);

  // Este gráfico ya tiene una serie por marca: añadirle el modelo lo haría
  // ilegible (8 marcas × 3 modelos). Lo que se corrige es el eje X, que tenía
  // un punto por análisis y por tanto varios puntos con la misma fecha. Ahora
  // cada fecha es un punto que agrupa todos los modelos que corrieron ese día,
  // sumando menciones y dividiendo una sola vez.
  const sovAreaData = (() => {
    const porFecha = new Map<string, HistoricalPoint[]>();
    ht.forEach(h => {
      if (!porFecha.has(h.label)) porFecha.set(h.label, []);
      porFecha.get(h.label)!.push(h);
    });
    return Array.from(porFecha.entries()).map(([label, puntos]) => {
      const point: Record<string, any> = { label, modelos: puntos.length };
      const totalDia = puntos.reduce((s, h) => s + h.totalMentionsAll, 0);
      topBrands.forEach(b => {
        const marca = puntos.reduce((s, h) => s + (h.mentionsByBrand[b] || 0), 0);
        point[b] = totalDia > 0 ? +((marca / totalDia) * 100).toFixed(1) : 0;
      });
      return point;
    });
  })();

  // Brand position scatter data
  const scatterData = cs.shareOfVoice.slice(0, 15).map(s => ({
    brand: s.brand,
    mentions: s.mentions,
    sentiment: s.sentimentScore,
    isTarget: s.isTarget,
  }));

  const renderDelta = (cur: number, prev: number | null | undefined) => {
    if (prev === null || prev === undefined) return null;
    const d = cur - prev;
    if (d === 0) return <span className="text-xs text-gray-400 ml-2">=</span>;
    const up = d > 0;
    const pct = prev > 0 ? Math.round((d / prev) * 100) : null;
    return (
      <span className={`text-xs ml-2 ${up ? 'text-green-600' : 'text-red-600'}`}>
        {up ? '▲' : '▼'} {up ? '+' : ''}{d}{pct !== null ? ` (${up ? '+' : ''}${pct}%)` : ''}
      </span>
    );
  };

  const handleExport = () => {
    const sov: any[][] = [
      ['#', 'Marca', 'Target', 'Frecuencia (veces nombrada)', 'SoV (%)', 'Sentimiento'],
      ...cs.shareOfVoice.map((s, i) => [
        i + 1, s.brand, s.isTarget ? 'Sí' : '', s.mentions, +s.percentage.toFixed(1), +s.sentimentScore.toFixed(2),
      ]),
    ];
    const modelos: any[][] = [
      ['Modelo', 'Respuestas', 'Respuestas con mención', 'Mention rate (%)', 'SoV (%)', 'Posición media'],
      ...modelVis.map(m => [
        m.label, m.responses, m.mentioned, +m.mentionRate.toFixed(1), +m.sovPct.toFixed(1),
        m.avgPosition !== null ? +m.avgPosition.toFixed(2) : '',
      ]),
    ];
    const posicion: any[][] = posDist ? [
      ['Bucket', 'Apariciones'],
      ['Posición 1', posDist.current.p1],
      ['Posición 2-3', posDist.current.p2_3],
      ['Posición 4-7', posDist.current.p4_7],
      ['Posición 8+', posDist.current.p8plus],
      ['Total', posDist.current.total],
    ] : [['Sin datos de posición']];
    const evolucion: any[][] = [
      ['Análisis', ...topBrands],
      ...sovAreaData.map(p => [p.label, ...topBrands.map(b => p[b] ?? 0)]),
    ];
    exportSheetsToExcel(
      downloadFilename('metricas', cs.targetBrand, modelosDelRango(scoped as unknown as AnalysisDetail[])),
      [
        { name: 'Share of Voice', aoa: sov, cols: [6, 24, 10, 26, 12, 14] },
        { name: 'Visibilidad por modelo', aoa: modelos, cols: [18, 12, 22, 16, 12, 16] },
        { name: 'Distribución posición', aoa: posicion, cols: [18, 14] },
        { name: 'Evolución histórica', aoa: evolucion, cols: [22, ...topBrands.map(() => 14)] },
      ]
    );
  };

  return (
    <div className="space-y-6">
      {/* Rango de fechas + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={({ dateFrom, dateTo }) => { setDateFrom(dateFrom); setDateTo(dateTo); }}
          count={scoped.length}
          total={analyses?.length}
        />
        <ModelGranularityToggle
          value={modelGranularity}
          onChange={setModelGranularity}
          analyses={scoped}
        />
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          <Download className="w-4 h-4" /> Exportar Excel
        </button>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Award className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Métricas Cuantitativas</h2>
        </div>
        <p className="text-blue-100">
          {cbm.length > 1 ? (
            <>Fotografía actual: agregado de <strong>{cbm.length} modelos</strong> (último análisis de cada uno)</>
          ) : (
            <>Fotografía actual basada en el último análisis</>
          )}
          {' '}+ evolución histórica de {ht.length} análisis.
          Marca target: <strong>{cs.targetBrand}</strong>
        </p>
        {/* Qué compone exactamente la fotografía: sin esto, un agregado de
            varios modelos y fechas se lee como "lo de hoy". */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-100/90">
          {cbm.map(m => (
            <span key={m.modelKey}>
              {m.modelKey} · {new Date(m.timestamp).toLocaleDateString('es-ES')}
              {m.staleDays > 0 && <span className="text-blue-200/70"> (hace {m.staleDays} d)</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Menciones vs Citaciones (Hito 2) */}
      {mentionKpis && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide inline-flex items-center gap-1.5">
              Respuestas con mención
              <InfoTip text="En cuántas respuestas aparece nombrada la marca, sumando el último análisis de cada modelo. Cada respuesta cuenta una sola vez, aunque la marca se nombre varias veces dentro de ella. Por eso este número es menor que la frecuencia total de la tabla Share of Voice." />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {mentionKpis.cur.mentionedResponses}{renderDelta(mentionKpis.cur.mentionedResponses, mentionKpis.prev?.mentionedResponses)}
            </div>
            <div className="text-xs text-gray-400">de {mentionKpis.totalQuestions} respuestas{mentionKpis.modelCount > 1 ? ` · ${mentionKpis.modelCount} modelos` : ''}</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide inline-flex items-center gap-1.5">
              Citaciones al sitio
              <InfoTip text="Fuentes citadas por la IA cuya URL pertenece al dominio de la marca, excluyendo el blog, sumando el último análisis de cada modelo. Se cuenta cada fuente citada, por lo que un mismo dominio puede sumar varias veces." />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {mentionKpis.cur.citacionCom}{renderDelta(mentionKpis.cur.citacionCom, mentionKpis.prev?.citacionCom)}
            </div>
            <div className="text-xs text-gray-400">{mentionKpis.hasDomain ? 'fuentes que enlazan al dominio' : 'configura el dominio de marca'}</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide inline-flex items-center gap-1.5">
              Citaciones al blog
              <InfoTip text="Fuentes citadas por la IA que enlazan a la sección /blog del dominio de la marca, sumando el último análisis de cada modelo." />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {mentionKpis.cur.citacionBlog}{renderDelta(mentionKpis.cur.citacionBlog, mentionKpis.prev?.citacionBlog)}
            </div>
            <div className="text-xs text-gray-400">{mentionKpis.hasDomain ? 'enlaces a /blog' : 'configura el dominio de marca'}</div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Share of Voice"
          value={targetSov ? `${targetSov.percentage.toFixed(1)}%` : 'N/A'}
          icon={<Award className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50"
          subtitle={targetSov ? `frecuencia: ${targetSov.mentions} de ${cs.totalMentions} menciones totales` : undefined}
          info="% de veces que se nombra tu marca sobre el total de veces que se nombra cualquier marca, agregando el último análisis de cada modelo. Cuenta la frecuencia: si una respuesta nombra la marca 3 veces, suma 3. Por eso es un número mayor que 'Respuestas con mención'."
        />
        <KpiCard
          label="Posición Promedio"
          value={cs.avgAppearanceOrder ? `#${cs.avgAppearanceOrder.toFixed(1)}` : 'N/A'}
          icon={<ArrowUp className="w-5 h-5 text-green-600" />}
          color="bg-green-50"
          subtitle="Orden de aparición en respuestas IA"
          info="Posición media en la que aparece tu marca dentro de cada respuesta (1 = primera marca nombrada). Solo promedia las respuestas donde la marca aparece."
        />
        <KpiCard
          label="Sentimiento Neto"
          value={fmtSentiment(cs.netSentimentScore)}
          icon={cs.netSentimentScore >= 0
            ? <TrendingUp className="w-5 h-5 text-emerald-600" />
            : <TrendingDown className="w-5 h-5 text-red-600" />}
          color={cs.netSentimentScore >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
          subtitle="Escala -2 (muy negativo) a +2 (muy positivo)"
          info="Media del sentimiento de las menciones de tu marca, agregando el último análisis de cada modelo, en escala de -2 (muy negativo) a +2 (muy positivo)."
        />
        <KpiCard
          label="Confianza IA"
          value={`${(cs.aiConfidence * 100).toFixed(0)}%`}
          icon={<CheckCircle2 className="w-5 h-5 text-purple-600" />}
          color="bg-purple-50"
          subtitle="Confianza promedio del análisis"
          info="Confianza que declara la propia IA sobre su análisis, ponderada por nº de preguntas de cada modelo. No mide visibilidad de la marca."
        />
      </div>

      {/* Desglose de la fotografía por modelo.
          Las tarjetas de arriba son el agregado pooled; aquí se ve de dónde
          sale cada número y cuánto se separan los modelos entre sí. */}
      {cbm.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border">
          <button
            onClick={() => setShowModelBreakdown(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left"
          >
            <span className="font-semibold text-gray-800 inline-flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-500" />
              Desglose por modelo
              <span className="text-xs font-normal text-gray-400">
                las tarjetas de arriba son el total de estos {cbm.length} modelos
              </span>
            </span>
            <span className="text-sm text-gray-500">{showModelBreakdown ? 'Ocultar' : 'Ver'}</span>
          </button>
          {showModelBreakdown && (
            <div className="px-5 pb-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b">
                    <th className="text-left py-2">Modelo</th>
                    <th className="text-right py-2">Share of Voice</th>
                    <th className="text-right py-2">Posición</th>
                    <th className="text-right py-2">Sentimiento</th>
                    <th className="text-right py-2">Confianza</th>
                    <th className="text-right py-2">Preguntas</th>
                  </tr>
                </thead>
                <tbody>
                  {cbm.map(m => {
                    const sov = m.state.shareOfVoice.find(x => x.isTarget);
                    const color = modelColors[m.modelKey] || '#888';
                    return (
                      <tr key={m.modelKey} className="border-b last:border-0">
                        <td className="py-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span className="text-gray-800">{m.modelKey}</span>
                          </span>
                          <div className="text-xs text-gray-400 ml-[18px]">
                            {new Date(m.timestamp).toLocaleDateString('es-ES')}
                            {m.staleDays > 0 && ` · hace ${m.staleDays} d`}
                          </div>
                        </td>
                        <td className="text-right py-2 tabular-nums">{sov ? `${sov.percentage.toFixed(1)}%` : 'N/A'}</td>
                        <td className="text-right py-2 tabular-nums">
                          {m.state.avgAppearanceOrder ? `#${m.state.avgAppearanceOrder.toFixed(1)}` : 'N/A'}
                        </td>
                        <td className="text-right py-2 tabular-nums">{fmtSentiment(m.state.netSentimentScore)}</td>
                        <td className="text-right py-2 tabular-nums">{(m.state.aiConfidence * 100).toFixed(0)}%</td>
                        <td className="text-right py-2 tabular-nums text-gray-500">
                          {m.state.categoryBreakdown.reduce((n, c) => n + c.count, 0)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold text-gray-900">
                    <td className="py-2">Total (pooled)</td>
                    <td className="text-right py-2 tabular-nums">{targetSov ? `${targetSov.percentage.toFixed(1)}%` : 'N/A'}</td>
                    <td className="text-right py-2 tabular-nums">
                      {cs.avgAppearanceOrder ? `#${cs.avgAppearanceOrder.toFixed(1)}` : 'N/A'}
                    </td>
                    <td className="text-right py-2 tabular-nums">{fmtSentiment(cs.netSentimentScore)}</td>
                    <td className="text-right py-2 tabular-nums">{(cs.aiConfidence * 100).toFixed(0)}%</td>
                    <td className="text-right py-2 tabular-nums text-gray-500">
                      {cs.categoryBreakdown.reduce((n, c) => n + c.count, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-3">
                El total no es la media de las filas: suma las menciones y las preguntas de todos los
                modelos y divide una sola vez, para que un modelo con menos preguntas no pese igual
                que uno con muchas.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Visibilidad por modelo (Hito 6.1 — GEO) */}
      {modelVis.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-1 inline-flex items-center gap-1.5">
            Visibilidad por modelo
            <InfoTip text="Las tarjetas de arriba son la fotografía (último análisis de cada modelo); esta tabla agrega TODOS los análisis del rango de fechas seleccionado. Mention rate = % de respuestas del modelo que nombran la marca. SoV = % de la frecuencia de menciones de la marca sobre todas las marcas, en ese modelo." />
          </h3>
          <p className="text-xs text-gray-400 mb-4">Dónde es visible {cs.targetBrand} según el motor de IA (¿fuerte en uno, ausente en otro?). Calculado sobre todos los análisis del rango.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left pb-2">Modelo</th>
                  <th className="text-left pb-2 w-1/3">Mention rate</th>
                  <th className="text-right pb-2">SoV</th>
                  <th className="text-right pb-2">Posición</th>
                  <th className="text-right pb-2">Respuestas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {modelVis.map(m => (
                  <tr key={m.persona}>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2 font-medium text-gray-800">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                        {m.label}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${m.mentionRate}%`, backgroundColor: m.color }} />
                        </div>
                        <span className="text-xs text-gray-600 w-10 text-right">{m.mentionRate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-2 text-right text-gray-700">{m.sovPct.toFixed(1)}%</td>
                    <td className="py-2 text-right text-gray-700">{m.avgPosition !== null ? `#${m.avgPosition.toFixed(1)}` : '—'}</td>
                    <td className="py-2 text-right text-gray-400">{m.mentioned}/{m.responses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Distribución de posición (Hito 5) */}
      {posDist && posDist.current.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h3 className="font-semibold text-gray-800 mb-1">Distribución de posición</h3>
            <p className="text-xs text-gray-400 mb-4">En qué posición aparece {cs.targetBrand} (último análisis de cada modelo).</p>
            {(() => {
              const c = posDist.current;
              const pieData = [
                { name: POSITION_BUCKETS[0], value: c.p1, color: POSITION_COLORS[0] },
                { name: POSITION_BUCKETS[1], value: c.p2_3, color: POSITION_COLORS[1] },
                { name: POSITION_BUCKETS[2], value: c.p4_7, color: POSITION_COLORS[2] },
                { name: POSITION_BUCKETS[3], value: c.p8plus, color: POSITION_COLORS[3] },
              ].filter(d => d.value > 0);
              return (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => `${((e.value / c.total) * 100).toFixed(0)}%`}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
          {posDist.overTime.length > 1 && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Distribución de posición en el tiempo</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={posDist.overTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="p1" name={POSITION_BUCKETS[0]} stackId="p" fill={POSITION_COLORS[0]} />
                  <Bar dataKey="p2_3" name={POSITION_BUCKETS[1]} stackId="p" fill={POSITION_COLORS[1]} />
                  <Bar dataKey="p4_7" name={POSITION_BUCKETS[2]} stackId="p" fill={POSITION_COLORS[2]} />
                  <Bar dataKey="p8plus" name={POSITION_BUCKETS[3]} stackId="p" fill={POSITION_COLORS[3]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {posPorModelo.models.length > 1 && posPorModelo.rows.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                Posición media por modelo
                <InfoTip text="Posición media en la que aparece tu marca dentro de cada respuesta (1 = primera marca nombrada), con una línea por modelo. El eje va invertido: más arriba es mejor. Cada análisis se ejecuta con un modelo, así que promediarlos juntos daba un número que no distinguía si pierdes posiciones en ChatGPT o en Gemini. Una línea se corta donde ese modelo no se ejecutó o la marca no apareció." />
              </h3>
              <p className="text-xs text-gray-400 mb-4">Más arriba = mejor posición. Solo promedia respuestas donde la marca aparece.</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={posPorModelo.rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    reversed
                    domain={[1, 'auto']}
                    allowDecimals
                    tickFormatter={(v) => `#${Number(v).toFixed(1)}`}
                  />
                  <Tooltip formatter={(v: number | string | null) => (v == null ? 'sin datos' : `#${Number(v).toFixed(2)}`)} />
                  <Legend />
                  {posPorModelo.models.map((m, i) => (
                    <Line
                      key={m}
                      type="monotone"
                      dataKey={m}
                      name={m}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Row: Brand Position Chart + SoV Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scatter */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Mapa de Posicionamiento</h3>
          <p className="text-xs text-gray-400 mb-2">X = frecuencia de menciones (veces nombrada), Y = sentimiento. Azul = tu marca</p>
          <BrandPositionChart data={scatterData} />
        </div>

        {/* SoV Table */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-1 inline-flex items-center gap-1.5">
            Share of Voice — Top Marcas
            <InfoTip text="Frecuencia = veces que se nombra cada marca en total, sumando el último análisis de cada modelo (una misma respuesta puede nombrarla varias veces, y cada vez suma). No es el número de respuestas: para eso está la tarjeta 'Respuestas con mención'. SoV % = frecuencia de la marca / frecuencia total de todas las marcas (competidores y descubiertas incluidas)." />
          </h3>
          <p className="text-xs text-gray-400 mb-4">Veces que se nombra cada marca, sumando el último análisis de cada modelo (con repeticiones dentro de cada respuesta).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Marca</th>
                  <th className="pb-2 text-right">Frecuencia</th>
                  <th className="pb-2 text-right">SoV %</th>
                  <th className="pb-2 text-right">Sentimiento</th>
                </tr>
              </thead>
              <tbody>
                {cs.shareOfVoice.slice(0, 10).map((s, i) => (
                  <tr key={s.brand} className={`border-b last:border-0 ${s.isTarget ? 'bg-blue-50 font-semibold' : ''}`}>
                    <td className="py-2 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {s.brand}
                      {s.isTarget && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Target</span>}
                    </td>
                    <td className="py-2 text-right font-mono">{s.mentions}</td>
                    <td className="py-2 text-right font-mono">{s.percentage.toFixed(1)}%</td>
                    <td className={`py-2 text-right font-mono ${s.sentimentScore > 0 ? 'text-green-600' : s.sentimentScore < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {fmtSentiment(s.sentimentScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row: Discovered Brands + Top Domains */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Discovered Brands */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-500" />
            Marcas Descubiertas
          </h3>
          <p className="text-xs text-gray-400 mb-3">Marcas no configuradas que la IA mencionó (Nx = veces nombrada)</p>
          {cs.discoveredBrands.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No se descubrieron marcas adicionales</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {cs.discoveredBrands.map(db => (
                <div key={db.brand} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <span className="text-sm font-medium text-gray-700">{db.brand}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-gray-500">{db.frequency}x</span>
                    <span className={db.sentiment > 0 ? 'text-green-600' : db.sentiment < 0 ? 'text-red-600' : 'text-gray-400'}>
                      {db.sentiment > 0 ? <TrendingUp className="w-3 h-3 inline" /> : db.sentiment < 0 ? <TrendingDown className="w-3 h-3 inline" /> : <Minus className="w-3 h-3 inline" />}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Domains */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-500" />
            Top Dominios Citados
          </h3>
          <p className="text-xs text-gray-400 mb-3">Fuentes más referenciadas por la IA</p>
          {cs.topDomains.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">Sin datos de fuentes</p>
          ) : (
            <div className="space-y-2">
              {cs.topDomains.map((d, i) => (
                <div key={d.domain} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700 truncate">{d.domain}</span>
                      <span className="text-gray-500 font-mono ml-2">{d.count} ({d.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                      <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${d.percentage}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category × Brand Mentions */}
      {cs.categoryBrandMentions.length > 0 && (() => {
        // Collect all configured brands that appear
        const allBrandsSet = new Set<string>();
        cs.categoryBrandMentions.forEach(cbm => Object.keys(cbm.brands).forEach(b => allBrandsSet.add(b)));
        // Sort: target first, then alphabetically
        const brandList = [...allBrandsSet].sort((a, b) => {
          if (a.toLowerCase() === cs.targetBrand.toLowerCase()) return -1;
          if (b.toLowerCase() === cs.targetBrand.toLowerCase()) return 1;
          return a.localeCompare(b);
        });

        const chartData = cs.categoryBrandMentions.map(cbm => {
          const row: Record<string, any> = {
            category: cbm.category,
            _total: cbm.totalQuestions,
          };
          brandList.forEach(brand => {
            row[brand] = cbm.brands[brand]?.percentage ? Math.round(cbm.brands[brand].percentage) : 0;
          });
          return row;
        });

        const CustomTooltip = ({ active, payload, label }: any) => {
          if (!active || !payload?.length) return null;
          const item = chartData.find(d => d.category === label);
          return (
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[220px]">
              <p className="font-semibold text-gray-900 text-sm mb-1">{label}</p>
              <p className="text-xs text-gray-400 mb-3">{item?._total || 0} preguntas en esta categoría</p>
              {payload.map((entry: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between gap-4 py-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: entry.color }} />
                    <span className="text-sm text-gray-700">{entry.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{entry.value}%</span>
                </div>
              ))}
            </div>
          );
        };

        return (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h3 className="font-semibold text-gray-800 mb-1">Menciones por Categoría y Marca</h3>
            <p className="text-xs text-gray-400 mb-4">% de preguntas donde cada marca es mencionada, por categoría temática</p>
            <ResponsiveContainer width="100%" height={Math.max(400, cs.categoryBrandMentions.length * 70)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30, top: 10, bottom: 10 }} barCategoryGap="20%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: '#6b7280', fontSize: 12 }} tickCount={6} />
                <YAxis type="category" dataKey="category" width={240} tick={{ fill: '#374151', fontSize: 13, fontWeight: 500 }} interval={0} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Legend wrapperStyle={{ paddingTop: 16 }} iconType="square" />
                {brandList.map((brand, i) => (
                  <Bar
                    key={brand}
                    dataKey={brand}
                    fill={brand.toLowerCase() === cs.targetBrand.toLowerCase() ? '#3b82f6' : COLORS[(i + 1) % COLORS.length]}
                    radius={[0, 4, 4, 0]}
                    name={brand}
                    barSize={16}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* Detail table below */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 pr-4">Categoría</th>
                    <th className="pb-2 text-center text-gray-400">Preguntas</th>
                    {brandList.map(brand => (
                      <th key={brand} className={`pb-2 text-center ${brand.toLowerCase() === cs.targetBrand.toLowerCase() ? 'text-blue-700 font-semibold' : ''}`}>
                        {brand}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cs.categoryBrandMentions.map(cbm => (
                    <tr key={cbm.category} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-700">{cbm.category}</td>
                      <td className="py-2 text-center text-gray-400 font-mono">{cbm.totalQuestions}</td>
                      {brandList.map(brand => {
                        const info = cbm.brands[brand];
                        if (!info || info.mentions === 0) {
                          return <td key={brand} className="py-2 text-center text-gray-300">—</td>;
                        }
                        const pct = Math.round(info.percentage);
                        const sentColor = info.avgSentiment > 0 ? 'text-green-600' : info.avgSentiment < 0 ? 'text-red-600' : 'text-gray-600';
                        const isTarget = brand.toLowerCase() === cs.targetBrand.toLowerCase();
                        return (
                          <td key={brand} className={`py-2 text-center font-mono ${isTarget ? 'bg-blue-50' : ''}`}>
                            <span className={sentColor}>{pct}%</span>
                            <span className="text-gray-300 text-xs ml-1">({info.mentions})</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Evolución de menciones por categoría (topics) */}
      {categoryTrend && (() => {
        const colorOf = Object.fromEntries(categoryTrend.categories.map((c, i) => [c, goldenColor(i)]));
        return (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <h3 className="font-semibold text-gray-800 inline-flex items-center gap-1.5">
                Evolución de Menciones por Categoría
                <InfoTip text="Por cada análisis, % de preguntas de cada categoría temática donde la marca seleccionada es mencionada (misma métrica que 'Menciones por Categoría y Marca', vista en el tiempo). Se muestran las categorías del análisis más reciente. Haz clic en una categoría de la leyenda para ocultarla o mostrarla." />
              </h3>
              <select
                value={categoryTrend.brand}
                onChange={(e) => setTrendBrand(e.target.value)}
                className="text-sm border rounded-md px-3 py-1.5 text-gray-700"
              >
                {categoryTrend.brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400 mb-4">% de preguntas de cada categoría donde {categoryTrend.brand} es mencionada, por análisis</p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={categoryTrend.points} margin={{ left: 0, right: 16, top: 12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 12 }} padding={{ left: 28, right: 28 }} tickMargin={8} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#6b7280', fontSize: 12 }} tickCount={6} width={45} />
                <Tooltip content={<SortedPctTooltip />} />
                {categoryTrend.categories.map(cat => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    name={cat}
                    stroke={colorOf[cat]}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
                    activeDot={{ r: 5 }}
                    connectNulls
                    hide={hiddenCats.includes(cat)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <ChipLegend
              items={categoryTrend.categories}
              colorOf={colorOf}
              hidden={hiddenCats}
              onToggle={cat => setHiddenCats(h => h.includes(cat) ? h.filter(c => c !== cat) : [...h, cat])}
            />
          </div>
        );
      })()}

      {/* === HISTORICAL TRENDS === */}
      {ht.length >= 2 ? (
        <>
          <div className="border-t pt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-1">Evolución Histórica</h3>
            <p className="text-sm text-gray-500 mb-6">{ht.length} análisis desde {ht[0].label} hasta {ht[ht.length - 1].label}</p>
          </div>

          {/* SoV: líneas (el valor de cada marca se lee directamente sobre el eje) */}
          {(() => {
            const sovColorOf = Object.fromEntries(topBrands.map((b, i) => [b, goldenColor(i)]));
            const isTargetBrand = (b: string) => b.toLowerCase() === cs.targetBrand.toLowerCase();
            return (
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-800 mb-1">Evolución del Share of Voice</h3>
                <p className="text-xs text-gray-400 mb-4">% de menciones de cada marca sobre el total en cada análisis</p>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={sovAreaData} margin={{ left: 0, right: 16, top: 12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 12 }} padding={{ left: 28, right: 28 }} tickMargin={8} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} unit="%" domain={[0, 'auto']} width={45} />
                    <Tooltip content={<SortedPctTooltip />} />
                    {topBrands.map(brand => (
                      <Line
                        key={brand}
                        type="monotone"
                        dataKey={brand}
                        name={brand}
                        stroke={sovColorOf[brand]}
                        strokeWidth={isTargetBrand(brand) ? 3 : 2}
                        dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
                        activeDot={{ r: 5 }}
                        connectNulls
                        hide={hiddenSovBrands.includes(brand)}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <ChipLegend
                  items={topBrands}
                  colorOf={sovColorOf}
                  hidden={hiddenSovBrands}
                  onToggle={b => setHiddenSovBrands(h => h.includes(b) ? h.filter(x => x !== b) : [...h, b])}
                  bold={isTargetBrand}
                />
              </div>
            );
          })()}

          {/* Position + Sentiment */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Position tracking */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-gray-800 mb-4 inline-flex items-center gap-1.5">
                Tracking de Posición
                <InfoTip text="Una línea por modelo más el total. El total pondera por número de menciones: un modelo que menciona la marca en 30 respuestas pesa más que uno que la menciona en 5. Un hueco significa que ese modelo no corrió ese día." />
              </h3>
              <p className="text-xs text-gray-400 mb-2">Menor = mejor (1 = primera mención)</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={positionTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis reversed domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v: number) => `#${Number(v).toFixed(1)}`} />
                  <Tooltip formatter={(v: number, n: string) => [`#${Number(v).toFixed(1)}`, n]} />
                  {trendModels.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {trendModels.map(m => (
                    <Line
                      key={m}
                      type="monotone"
                      dataKey={m}
                      stroke={modelColors[m] || '#888'}
                      strokeWidth={1.5}
                      dot={{ r: 3 }}
                      connectNulls
                      name={m}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey={TOTAL_KEY}
                    stroke="#111827"
                    strokeWidth={2.5}
                    strokeDasharray="5 3"
                    dot={{ r: 3 }}
                    connectNulls
                    name="Total"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Sentiment evolution */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-gray-800 mb-4 inline-flex items-center gap-1.5">
                Evolución del Sentimiento
                <InfoTip text="Una línea por modelo más el total. El total pondera por número de menciones, no promedia los promedios de cada modelo. Un hueco significa que ese modelo no corrió ese día." />
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={sentimentTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis domain={[-2, 2]} tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip formatter={(v: number, n: string) => [fmtSentiment(Number(v)), n]} />
                  {trendModels.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {trendModels.map(m => (
                    <Line
                      key={m}
                      type="monotone"
                      dataKey={m}
                      stroke={modelColors[m] || '#888'}
                      strokeWidth={1.5}
                      dot={{ r: 3 }}
                      connectNulls
                      name={m}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey={TOTAL_KEY}
                    stroke="#111827"
                    strokeWidth={2.5}
                    strokeDasharray="5 3"
                    dot={{ r: 3 }}
                    connectNulls
                    name="Total"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : ht.length === 1 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
          <p className="text-blue-700">
            Se necesitan al menos <strong>2 análisis</strong> para ver la evolución histórica.
            Actualmente tienes 1 análisis ({ht[0].label}).
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default MetricsDashboard;
