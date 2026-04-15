import React, { useEffect, useState, useMemo } from 'react';
import {
  Globe, TrendingUp, Eye, Target, Zap, Loader2,
  ArrowUp, ArrowDown, MessageSquareQuote, BarChart3,
  AlertTriangle, Shield, ExternalLink, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import API_BASE_URL, { apiFetch } from '../../config/api';

// ==================== TYPES ====================

interface ShareOfVoiceEntry {
  domain: string;
  is_target: boolean;
  keywords_count: number;
  share_by_count_pct: number;
  total_search_volume: number;
  share_by_volume_pct: number;
  total_etv: number;
  share_by_etv_pct: number;
}

interface GapEntry {
  keyword: string;
  search_volume: number;
  search_intent: string | null;
  keyword_difficulty: number | null;
  competitors_present: Array<{ domain: string; etv: number; url: string | null }>;
  total_competitors: number;
}

interface AIOverviewResult {
  metadata: {
    analyzed_at: string;
    unique_keywords: number;
    domains_analyzed: number;
    target_domain: string;
    competitors: string[];
    country_code: string;
    total_cost_usd: number;
    entries_per_domain: Record<string, number>;
  };
  share_of_voice: ShareOfVoiceEntry[];
  overlap_matrix: Record<string, Record<string, number>>;
  gap_analysis: {
    total_gaps: number;
    total_gap_volume: number;
    top_gaps: GapEntry[];
  };
  target_exclusive: {
    count: number;
    total_volume: number;
    top: Array<{ keyword: string; search_volume: number; etv: number; search_intent: string | null; cited_url: string | null }>;
  };
  exclusive_keywords?: Record<string, { count: number; total_volume: number; top: Array<{ keyword: string; search_volume: number; etv: number; search_intent: string | null }> }>;
  intent_distribution: Record<string, Record<string, { count: number; total_volume: number }>>;
  volume_distribution: Record<string, Record<string, number>>;
  top_keywords: Record<string, Array<{ keyword: string; search_volume: number; etv: number; ai_ref_position: number | null; search_intent: string | null; cited_url: string | null }>>;
  top_pages: Record<string, Array<{ url: string; title: string | null; count: number; total_volume: number; total_etv: number }>>;
}

interface HistoryItem {
  id: string;
  timestamp: string;
  targetDomain: string;
  competitors: string[];
  countryCode: string;
  costUsd: number;
  status: string;
  uniqueKeywords: number;
  shareOfVoice: ShareOfVoiceEntry[] | null;
}

interface FullResult {
  id: string;
  timestamp: string;
  targetDomain: string;
  competitors: string[];
  countryCode: string;
  costUsd: number;
  results: AIOverviewResult;
}

interface Props {
  projectId?: string;
}

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];
const INTENT_COLORS: Record<string, string> = {
  informational: '#3b82f6', commercial: '#f59e0b', transactional: '#10b981', navigational: '#8b5cf6'
};
const INTENT_LABELS: Record<string, string> = {
  informational: 'Informacional', commercial: 'Comercial', transactional: 'Transaccional', navigational: 'Navegacional'
};

