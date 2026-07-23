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
  countBrandAppearances, buildModelVisibility, buildPositionDistribution, POSITION_BUCKETS, POSITION_COLORS,
  sentimentToNumeric, fmtSentiment, COLORS, normalizeBrandName, isRealDomain,
} from './sharedMetrics';
import { DateRangeFilter, filterAnalysesByDateRange } from './dashboardFilters';
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
}

// === CALCULATION ===

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
  sovByBrand: Record<string, number>;
  avgAppearanceOrder: number | null;
  sentimentScore: number;
  confidence: number;
}

function calculateMetrics(analyses: AnalysisDetail[]) {
  if (analyses.length === 0) return null;

  const sorted = [...analyses].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const targetBrand = latest.configuration.brand;

  // === CURRENT STATE (from latest analysis) ===
  const questions = latest.results?.questions || [];

  // Build canonical brand list for normalization
  const configuredBrandsList = [targetBrand, ...latest.configuration.competitors];
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
    aiConfidence: latest.results?.overallConfidence || 0,
    discoveredBrands,
    topDomains,
    categoryBreakdown,
    categoryBrandMentions,
    totalMentions,
  };

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

    return {
      date: analysis.timestamp,
      label: new Date(analysis.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      analysisId: analysis.id,
      sovByBrand,
      avgAppearanceOrder: hOrderCount > 0 ? hOrderSum / hOrderCount : null,
      sentimentScore: hSentCount > 0 ? hSentSum / hSentCount : 0,
      confidence: analysis.results?.overallConfidence || 0,
    };
  });

  return { currentState, historicalTrend };
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

