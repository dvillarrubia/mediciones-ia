import React, { useMemo } from 'react';
import {
  Award, ArrowUp, TrendingUp, TrendingDown, CheckCircle2,
  Globe, Users, Minus
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import BrandPositionChart from './charts/BrandPositionChart';

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
}

// === HELPERS ===

function sentimentToNumeric(s: string | undefined): number {
  if (!s) return 0;
  const lower = s.toLowerCase();
  if (lower.includes('very_positive') || lower.includes('muy_positiv')) return 2;
  if (lower.includes('positiv')) return 1;
  if (lower.includes('very_negative') || lower.includes('muy_negativ')) return -2;
  if (lower.includes('negativ')) return -1;
  return 0;
}

function fmtSentiment(n: number): string {
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

/**
 * Normaliza el nombre de una marca para agrupar variantes (e.g. "HolaLuz" → "Holaluz").
 * Recibe la lista de marcas configuradas (target + competidores) como referencia canónica.
 */
function normalizeBrandName(brand: string, configuredBrands: string[]): string {
  const lower = brand.toLowerCase().replace(/[\s\-_]+/g, '');
  for (const cb of configuredBrands) {
    if (cb.toLowerCase().replace(/[\s\-_]+/g, '') === lower) return cb;
  }
  return brand;
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
      if (s.domain && s.domain !== 'ai-models' && s.domain !== 'unknown' && s.domain !== 'ai-generated') domainAcc[s.domain] = (domainAcc[s.domain] || 0) + 1;
    });

    // Brands
    (q.brandMentions || []).forEach(bm => {
      if (!bm.mentioned || bm.frequency <= 0) return;
      const brandName = normalizeBrandName(bm.brand, configuredBrandsList);
      const isTarget = brandName.toLowerCase() === targetBrand.toLowerCase();

      if (!brandAcc[brandName]) brandAcc[brandName] = { mentions: 0, sentSum: 0, sentCount: 0, isTarget };
      brandAcc[brandName].mentions += bm.frequency;
      brandAcc[brandName].sentSum += sentimentToNumeric(bm.detailedSentiment || bm.context);
      brandAcc[brandName].sentCount++;

      if (isTarget && bm.appearanceOrder && bm.appearanceOrder > 0) {
        targetOrderSum += bm.appearanceOrder;
        targetOrderCount++;
      }

      if (bm.isDiscovered) {
        if (!discoveredMap[brandName]) discoveredMap[brandName] = { freq: 0, sentSum: 0, count: 0 };
        discoveredMap[brandName].freq += bm.frequency;
        discoveredMap[brandName].sentSum += sentimentToNumeric(bm.detailedSentiment || bm.context);
        discoveredMap[brandName].count++;
      }
    });
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
  const configuredBrands = new Set([targetBrand.toLowerCase(), ...latest.configuration.competitors.map(c => c.toLowerCase())]);

  questions.forEach(q => {
    const cat = q.category || 'Sin categoría';
    if (!catBrandAcc[cat]) catBrandAcc[cat] = { total: 0, brands: {} };
    catBrandAcc[cat].total++;

    (q.brandMentions || []).forEach(bm => {
      if (!bm.mentioned) return;
      const brandName = normalizeBrandName(bm.brand, configuredBrandsList);
      // Only include target + configured competitors (skip discovered brands)
      if (!configuredBrands.has(brandName.toLowerCase())) return;

      if (!catBrandAcc[cat].brands[brandName]) catBrandAcc[cat].brands[brandName] = { count: 0, sentSum: 0, sentCount: 0 };
      catBrandAcc[cat].brands[brandName].count++;
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
      (q.brandMentions || []).forEach(bm => {
        if (!bm.mentioned || bm.frequency <= 0) return;
        const bmName = normalizeBrandName(bm.brand, configuredBrandsList);
        if (!hBrand[bmName]) hBrand[bmName] = { mentions: 0, total: 0 };
        hBrand[bmName].mentions += bm.frequency;

        if (bmName.toLowerCase() === brand.toLowerCase()) {
          hSentSum += sentimentToNumeric(bm.detailedSentiment || bm.context);
          hSentCount++;
          if (bm.appearanceOrder && bm.appearanceOrder > 0) {
            hOrderSum += bm.appearanceOrder;
            hOrderCount++;
          }
        }
      });
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

const KpiCard: React.FC<{ label: string; value: string; icon: React.ReactNode; color: string; subtitle?: string }> = ({ label, value, icon, color, subtitle }) => (
  <div className={`bg-white rounded-xl shadow-sm border p-5`}>
    <div className="flex items-center gap-3 mb-2">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
    {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
  </div>
);

const MetricsDashboard: React.FC<Props> = ({ analyses, loading }) => {
  const metrics = useMemo(() => calculateMetrics(analyses), [analyses]);

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
      <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
        <BarChart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-700 mb-2">Sin datos de métricas</h3>
        <p className="text-gray-500">Ejecuta al menos un análisis para ver métricas cuantitativas.</p>
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

  return (
    <div className="space-y-6">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Share of Voice"
          value={targetSov ? `${targetSov.percentage.toFixed(1)}%` : 'N/A'}
          icon={<Award className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50"
          subtitle={targetSov ? `${targetSov.mentions} menciones de ${cs.totalMentions}` : undefined}
        />
        <KpiCard
          label="Posición Promedio"
          value={cs.avgAppearanceOrder ? `#${cs.avgAppearanceOrder.toFixed(1)}` : 'N/A'}
          icon={<ArrowUp className="w-5 h-5 text-green-600" />}
          color="bg-green-50"
          subtitle="Orden de aparición en respuestas IA"
        />
        <KpiCard
          label="Sentimiento Neto"
          value={fmtSentiment(cs.netSentimentScore)}
          icon={cs.netSentimentScore >= 0
            ? <TrendingUp className="w-5 h-5 text-emerald-600" />
            : <TrendingDown className="w-5 h-5 text-red-600" />}
          color={cs.netSentimentScore >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
          subtitle="Escala -2 (muy negativo) a +2 (muy positivo)"
        />
        <KpiCard
          label="Confianza IA"
          value={`${(cs.aiConfidence * 100).toFixed(0)}%`}
          icon={<CheckCircle2 className="w-5 h-5 text-purple-600" />}
          color="bg-purple-50"
          subtitle="Confianza promedio del análisis"
        />
      </div>

      {/* Row: Brand Position Chart + SoV Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scatter */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Mapa de Posicionamiento</h3>
          <p className="text-xs text-gray-400 mb-2">X = menciones, Y = sentimiento. Azul = tu marca</p>
          <BrandPositionChart data={scatterData} />
        </div>

        {/* SoV Table */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Share of Voice — Top Marcas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Marca</th>
                  <th className="pb-2 text-right">Menciones</th>
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
          <p className="text-xs text-gray-400 mb-3">Marcas no configuradas que la IA mencionó</p>
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

      {/* === HISTORICAL TRENDS === */}
      {ht.length >= 2 ? (
        <>
          <div className="border-t pt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-1">Evolución Histórica</h3>
            <p className="text-sm text-gray-500 mb-6">{ht.length} análisis desde {ht[0].label} hasta {ht[ht.length - 1].label}</p>
          </div>

          {/* SoV Area Chart */}
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Evolución del Share of Voice</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={sovAreaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend />
                {topBrands.map((brand, i) => (
                  <Area
                    key={brand}
                    type="monotone"
                    dataKey={brand}
                    stackId="1"
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.4}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

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
                  <YAxis reversed domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fill: '#6b7280', fontSize: 11 }} />
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