function fmtPct(n: number): string { return n.toFixed(1) + '%'; }
function fmtVol(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ==================== COMPONENT ====================

const AIOverviewDashboard: React.FC<Props> = ({ projectId }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullResult, setFullResult] = useState<FullResult | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  // Collapsible sections
  const [showGaps, setShowGaps] = useState(true);
  const [showExclusive, setShowExclusive] = useState(true);

  // Fetch history
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const url = projectId
          ? `${API_BASE_URL}/api/ai-overview/history?projectId=${projectId}&limit=50`
          : `${API_BASE_URL}/api/ai-overview/history?limit=50`;
        const resp = await apiFetch(url);
        const data = await resp.json();
        if (data.success) setHistory(data.data || []);
      } catch (e) {
        console.error('Error fetching AI Overview history:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  // Fetch full result of latest analysis
  useEffect(() => {
    if (history.length === 0) return;
    const latestId = history[0]?.id; // history comes sorted desc
    if (!latestId) return;
    const load = async () => {
      try {
        setLoadingFull(true);
        const resp = await apiFetch(`${API_BASE_URL}/api/ai-overview/results/${latestId}`);
        const data = await resp.json();
        if (data.success) setFullResult(data.data);
      } catch (e) {
        console.error('Error fetching full result:', e);
      } finally {
        setLoadingFull(false);
      }
    };
    load();
  }, [history]);

  const validHistory = useMemo(() =>
    [...history]
      .filter(h => h.shareOfVoice && h.shareOfVoice.length > 0)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [history]
  );

  const latest = validHistory.length > 0 ? validHistory[validHistory.length - 1] : null;
  const targetEntry = latest?.shareOfVoice?.find(s => s.is_target);
  const hasHistory = validHistory.length >= 2;
  const r = fullResult?.results; // shorthand for the full result
  const targetDomain = r?.metadata?.target_domain || latest?.targetDomain || '';
  const allDomains = r ? [targetDomain, ...(r.metadata.competitors || [])] : [];

  // All domains sorted by volume SoV
  const allDomainsSorted = useMemo(() =>
    latest?.shareOfVoice ? [...latest.shareOfVoice].sort((a, b) => b.share_by_volume_pct - a.share_by_volume_pct) : [],
    [latest]
  );

  // Chart domains
  const topChartDomains = useMemo(() => {
    const domainVolume: Record<string, number> = {};
    validHistory.forEach(h => h.shareOfVoice?.forEach(s => {
      domainVolume[s.domain] = (domainVolume[s.domain] || 0) + s.total_search_volume;
    }));
    const td = latest?.shareOfVoice?.find(s => s.is_target)?.domain;
    return Object.entries(domainVolume)
      .sort((a, b) => { if (a[0] === td) return -1; if (b[0] === td) return 1; return b[1] - a[1]; })
      .slice(0, 6).map(([d]) => d);
  }, [validHistory, latest]);

  const sovAreaData = useMemo(() => validHistory.map(h => {
    const point: Record<string, any> = { label: new Date(h.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) };
    topChartDomains.forEach(domain => { const e = h.shareOfVoice?.find(s => s.domain === domain); point[domain] = e ? +e.share_by_volume_pct.toFixed(1) : 0; });
    return point;
  }), [validHistory, topChartDomains]);

  const targetTrend = useMemo(() => validHistory.map(h => {
    const t = h.shareOfVoice?.find(s => s.is_target);
    return { label: new Date(h.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }), sovVolume: t?.share_by_volume_pct || 0, keywords: t?.keywords_count || 0, etv: t?.total_etv || 0 };
  }), [validHistory]);

  const delta = useMemo(() => {
    if (validHistory.length < 2) return null;
    const prev = validHistory[validHistory.length - 2];
    const prevTarget = prev.shareOfVoice?.find(s => s.is_target);
    if (!prevTarget || !targetEntry) return null;
    return { sovVolume: targetEntry.share_by_volume_pct - prevTarget.share_by_volume_pct, keywords: targetEntry.keywords_count - prevTarget.keywords_count, etv: targetEntry.total_etv - prevTarget.total_etv };
  }, [validHistory, targetEntry]);

  // Intent distribution chart data for target
  const intentData = useMemo(() => {
    if (!r?.intent_distribution?.[targetDomain]) return [];
    return Object.entries(r.intent_distribution[targetDomain]).map(([intent, d]) => ({
      intent: INTENT_LABELS[intent] || intent,
      count: d.count,
      volume: d.total_volume,
      fill: INTENT_COLORS[intent] || '#9ca3af',
    }));
  }, [r, targetDomain]);

  // Volume distribution chart data for target
  const volumeData = useMemo(() => {
    if (!r?.volume_distribution?.[targetDomain]) return [];
    const order = ['100k+', '10k-100k', '1k-10k', '100-1k', '<100'];
    return order
      .filter(k => r.volume_distribution[targetDomain][k] !== undefined)
      .map(k => ({ bucket: k, count: r.volume_distribution[targetDomain][k] }));
  }, [r, targetDomain]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  if (!latest) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border">
        <MessageSquareQuote className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-700 mb-2">Sin datos de AI Overviews</h3>
        <p className="text-gray-500">Ejecuta un análisis en la sección AI Overviews para ver el dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Globe className="w-8 h-8" />
          <h2 className="text-2xl font-bold">AI Overviews — Dashboard</h2>
        </div>
        <p className="text-cyan-100">
          Dominio: <strong>{latest.targetDomain}</strong> vs {latest.competitors.join(', ')}
          {' · '}{validHistory.length} análisis · Último: {new Date(latest.timestamp).toLocaleDateString('es-ES')}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="SoV por volumen" value={fmtPct(targetEntry?.share_by_volume_pct || 0)} delta={delta?.sovVolume} deltaUnit="pp" icon={<Target className="w-4 h-4" />} color="bg-blue-50 text-blue-700" />
        <KpiCard label="SoV por keywords" value={fmtPct(targetEntry?.share_by_count_pct || 0)} icon={<BarChart3 className="w-4 h-4" />} color="bg-indigo-50 text-indigo-700" />
        <KpiCard label="Keywords citado" value={(targetEntry?.keywords_count || 0).toLocaleString()} delta={delta?.keywords} icon={<Eye className="w-4 h-4" />} color="bg-cyan-50 text-cyan-700" />
        <KpiCard label="ETV" value={`$${(targetEntry?.total_etv || 0).toLocaleString()}`} delta={delta?.etv} deltaPrefix="$" icon={<Zap className="w-4 h-4" />} color="bg-emerald-50 text-emerald-700" />
        <KpiCard label="Universo total" value={(latest.uniqueKeywords || 0).toLocaleString()} sub="keywords con AI Overview" icon={<Globe className="w-4 h-4" />} color="bg-amber-50 text-amber-700" />
      </div>

      {/* Ranking de dominios */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Ranking de dominios</h3>
        <p className="text-xs text-gray-400 mb-4">Quién domina las fuentes citadas por Google en AI Overviews</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b text-xs">
                <th className="pb-2 w-8">#</th>
                <th className="pb-2">Dominio</th>
                <th className="pb-2 text-right">Keywords</th>
                <th className="pb-2 text-right">SoV (vol.)</th>
                <th className="pb-2 text-right">SoV (count)</th>
                <th className="pb-2 text-right">Volumen</th>
                <th className="pb-2 text-right">ETV</th>
                <th className="pb-2 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {allDomainsSorted.map((d, i) => (
                <tr key={d.domain} className={`border-b last:border-0 ${d.is_target ? 'bg-blue-50' : ''}`}>
                  <td className="py-2.5 text-gray-400 font-mono text-xs">{i + 1}</td>
                  <td className="py-2.5 font-medium">
                    <span className={d.is_target ? 'text-blue-700' : 'text-gray-700'}>{d.domain}</span>
                    {d.is_target && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded ml-2">Target</span>}
                  </td>
                  <td className="py-2.5 text-right font-mono text-gray-600">{d.keywords_count.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-mono font-semibold">{fmtPct(d.share_by_volume_pct)}</td>
                  <td className="py-2.5 text-right font-mono text-gray-500">{fmtPct(d.share_by_count_pct)}</td>
                  <td className="py-2.5 text-right font-mono text-gray-500">{fmtVol(d.total_search_volume)}</td>
                  <td className="py-2.5 text-right font-mono text-gray-500">${d.total_etv.toLocaleString()}</td>
                  <td className="py-2.5"><div className="w-full bg-gray-100 rounded-full h-2"><div className={`h-2 rounded-full ${d.is_target ? 'bg-blue-500' : 'bg-gray-400'}`} style={{ width: `${Math.min(d.share_by_volume_pct, 100)}%` }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== DETALLE DEL ÚLTIMO ANÁLISIS ==================== */}
      {loadingFull && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>}

      {r && (
        <>
          {/* Intent + Volume distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {intentData.length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-gray-800 mb-1">Intención de búsqueda — {targetDomain}</h3>
                <p className="text-xs text-gray-400 mb-4">Distribución de intent en keywords donde tu dominio aparece</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={intentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis type="category" dataKey="intent" width={110} tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <Tooltip formatter={(v: number, name: string) => [v.toLocaleString(), name === 'count' ? 'Keywords' : 'Volumen']} />
                    <Bar dataKey="count" name="Keywords" radius={[0, 4, 4, 0]}>
                      {intentData.map((entry, i) => (
                        <rect key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-3">
                  {intentData.map(d => (
                    <span key={d.intent} className="text-xs text-gray-500">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ backgroundColor: d.fill }} />
                      {d.intent}: {d.count} kw ({fmtVol(d.volume)} vol.)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {volumeData.length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-gray-800 mb-1">Distribución por volumen — {targetDomain}</h3>
                <p className="text-xs text-gray-400 mb-4">En qué rangos de volumen de búsqueda aparece tu dominio</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="bucket" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" name="Keywords" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Top Keywords per domain */}
          {r.top_keywords && Object.keys(r.top_keywords).length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Top Keywords por dominio</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {allDomains.filter(d => r.top_keywords[d]?.length > 0).map((domain, di) => (
                  <div key={domain}>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[di % COLORS.length] }} />
                      {domain} {domain === targetDomain && <span className="text-xs bg-blue-100 text-blue-600 px-1 py-0.5 rounded">Target</span>}
                    </h4>
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-500 border-b"><th className="pb-1 text-left">Keyword</th><th className="pb-1 text-right">Vol.</th><th className="pb-1 text-right">ETV</th><th className="pb-1 text-right">Intent</th></tr></thead>
                        <tbody>
                          {r.top_keywords[domain].slice(0, 10).map((kw, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1.5 text-gray-700 max-w-[200px] truncate">{kw.keyword}</td>
                              <td className="py-1.5 text-right font-mono text-gray-500">{fmtVol(kw.search_volume)}</td>
                              <td className="py-1.5 text-right font-mono text-gray-500">${kw.etv.toLocaleString()}</td>
                              <td className="py-1.5 text-right">
                                {kw.search_intent && <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: (INTENT_COLORS[kw.search_intent] || '#9ca3af') + '20', color: INTENT_COLORS[kw.search_intent] || '#6b7280' }}>{kw.search_intent.slice(0, 4)}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Pages per domain */}
          {r.top_pages && Object.keys(r.top_pages).length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Top Páginas citadas por dominio</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {allDomains.filter(d => r.top_pages[d]?.length > 0).map((domain, di) => (
                  <div key={domain}>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[di % COLORS.length] }} />
                      {domain}
                    </h4>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {r.top_pages[domain].slice(0, 8).map((page, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs border-b last:border-0 pb-1.5">
                          <span className="text-gray-400 font-mono mt-0.5">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-700 truncate" title={page.url}>
                              {page.title || page.url.replace(/^https?:\/\/[^/]+/, '')}
                            </p>
                            <p className="text-gray-400">{page.count} citas · {fmtVol(page.total_volume)} vol. · ${page.total_etv.toLocaleString()} ETV</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overlap Matrix */}
          {r.overlap_matrix && Object.keys(r.overlap_matrix).length > 1 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Matriz de solapamiento</h3>
              <p className="text-xs text-gray-400 mb-4">Número de keywords donde dos dominios son citados simultáneamente</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-gray-500"></th>
                      {allDomains.filter(d => r.overlap_matrix[d]).map(d => (
                        <th key={d} className="p-3 text-center text-gray-600 font-medium">
                          <span className="block truncate" title={d}>{d.replace(/^www\./, '').split('.')[0]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allDomains.filter(d => r.overlap_matrix[d]).map(row => (
                      <tr key={row}>
                        <td className={`p-3 font-medium text-gray-700 ${row === targetDomain ? 'text-blue-700' : ''}`} title={row}>
                          {row.replace(/^www\./, '').split('.')[0]}
                        </td>
                        {allDomains.filter(d => r.overlap_matrix[d]).map(col => {
                          const val = r.overlap_matrix[row]?.[col] || 0;
                          const maxVal = Math.max(...Object.values(r.overlap_matrix).flatMap(v => Object.values(v)));
                          const intensity = maxVal > 0 ? val / maxVal : 0;
                          return (
                            <td key={col} className="p-3 text-center font-mono text-sm" style={{
                              backgroundColor: row === col ? '#f3f4f6' : `rgba(59, 130, 246, ${intensity * 0.3})`,
                            }}>
                              {row === col ? '—' : val.toLocaleString()}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Gap Analysis */}
          {r.gap_analysis && r.gap_analysis.top_gaps.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <button onClick={() => setShowGaps(!showGaps)} className="w-full flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Gap Analysis — Oportunidades perdidas
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {r.gap_analysis.total_gaps.toLocaleString()} keywords donde competidores aparecen pero tú no · {fmtVol(r.gap_analysis.total_gap_volume)} vol. total
                  </p>
                </div>
                {showGaps ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
              {showGaps && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b text-xs">
                        <th className="pb-2">Keyword</th>
                        <th className="pb-2 text-right">Vol.</th>
                        <th className="pb-2 text-right">Intent</th>
                        <th className="pb-2 text-right">Competidores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.gap_analysis.top_gaps.slice(0, 20).map((g, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 text-gray-700">{g.keyword}</td>
                          <td className="py-2 text-right font-mono text-gray-500">{fmtVol(g.search_volume)}</td>
                          <td className="py-2 text-right">
                            {g.search_intent && <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: (INTENT_COLORS[g.search_intent] || '#9ca3af') + '20', color: INTENT_COLORS[g.search_intent] || '#6b7280' }}>{INTENT_LABELS[g.search_intent] || g.search_intent}</span>}
                          </td>
                          <td className="py-2 text-right text-xs text-gray-500">{g.competitors_present.map(c => c.domain).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Target Exclusive Keywords */}
          {r.target_exclusive && r.target_exclusive.top.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <button onClick={() => setShowExclusive(!showExclusive)} className="w-full flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-500" />
                    Keywords exclusivas de {targetDomain}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {r.target_exclusive.count.toLocaleString()} keywords donde solo tú apareces · {fmtVol(r.target_exclusive.total_volume)} vol. total
                  </p>
                </div>
                {showExclusive ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
              {showExclusive && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b text-xs">
                        <th className="pb-2">Keyword</th>
                        <th className="pb-2 text-right">Vol.</th>
                        <th className="pb-2 text-right">ETV</th>
                        <th className="pb-2 text-right">Intent</th>
                        <th className="pb-2">URL citada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.target_exclusive.top.slice(0, 20).map((kw, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 text-gray-700">{kw.keyword}</td>
                          <td className="py-2 text-right font-mono text-gray-500">{fmtVol(kw.search_volume)}</td>
                          <td className="py-2 text-right font-mono text-gray-500">${kw.etv.toLocaleString()}</td>
                          <td className="py-2 text-right">
                            {kw.search_intent && <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: (INTENT_COLORS[kw.search_intent] || '#9ca3af') + '20', color: INTENT_COLORS[kw.search_intent] || '#6b7280' }}>{INTENT_LABELS[kw.search_intent] || kw.search_intent}</span>}
                          </td>
                          <td className="py-2 text-xs text-gray-400 max-w-[200px] truncate">{kw.cited_url || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ==================== EVOLUCIÓN TEMPORAL ==================== */}
      {hasHistory && (
        <>
          <div className="border-t pt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-1">Evolución temporal</h3>
            <p className="text-sm text-gray-500 mb-6">
              {validHistory.length} análisis desde {new Date(validHistory[0].timestamp).toLocaleDateString('es-ES')} hasta {new Date(validHistory[validHistory.length - 1].timestamp).toLocaleDateString('es-ES')}
            </p>
          </div>

          {/* SoV Area Chart */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-800 mb-1">Share of Voice por volumen</h3>
            <p className="text-xs text-gray-400 mb-4">Evolución del % de volumen de búsqueda donde cada dominio es citado</p>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={sovAreaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} />
                <Legend />
                {topChartDomains.map((domain, i) => (
                  <Area key={domain} type="monotone" dataKey={domain} stackId="1" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.4} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Keywords + ETV */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Keywords donde apareces</h3>
              <p className="text-xs text-gray-400 mb-4">Consultas donde {latest.targetDomain} es citado como fuente</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={targetTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="keywords" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Keywords" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Tráfico estimado (ETV)</h3>
              <p className="text-xs text-gray-400 mb-4">Estimated Traffic Value de las consultas donde apareces</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={targetTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'ETV']} />
                  <Line type="monotone" dataKey="etv" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="ETV ($)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SoV trend line for target only */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-800 mb-1">Tendencia de tu SoV</h3>
            <p className="text-xs text-gray-400 mb-4">% de volumen de búsqueda donde {latest.targetDomain} es citado</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={targetTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'SoV']} />
                <Line type="monotone" dataKey="sovVolume" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 5 }} name="SoV volumen" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {!hasHistory && validHistory.length === 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
          <p className="text-blue-700">Ejecuta al menos <strong>2 análisis</strong> para ver la evolución temporal.</p>
        </div>
      )}
    </div>
  );
};

// ==================== KPI CARD ====================

const KpiCard: React.FC<{
  label: string; value: string; icon: React.ReactNode; color: string;
  sub?: string; delta?: number | null; deltaUnit?: string; deltaPrefix?: string;
}> = ({ label, value, icon, color, sub, delta, deltaUnit = '', deltaPrefix = '' }) => (
  <div className={`rounded-xl border p-4 ${color}`}>
    <div className="flex items-center gap-1.5 mb-1 opacity-70">{icon}<span className="text-xs font-medium">{label}</span></div>
    <p className="text-xl font-bold">{value}</p>
    {delta !== undefined && delta !== null && (
      <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
        {delta > 0 ? <ArrowUp className="w-3 h-3" /> : delta < 0 ? <ArrowDown className="w-3 h-3" /> : null}
        {delta > 0 ? '+' : ''}{deltaPrefix}{typeof delta === 'number' && Math.abs(delta) < 100 ? delta.toFixed(1) : delta.toLocaleString()}{deltaUnit} vs anterior
      </p>
    )}
    {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
  </div>
);

export default AIOverviewDashboard;
