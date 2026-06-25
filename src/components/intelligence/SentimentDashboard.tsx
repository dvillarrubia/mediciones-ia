import React, { useMemo, useState } from 'react';
import { Heart, Award, Info } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  AnalysisDetail, SENTIMENT_KEYS, SENTIMENT_LABELS, SENTIMENT_COLORS,
  normalizeSentimentKey, normalizeBrandName,
  modelLabel, dateLabel, sortByDate, SentimentKey
} from './sharedMetrics';

interface Props {
  analyses: AnalysisDetail[];
  loading?: boolean;
}

interface BrandSentiment {
  brand: string;
  total: number;
  counts: Record<SentimentKey, number>;
  positive: number;
  neutral: number;
  negative: number;
  net: number; // -100..100
  isTarget: boolean;
}

interface DetailRow {
  brand: string;
  sentiment: SentimentKey;
  model: string;
  category: string;
  question: string;
  isTarget: boolean;
  reasoning?: string;
}

const SentimentDashboard: React.FC<Props> = ({ analyses, loading }) => {
  const [sentimentFilter, setSentimentFilter] = useState<'all' | SentimentKey>('all');

  const data = useMemo(() => {
    if (!analyses || analyses.length === 0) return null;
    const sorted = sortByDate(analyses);
    const latest = sorted[sorted.length - 1];
    const targetBrand = latest.configuration.brand;
    const configured = [targetBrand, ...(latest.configuration.competitors || [])];

    // === Distribución global (último análisis) ===
    const dist: Record<SentimentKey, number> = {
      very_positive: 0, positive: 0, neutral: 0, negative: 0, very_negative: 0,
    };
    const brandAcc: Record<string, BrandSentiment> = {};
    const detailRows: DetailRow[] = [];

    (latest.results?.questions || []).forEach(q => {
      (q.brandMentions || []).forEach(bm => {
        if (!bm.mentioned) return;
        const key = normalizeSentimentKey(bm.detailedSentiment || bm.context);
        dist[key]++;

        const brand = normalizeBrandName(bm.brand, configured);
        const isTarget = brand.toLowerCase() === targetBrand.toLowerCase();
        if (!brandAcc[brand]) {
          brandAcc[brand] = {
            brand, total: 0,
            counts: { very_positive: 0, positive: 0, neutral: 0, negative: 0, very_negative: 0 },
            positive: 0, neutral: 0, negative: 0, net: 0, isTarget,
          };
        }
        brandAcc[brand].counts[key]++;
        brandAcc[brand].total++;

        const model = modelLabel(q.multiModelAnalysis?.[0]);
        const ca = (bm as any).contextualAnalysis;
        const reasoning = ca?.reasoning || ca?.competitiveReasoning || bm.evidence?.[0];
        detailRows.push({ brand, sentiment: key, model, category: q.category || '—', question: q.question, isTarget, reasoning });
      });
    });

    const byBrand: BrandSentiment[] = Object.values(brandAcc).map(b => {
      const positive = b.counts.very_positive + b.counts.positive;
      const negative = b.counts.very_negative + b.counts.negative;
      const neutral = b.counts.neutral;
      const net = b.total > 0 ? ((positive - negative) / b.total) * 100 : 0;
      return { ...b, positive, neutral, negative, net };
    }).sort((a, b) => b.net - a.net);

    const totalMentions = SENTIMENT_KEYS.reduce((s, k) => s + dist[k], 0);
    const pieData = SENTIMENT_KEYS
      .map(k => ({ key: k, name: SENTIMENT_LABELS[k], value: dist[k], color: SENTIMENT_COLORS[k] }))
      .filter(d => d.value > 0);

    // === Series temporales (un punto por análisis) ===
    const overTime = sorted.map(a => {
      const d: Record<SentimentKey, number> = {
        very_positive: 0, positive: 0, neutral: 0, negative: 0, very_negative: 0,
      };
      (a.results?.questions || []).forEach(q => {
        (q.brandMentions || []).forEach(bm => {
          if (!bm.mentioned) return;
          d[normalizeSentimentKey(bm.detailedSentiment || bm.context)]++;
        });
      });
      const tot = SENTIMENT_KEYS.reduce((s, k) => s + d[k], 0) || 1;
      return {
        label: dateLabel(a.timestamp),
        ...d,
        // versión porcentual para el área 100%
        pct_very_positive: (d.very_positive / tot) * 100,
        pct_positive: (d.positive / tot) * 100,
        pct_neutral: (d.neutral / tot) * 100,
        pct_negative: (d.negative / tot) * 100,
        pct_very_negative: (d.very_negative / tot) * 100,
      };
    });

    return { targetBrand, dist, totalMentions, pieData, byBrand, overTime, detailRows, multiple: sorted.length > 1 };
  }, [analyses]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Cargando datos de sentimiento…</div>;
  }
  if (!data || data.totalMentions === 0) {
    return (
      <div className="text-center py-20">
        <Heart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No hay menciones con sentimiento para mostrar.</p>
      </div>
    );
  }

  const filteredRows = data.detailRows.filter(r => sentimentFilter === 'all' || r.sentiment === sentimentFilter);
  // Drivers de sentimiento negativo (Hito 6.2 — GEO: el "por qué")
  const negativeDrivers = data.detailRows
    .filter(r => (r.sentiment === 'negative' || r.sentiment === 'very_negative') && r.reasoning)
    .slice(0, 20);

  return (
    <div className="space-y-6">
      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([['very_positive', 'Muy Positivo'], ['positive', 'Positivo'], ['negative', 'Negativo'], ['very_negative', 'Muy Negativo']] as [SentimentKey, string][]).map(([k, label]) => (
          <div key={k} className="bg-white rounded-lg border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold" style={{ color: SENTIMENT_COLORS[k] }}>{data.dist[k]}</div>
            <div className="text-xs text-gray-400">{((data.dist[k] / data.totalMentions) * 100).toFixed(1)}% del total</div>
          </div>
        ))}
      </div>

      {/* Pie + Net Sentiment Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Heart className="w-4 h-4 text-pink-500" /> Share of Sentiment</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={(e: any) => `${((e.value / data.totalMentions) * 100).toFixed(0)}%`}>
                {data.pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Award className="w-4 h-4 text-amber-500" /> Net Sentiment Score (Ranking)</h3>
          <div className="overflow-y-auto max-h-[300px]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Marca</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Net Sentiment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.byBrand.map((b, i) => (
                  <tr key={b.brand} className={b.isTarget ? 'bg-blue-50' : ''}>
                    <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{b.brand}{b.isTarget && <span className="ml-2 text-xs text-blue-600">(tú)</span>}</td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: b.net >= 0 ? '#15803d' : '#dc2626' }}>
                      {b.net >= 0 ? '+' : ''}{b.net.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sentiment by Brand (split) */}
      <div className="bg-white rounded-lg border p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Sentiment by Brand</h3>
        <ResponsiveContainer width="100%" height={Math.max(220, data.byBrand.length * 38)}>
          <BarChart data={data.byBrand.slice(0, 12)} layout="vertical" stackOffset="expand" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <YAxis type="category" dataKey="brand" width={110} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: any, n: any) => [v, n]} />
            <Legend />
            <Bar dataKey="positive" name="Positivas" stackId="s" fill={SENTIMENT_COLORS.positive} />
            <Bar dataKey="neutral" name="Neutras" stackId="s" fill={SENTIMENT_COLORS.neutral} />
            <Bar dataKey="negative" name="Negativas" stackId="s" fill={SENTIMENT_COLORS.negative} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Series temporales (solo si hay >1 análisis) */}
      {data.multiple && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Sentiment Distribution (over time)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.overTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                {SENTIMENT_KEYS.map(k => (
                  <Bar key={k} dataKey={k} name={SENTIMENT_LABELS[k]} stackId="d" fill={SENTIMENT_COLORS[k]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-lg border p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Share of Sentiment Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.overTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${Math.round(Number(v))}%`} domain={[0, 100]} allowDataOverflow />
                <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Legend />
                {SENTIMENT_KEYS.map(k => (
                  <Area key={k} dataKey={`pct_${k}`} name={SENTIMENT_LABELS[k]} stackId="p" stroke={SENTIMENT_COLORS[k]} fill={SENTIMENT_COLORS[k]} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Drivers de sentimiento negativo (Hito 6.2) */}
      {negativeDrivers.length > 0 && (
        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold text-gray-900 mb-1">Drivers de sentimiento negativo</h3>
          <p className="text-xs text-gray-400 mb-4">Por qué se habla mal: los motivos detrás de las menciones negativas (accionable para GEO).</p>
          <div className="space-y-2">
            {negativeDrivers.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${r.isTarget ? 'border-red-200 bg-red-50/40' : 'border-gray-100'}`}>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white whitespace-nowrap mt-0.5" style={{ backgroundColor: SENTIMENT_COLORS[r.sentiment] }}>
                  {r.brand}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-700">{r.reasoning}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate" title={r.question}>{r.category} · {r.model} · {r.question}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentiment Details */}
      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Sentiment Details</h3>
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value as any)}
            className="text-sm border rounded-md px-3 py-1.5 text-gray-700"
          >
            <option value="all">Todos los sentimientos</option>
            {SENTIMENT_KEYS.map(k => <option key={k} value={k}>{SENTIMENT_LABELS[k]}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Marca</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Sentimiento</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Modelo</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Topic</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Pregunta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.slice(0, 100).map((r, i) => (
                <tr key={i} className={r.isTarget ? 'bg-blue-50/40' : ''}>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{r.brand}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: SENTIMENT_COLORS[r.sentiment] }}>
                      {SENTIMENT_LABELS[r.sentiment]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.model}</td>
                  <td className="px-3 py-2 text-gray-600">{r.category}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-md truncate" title={r.question}>{r.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length > 100 && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><Info className="w-3 h-3" /> Mostrando 100 de {filteredRows.length} menciones.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SentimentDashboard;