const MetricsDashboard: React.FC<Props> = ({ analyses, loading, brandDomain }) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [trendBrand, setTrendBrand] = useState('');
  const [hiddenCats, setHiddenCats] = useState<string[]>([]);
  const [hiddenSovBrands, setHiddenSovBrands] = useState<string[]>([]);

  const scoped = useMemo(
    () => filterAnalysesByDateRange(analyses || [], dateFrom, dateTo),
    [analyses, dateFrom, dateTo]
  );

  const metrics = useMemo(() => calculateMetrics(scoped), [scoped]);

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
    const points = sorted.map(a => {
      const acc: Record<string, { total: number; hit: number }> = {};
      (a.results?.questions || []).forEach(q => {
        const cat = q.category || 'Sin categoría';
        if (!catSet.has(cat)) return;
        if (!acc[cat]) acc[cat] = { total: 0, hit: 0 };
        acc[cat].total++;
        const mentioned = (q.brandMentions || []).some(bm =>
          bm.mentioned && normalizeBrandName(bm.brand, brandOptions).toLowerCase() === brand.toLowerCase()
        );
        if (mentioned) acc[cat].hit++;
      });
      const row: Record<string, any> = {
        label: new Date(a.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      };
      Object.entries(acc).forEach(([cat, d]) => {
        row[cat] = d.total > 0 ? Math.round((d.hit / d.total) * 100) : 0;
      });
      return row;
    });
    return { points, categories, brand, brandOptions };
  }, [scoped, trendBrand]);

  // KPIs de menciones/citaciones con delta vs análisis anterior (Hito 2)
  const mentionKpis = useMemo(() => {
    if (!scoped || scoped.length === 0) return null;
    const sorted = [...scoped].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const latest = sorted[sorted.length - 1];
    const target = latest.configuration.brand;
    const cur = countBrandAppearances([latest] as any, target, brandDomain || '');
    const prev = sorted.length > 1 ? countBrandAppearances([sorted[sorted.length - 2]] as any, target, brandDomain || '') : null;
    return { cur, prev, hasDomain: !!brandDomain, totalQuestions: latest.results?.questions?.length || 0 };
  }, [scoped, brandDomain]);

  // Visibilidad por modelo (Hito 6.1 — GEO)
  const modelVis = useMemo(() => {
    if (!scoped || scoped.length === 0) return [];
    const sorted = [...scoped].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return buildModelVisibility(scoped as any, sorted[sorted.length - 1].configuration.brand);
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

  const { currentState: cs, historicalTrend: ht } = metrics;
  const targetSov = cs.shareOfVoice.find(s => s.isTarget);

  // Prepare historical SoV data for area chart
  const allBrandsInHistory = new Set<string>();
  ht.forEach(h => Object.keys(h.sovByBrand).forEach(b => allBrandsInHistory.add(b)));
  const topBrands = [...allBrandsInHistory]
    .map(b => ({ brand: b, totalSov: ht.reduce((s, h) => s + (h.sovByBrand[b] || 0), 0) }))
    .sort((a, b) => b.totalSov - a.totalSov)
    .slice(0, 8)
    .map(b => b.brand);

  const sovAreaData = ht.map(h => {
    const point: Record<string, any> = { label: h.label };
    topBrands.forEach(b => { point[b] = +(h.sovByBrand[b] || 0).toFixed(1); });
    return point;
  });

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
      downloadFilename('metricas', cs.targetBrand),
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
          Fotografía actual basada en el último análisis + evolución histórica de {ht.length} análisis.
          Marca target: <strong>{cs.targetBrand}</strong>
        </p>
      </div>

      {/* Menciones vs Citaciones (Hito 2) */}
      {mentionKpis && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide inline-flex items-center gap-1.5">
              Respuestas con mención
              <InfoTip text="En cuántas respuestas del último análisis aparece nombrada la marca. Cada respuesta cuenta una sola vez, aunque la marca se nombre varias veces dentro de ella. Por eso este número es menor que la frecuencia total de la tabla Share of Voice." />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {mentionKpis.cur.mentionedResponses}{renderDelta(mentionKpis.cur.mentionedResponses, mentionKpis.prev?.mentionedResponses)}
            </div>
            <div className="text-xs text-gray-400">de {mentionKpis.totalQuestions} respuestas del último análisis</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide inline-flex items-center gap-1.5">
              Citaciones al sitio
              <InfoTip text="Fuentes citadas por la IA (último análisis) cuya URL pertenece al dominio de la marca, excluyendo el blog. Se cuenta cada fuente citada, por lo que un mismo dominio puede sumar varias veces." />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {mentionKpis.cur.citacionCom}{renderDelta(mentionKpis.cur.citacionCom, mentionKpis.prev?.citacionCom)}
            </div>
            <div className="text-xs text-gray-400">{mentionKpis.hasDomain ? 'fuentes que enlazan al dominio' : 'configura el dominio de marca'}</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide inline-flex items-center gap-1.5">
              Citaciones al blog
              <InfoTip text="Fuentes citadas por la IA (último análisis) que enlazan a la sección /blog del dominio de la marca." />
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
          info="% de veces que se nombra tu marca sobre el total de veces que se nombra cualquier marca en el último análisis. Cuenta la frecuencia: si una respuesta nombra la marca 3 veces, suma 3. Por eso es un número mayor que 'Respuestas con mención'."
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
          info="Media del sentimiento de las menciones de tu marca en el último análisis, en escala de -2 (muy negativo) a +2 (muy positivo)."
        />
        <KpiCard
          label="Confianza IA"
          value={`${(cs.aiConfidence * 100).toFixed(0)}%`}
          icon={<CheckCircle2 className="w-5 h-5 text-purple-600" />}
          color="bg-purple-50"
          subtitle="Confianza promedio del análisis"
          info="Confianza que declara la propia IA sobre su análisis (promedio del último análisis). No mide visibilidad de la marca."
        />
      </div>

      {/* Visibilidad por modelo (Hito 6.1 — GEO) */}
      {modelVis.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-1 inline-flex items-center gap-1.5">
            Visibilidad por modelo
            <InfoTip text="A diferencia de las tarjetas de arriba (que usan solo el último análisis), esta tabla agrega TODOS los análisis del rango de fechas seleccionado. Mention rate = % de respuestas del modelo que nombran la marca. SoV = % de la frecuencia de menciones de la marca sobre todas las marcas, en ese modelo." />
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
            <p className="text-xs text-gray-400 mb-4">En qué posición aparece {cs.targetBrand} (último análisis).</p>
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
            <InfoTip text="Frecuencia = veces que se nombra cada marca en total en el último análisis (una misma respuesta puede nombrarla varias veces, y cada vez suma). No es el número de respuestas: para eso está la tarjeta 'Respuestas con mención'. SoV % = frecuencia de la marca / frecuencia total de todas las marcas (competidores y descubiertas incluidas)." />
          </h3>
          <p className="text-xs text-gray-400 mb-4">Veces que se nombra cada marca en el último análisis (con repeticiones dentro de cada respuesta).</p>
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
              <h3 className="font-semibold text-gray-800 mb-4">Tracking de Posición</h3>
              <p className="text-xs text-gray-400 mb-2">Menor = mejor (1 = primera mención)</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={ht.filter(h => h.avgAppearanceOrder !== null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis reversed domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v: number) => `#${Number(v).toFixed(1)}`} />
                  <Tooltip formatter={(v: number) => [`#${v.toFixed(1)}`, 'Posición']} />
                  <Line type="monotone" dataKey="avgAppearanceOrder" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Posición" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Sentiment evolution */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Evolución del Sentimiento</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={ht}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis domain={[-2, 2]} tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [fmtSentiment(v), 'Sentimiento']} />
                  <Line type="monotone" dataKey="sentimentScore" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Sentimiento" />
                  {/* Reference line at 0 */}
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
