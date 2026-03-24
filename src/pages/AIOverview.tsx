import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe, Play, Trash2, Eye, ChevronLeft, Plus, X, AlertCircle,
  Loader2, DollarSign, BarChart3, Target, TrendingUp,
  ChevronDown, ChevronUp, ExternalLink, Award, AlertTriangle, Shield, MessageSquareQuote, Link2, Zap
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import API_BASE_URL, { apiFetch } from '../config/api';
import { useProjectStore } from '../store/projectStore';

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

// ==================== HELPERS ====================

const COUNTRIES = [
  { code: 'ES', name: 'Espana', flag: '🇪🇸' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧' },
  { code: 'DE', name: 'Alemania', flag: '🇩🇪' },
  { code: 'FR', name: 'Francia', flag: '🇫🇷' },
  { code: 'IT', name: 'Italia', flag: '🇮🇹' },
];

const DOMAIN_COLORS = [
  { bg: 'bg-blue-600', bgLight: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', bar: 'bg-blue-500' },
  { bg: 'bg-amber-500', bgLight: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500' },
  { bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500' },
  { bg: 'bg-rose-500', bgLight: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', bar: 'bg-rose-500' },
  { bg: 'bg-violet-500', bgLight: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', bar: 'bg-violet-500' },
  { bg: 'bg-cyan-500', bgLight: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', bar: 'bg-cyan-500' },
];

function fmtVol(v: number | null | undefined): string {
  if (v == null) return '-';
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

function shortDomain(d: string): string {
  return d.replace(/\.(com|es|net|org|co|io)$/, '');
}

const INTENT_BADGE: Record<string, string> = {
  informational: 'bg-sky-100 text-sky-700 border-sky-200',
  commercial: 'bg-amber-100 text-amber-700 border-amber-200',
  transactional: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  navigational: 'bg-violet-100 text-violet-700 border-violet-200',
};

function Section({ num, title, subtitle, children, className = '' }: { num: number; title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold mr-3">{num}</span>
          {title}
        </h2>
        {subtitle && <p className="text-sm text-gray-500 mt-1 ml-10">{subtitle}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ==================== REPORT VIEW ====================

function ReportView({ data, timestamp, onBack }: { data: AIOverviewResult; timestamp: string; onBack: () => void }) {
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  const r = data;
  const target = r.metadata.target_domain;
  const allDomains = [target, ...r.metadata.competitors];
  const colorMap: Record<string, typeof DOMAIN_COLORS[0]> = {};
  allDomains.forEach((d, i) => { colorMap[d] = DOMAIN_COLORS[i % DOMAIN_COLORS.length]; });

  const targetSov = r.share_of_voice.find(s => s.is_target);
  const leader = r.share_of_voice.reduce((a, b) => a.share_by_volume_pct > b.share_by_volume_pct ? a : b);
  const maxVolPct = Math.max(...r.share_of_voice.map(s => s.share_by_volume_pct));

  const toggleDomain = (d: string) => setExpandedDomains(prev => ({ ...prev, [d]: !prev[d] }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Report Header */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors text-sm">
            <ChevronLeft className="h-4 w-4" /> Volver
          </button>
          <span className="text-blue-200 text-sm">{new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <MessageSquareQuote className="h-8 w-8 text-blue-200" />
          <h1 className="text-2xl font-bold">Presencia en AI Overviews de Google</h1>
        </div>
        <p className="text-blue-100 text-sm mb-4">
          Cuando un usuario busca en Google, la IA genera una respuesta citando fuentes. Este informe analiza <strong className="text-white">quien es citado como referencia</strong> en esas respuestas y con que frecuencia.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-blue-100 text-sm border-t border-blue-500/40 pt-3">
          <span><strong className="text-white">Target:</strong> {target}</span>
          <span><strong className="text-white">Competidores:</strong> {r.metadata.competitors.join(', ')}</span>
          <span><strong className="text-white">Consultas analizadas:</strong> {r.metadata.unique_keywords.toLocaleString()}</span>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Award className="h-5 w-5 text-blue-600" />
          Resumen: ¿Cita Google a {shortDomain(target)}?
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          De todas las consultas analizadas donde Google genera un AI Overview, asi se reparten las citaciones entre dominios.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`rounded-lg p-4 ${colorMap[target].bgLight} border ${colorMap[target].border}`}>
            <p className="text-sm text-gray-600 mb-1">Google cita a <strong>{shortDomain(target)}</strong> en</p>
            <p className="text-3xl font-bold text-gray-900">{targetSov?.share_by_volume_pct}%<span className="text-base font-normal text-gray-500 ml-2">del volumen de busqueda</span></p>
            <p className="text-sm text-gray-500 mt-1">Referenciado como fuente en {targetSov?.keywords_count.toLocaleString()} consultas ({fmtVol(targetSov?.total_search_volume)} busquedas/mes)</p>
          </div>
          <div className={`rounded-lg p-4 ${leader.domain === target ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            <p className="text-sm text-gray-600 mb-1">{leader.domain === target ? 'Eres el mas citado' : 'Dominio mas citado por Google AI'}</p>
            <p className="text-3xl font-bold text-gray-900">{leader.domain === target ? targetSov?.share_by_volume_pct : leader.share_by_volume_pct}%<span className="text-base font-normal text-gray-500 ml-2">{shortDomain(leader.domain)}</span></p>
            {leader.domain !== target && (
              <p className="text-sm text-amber-700 mt-1">Google prefiere citar a {shortDomain(leader.domain)} con {(leader.share_by_volume_pct - (targetSov?.share_by_volume_pct || 0)).toFixed(1)} pp mas que a ti</p>
            )}
          </div>
          <div className="rounded-lg p-4 bg-red-50 border border-red-200">
            <p className="text-sm text-gray-600 mb-1 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Consultas donde NO te citan pero SI a competidores</p>
            <p className="text-3xl font-bold text-red-700">{r.gap_analysis.total_gaps.toLocaleString()}</p>
            <p className="text-sm text-red-600 mt-1">Volumen perdido: {fmtVol(r.gap_analysis.total_gap_volume)} busquedas/mes donde otros SI aparecen</p>
          </div>
          <div className="rounded-lg p-4 bg-green-50 border border-green-200">
            <p className="text-sm text-gray-600 mb-1 flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Consultas donde SOLO te citan a ti</p>
            <p className="text-3xl font-bold text-green-700">{r.target_exclusive.count.toLocaleString()}</p>
            <p className="text-sm text-green-600 mt-1">Ventaja exclusiva: {fmtVol(r.target_exclusive.total_volume)} busquedas/mes sin competencia en AI</p>
          </div>
        </div>
      </div>

      {/* 1. Share of Voice en citaciones AI */}
      <Section num={1} title="Share of Voice en Citaciones de AI Overviews"
        subtitle="¿Cuanto cita Google AI a cada dominio como fuente cuando responde a los usuarios?">

        {/* Visual bars */}
        <div className="space-y-3 mb-8">
          {r.share_of_voice
            .sort((a, b) => b.share_by_volume_pct - a.share_by_volume_pct)
            .map(s => (
              <div key={s.domain} className="flex items-center gap-3">
                <div className="w-32 text-sm font-medium text-gray-700 truncate text-right">
                  {shortDomain(s.domain)}
                </div>
                <div className="flex-1 bg-gray-100 rounded h-8 overflow-hidden relative">
                  <div
                    className={`h-full rounded transition-all duration-500 ${colorMap[s.domain].bar}`}
                    style={{ width: `${(s.share_by_volume_pct / maxVolPct) * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-3 text-sm font-bold" style={{ color: s.share_by_volume_pct > maxVolPct * 0.3 ? 'white' : '#374151' }}>
                    {s.share_by_volume_pct}%
                  </span>
                </div>
                <div className="w-20 text-right text-xs text-gray-500 font-mono">{fmtVol(s.total_search_volume)} vol</div>
              </div>
            ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Dominio</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Consultas donde es citado</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">SoV (citaciones)</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Vol. busquedas</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">SoV (volumen)</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Trafico est. AI</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">SoV (trafico)</th>
              </tr>
            </thead>
            <tbody>
              {r.share_of_voice.map(s => (
                <tr key={s.domain} className={`border-t border-gray-100 ${s.is_target ? 'bg-blue-50/50 font-medium' : 'hover:bg-gray-50'}`}>
                  <td className="py-3 px-4">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${colorMap[s.domain].bg}`} />
                    {s.is_target ? <strong>{s.domain}</strong> : s.domain}
                  </td>
                  <td className="text-right py-3 px-4 font-mono">{s.keywords_count.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 font-semibold">{s.share_by_count_pct}%</td>
                  <td className="text-right py-3 px-4 font-mono">{fmtVol(s.total_search_volume)}</td>
                  <td className="text-right py-3 px-4 font-semibold">{s.share_by_volume_pct}%</td>
                  <td className="text-right py-3 px-4 font-mono">{fmtVol(s.total_etv)}</td>
                  <td className="text-right py-3 px-4 font-semibold">{s.share_by_etv_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 2. Overlap: consultas donde varios dominios son citados juntos */}
      <Section num={2} title="Coincidencias en Citaciones"
        subtitle="¿En cuantas consultas Google cita a dos dominios a la vez en el mismo AI Overview?">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700"></th>
                {allDomains.map(d => (
                  <th key={d} className="text-right py-3 px-4 font-semibold text-gray-700">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colorMap[d].bg}`} />
                    {shortDomain(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDomains.map(d1 => (
                <tr key={d1} className="border-t border-gray-100">
                  <td className="py-3 px-4 font-semibold text-gray-700">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colorMap[d1].bg}`} />
                    {shortDomain(d1)}
                  </td>
                  {allDomains.map(d2 => {
                    const val = r.overlap_matrix[d1]?.[d2] ?? 0;
                    const isDiag = d1 === d2;
                    return (
                      <td key={d2} className={`text-right py-3 px-4 font-mono ${isDiag ? 'bg-gray-100 font-bold text-gray-900' : val > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                        {val.toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. Gap: consultas donde Google cita a competidores pero NO al target */}
      <Section num={3} title={`Oportunidades Perdidas: Google cita a competidores pero NO a ${shortDomain(target)}`}
        subtitle="Consultas donde la IA de Google referencia a tus competidores como fuente, pero tu dominio esta ausente de la respuesta.">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px] bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Consultas donde te ignoran</p>
            <p className="text-2xl font-bold text-red-700">{r.gap_analysis.total_gaps.toLocaleString()}</p>
            <p className="text-xs text-red-600 mt-1">{fmtVol(r.gap_analysis.total_gap_volume)} busquedas/mes donde competidores SI son citados</p>
          </div>
          <div className="flex-1 min-w-[200px] bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Consultas donde SOLO te citan a ti</p>
            <p className="text-2xl font-bold text-green-700">{r.target_exclusive.count.toLocaleString()}</p>
            <p className="text-xs text-green-600 mt-1">{fmtVol(r.target_exclusive.total_volume)} busquedas/mes de ventaja exclusiva</p>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 30 consultas donde Google NO te cita pero SI a competidores:</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 w-10">#</th>
                <th className="text-left py-2.5 px-3 font-semibold text-gray-600">Consulta del usuario</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600">Busquedas/mes</th>
                <th className="text-center py-2.5 px-3 font-semibold text-gray-600">Tipo</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600">KD</th>
                <th className="text-left py-2.5 px-3 font-semibold text-gray-600">¿Quien SI es citado?</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 w-10">N</th>
              </tr>
            </thead>
            <tbody>
              {r.gap_analysis.top_gaps.slice(0, 30).map((g, i) => (
                <tr key={g.keyword} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="text-right py-2 px-3 text-gray-400 font-mono">{i + 1}</td>
                  <td className="py-2 px-3 font-medium text-gray-900">{g.keyword}</td>
                  <td className="text-right py-2 px-3 font-mono">{fmtVol(g.search_volume)}</td>
                  <td className="text-center py-2 px-3">
                    {g.search_intent && (
                      <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${INTENT_BADGE[g.search_intent] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {g.search_intent}
                      </span>
                    )}
                  </td>
                  <td className="text-right py-2 px-3 font-mono text-gray-600">{g.keyword_difficulty ?? '-'}</td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {g.competitors_present.map(c => (
                        <span key={c.domain} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorMap[c.domain]?.bgLight || 'bg-gray-100'} ${colorMap[c.domain]?.text || 'text-gray-600'}`}>
                          {shortDomain(c.domain)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-right py-2 px-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      g.total_competitors >= 3 ? 'bg-red-100 text-red-700' : g.total_competitors === 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}>{g.total_competitors}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 4. Ventaja exclusiva: consultas donde SOLO citan al target */}
      <Section num={4} title={`Ventaja Exclusiva: consultas donde SOLO Google cita a ${shortDomain(target)}`}
        subtitle={`En estas ${r.target_exclusive.count.toLocaleString()} consultas, Google AI referencia a ${target} pero a ningun competidor. Es tu territorio exclusivo en AI Overviews.`}>

        {r.target_exclusive.top.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 w-10">#</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600">Consulta del usuario</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600">Busquedas/mes</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-gray-600">Tipo</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600">Trafico est.</th>
                </tr>
              </thead>
              <tbody>
                {r.target_exclusive.top.slice(0, 25).map((e, i) => (
                  <tr key={e.keyword} className="border-t border-gray-100 hover:bg-green-50/30">
                    <td className="text-right py-2 px-3 text-gray-400 font-mono">{i + 1}</td>
                    <td className="py-2 px-3 font-medium text-gray-900">{e.keyword}</td>
                    <td className="text-right py-2 px-3 font-mono">{fmtVol(e.search_volume)}</td>
                    <td className="text-center py-2 px-3">
                      {e.search_intent && (
                        <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${INTENT_BADGE[e.search_intent] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {e.search_intent}
                        </span>
                      )}
                    </td>
                    <td className="text-right py-2 px-3 font-mono">{fmtVol(e.etv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 5. Tipo de consultas donde te citan */}
      <Section num={5} title="¿Para que tipo de consultas te cita Google?"
        subtitle="Distribucion de citaciones por intencion de busqueda: informacional (educarse), comercial (comparar), transaccional (comprar), navegacional (ir a un sitio).">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Dominio</th>
                {['informational', 'commercial', 'transactional', 'navigational'].map(intent => (
                  <th key={intent} className="text-right py-3 px-4 font-semibold text-gray-700">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${INTENT_BADGE[intent]}`}>
                      {intent === 'informational' ? 'Educarse' : intent === 'commercial' ? 'Comparar' : intent === 'transactional' ? 'Comprar' : 'Ir a sitio'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDomains.map(domain => (
                <tr key={domain} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${colorMap[domain].bg}`} />
                    {shortDomain(domain)}
                  </td>
                  {['informational', 'commercial', 'transactional', 'navigational'].map(intent => {
                    const d = r.intent_distribution[domain]?.[intent];
                    return (
                      <td key={intent} className="text-right py-3 px-4 font-mono text-gray-700">
                        {d ? <>{d.count} <span className="text-gray-400">({fmtVol(d.total_volume)})</span></> : <span className="text-gray-300">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 6. Volumen de las consultas donde te citan */}
      <Section num={6} title="Peso de las consultas donde te citan"
        subtitle="¿Te citan en consultas de alto volumen o solo en nichos pequenos?">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Dominio</th>
                {['100k+', '10k-100k', '1k-10k', '100-1k', '<100'].map(b => (
                  <th key={b} className="text-right py-3 px-4 font-semibold text-gray-700">{b} bus/mes</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDomains.map(domain => (
                <tr key={domain} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${colorMap[domain].bg}`} />
                    {shortDomain(domain)}
                  </td>
                  {['100k+', '10k-100k', '1k-10k', '100-1k', '<100'].map(b => {
                    const val = r.volume_distribution[domain]?.[b] || 0;
                    return (
                      <td key={b} className={`text-right py-3 px-4 font-mono ${val > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{val}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 7. Top consultas donde cada dominio es citado */}
      <Section num={7} title="Top 15 Consultas donde Google cita a cada dominio"
        subtitle="Las consultas de mayor volumen donde Google AI referencia a cada dominio como fuente en su respuesta.">
        <div className="space-y-4">
          {allDomains.map(domain => {
            const kws = r.top_keywords[domain] || [];
            if (kws.length === 0) return null;
            const isExpanded = expandedDomains[`kw_${domain}`] !== false;

            return (
              <div key={domain} className={`rounded-lg border ${colorMap[domain].border} overflow-hidden`}>
                <button
                  onClick={() => toggleDomain(`kw_${domain}`)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left ${colorMap[domain].bgLight} hover:opacity-90 transition-opacity`}
                >
                  <span className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className={`inline-block w-3 h-3 rounded-full ${colorMap[domain].bg}`} />
                    {domain}
                    {domain === target && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full ml-1">TARGET</span>}
                    <span className="text-xs text-gray-500 font-normal ml-2">Citado en {kws.length >= 25 ? '25+' : kws.length} consultas top</span>
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                {isExpanded && (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/50">
                      <tr>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600 w-10">#</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Consulta del usuario</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Busquedas/mes</th>
                        <th className="text-center py-2 px-3 font-semibold text-gray-600">Tipo</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Trafico est.</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Pos. en AI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kws.slice(0, 15).map((kw, i) => (
                        <tr key={kw.keyword} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="text-right py-2 px-3 text-gray-400 font-mono">{i + 1}</td>
                          <td className="py-2 px-3 font-medium text-gray-900">{kw.keyword}</td>
                          <td className="text-right py-2 px-3 font-mono">{fmtVol(kw.search_volume)}</td>
                          <td className="text-center py-2 px-3">
                            {kw.search_intent && (
                              <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${INTENT_BADGE[kw.search_intent] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                {kw.search_intent}
                              </span>
                            )}
                          </td>
                          <td className="text-right py-2 px-3 font-mono">{fmtVol(kw.etv)}</td>
                          <td className="text-right py-2 px-3">
                            {kw.ai_ref_position != null ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                kw.ai_ref_position <= 3 ? 'bg-green-100 text-green-700' : kw.ai_ref_position <= 6 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                              }`}>{kw.ai_ref_position}</span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* 8. Paginas mas referenciadas por Google AI */}
      <Section num={8} title="Paginas mas referenciadas por Google AI"
        subtitle="¿Que URLs de cada dominio elige Google como fuente con mas frecuencia? Estas son las paginas que Google AI considera mas citables.">
        <div className="space-y-4">
          {allDomains.map(domain => {
            const pages = r.top_pages[domain] || [];
            if (pages.length === 0) return null;
            const isExpanded = expandedDomains[`pg_${domain}`] !== false;

            return (
              <div key={domain} className={`rounded-lg border ${colorMap[domain].border} overflow-hidden`}>
                <button
                  onClick={() => toggleDomain(`pg_${domain}`)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left ${colorMap[domain].bgLight} hover:opacity-90 transition-opacity`}
                >
                  <span className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className={`inline-block w-3 h-3 rounded-full ${colorMap[domain].bg}`} />
                    {domain}
                    <span className="text-xs text-gray-500 font-normal ml-2">top 10 paginas citadas</span>
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                {isExpanded && (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/50">
                      <tr>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600 w-10">#</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Pagina citada por Google AI</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Veces citada</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Vol. consultas</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Trafico est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pages.slice(0, 10).map((p, i) => (
                        <tr key={p.url} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="text-right py-2 px-3 text-gray-400 font-mono">{i + 1}</td>
                          <td className="py-2 px-3">
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 max-w-lg">
                              <span className="truncate">{p.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 65)}</span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-40" />
                            </a>
                          </td>
                          <td className="text-right py-2 px-3 font-mono font-semibold">{p.count}</td>
                          <td className="text-right py-2 px-3 font-mono">{fmtVol(p.total_volume)}</td>
                          <td className="text-right py-2 px-3 font-mono">{fmtVol(p.total_etv)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Conclusions */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-6 text-white shadow-lg">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          Conclusiones
        </h2>
        <div className="space-y-3 text-sm text-gray-200">
          <p>
            <strong className="text-white">1.</strong> Google AI cita a <strong className="text-white">{target}</strong> como fuente en el <strong className="text-amber-400">{targetSov?.share_by_volume_pct}%</strong> del volumen de busqueda analizado ({targetSov?.keywords_count.toLocaleString()} consultas).
          </p>
          {leader.domain !== target ? (
            <p>
              <strong className="text-white">2.</strong> El dominio mas citado por Google AI es <strong className="text-amber-400">{leader.domain}</strong> con {leader.share_by_volume_pct}% del volumen. Tiene {(leader.share_by_volume_pct - (targetSov?.share_by_volume_pct || 0)).toFixed(1)} puntos porcentuales mas de presencia en citaciones AI.
            </p>
          ) : (
            <p>
              <strong className="text-white">2.</strong> <strong className="text-green-400">{target} es el dominio mas citado</strong> por Google AI con {targetSov?.share_by_volume_pct}% del volumen.
            </p>
          )}
          <p>
            <strong className="text-white">3.</strong> Hay <strong className="text-red-400">{r.gap_analysis.total_gaps.toLocaleString()} consultas</strong> ({fmtVol(r.gap_analysis.total_gap_volume)} busquedas/mes) donde Google cita a competidores pero <strong className="text-red-400">ignora a {shortDomain(target)}</strong>. Estas son oportunidades de contenido citable.
          </p>
          <p>
            <strong className="text-white">4.</strong> {shortDomain(target)} tiene <strong className="text-green-400">{r.target_exclusive.count.toLocaleString()} consultas exclusivas</strong> ({fmtVol(r.target_exclusive.total_volume)} busquedas/mes) donde es la unica fuente citada — su territorio defensivo en AI.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 py-4 border-t border-gray-200">
        Informe generado por Mediciones IA — Analisis de Presencia en AI Overviews — {r.metadata.analyzed_at.split('T')[0]}
      </div>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

const AIOverview: React.FC = () => {
  const { selectedProjectId } = useProjectStore();

  const [targetDomain, setTargetDomain] = useState('');
  const [competitors, setCompetitors] = useState<string[]>(['']);
  const [countryCode, setCountryCode] = useState('ES');
  const [keywordsLimit, setKeywordsLimit] = useState(0);

  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedResult, setSelectedResult] = useState<FullResult | null>(null);
  const [estimate, setEstimate] = useState<{ estimatedCost: number; description: string } | null>(null);

  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => { setPrefilled(false); loadHistory(); }, [selectedProjectId]);

  useEffect(() => {
    const validCompetitors = competitors.filter(c => c.trim());
    if (targetDomain && validCompetitors.length > 0) {
      const domainCount = 1 + validCompetitors.length;
      const kwEst = keywordsLimit === 0 ? 2000 : keywordsLimit; // estimar ~2000 para "todas"
      setEstimate({
        estimatedCost: Math.round((domainCount * 0.01 + domainCount * kwEst * 0.0001) * 100) / 100,
        description: keywordsLimit === 0
          ? `${domainCount} dominios x todas las consultas disponibles (~$0.0001/consulta)`
          : `${domainCount} dominios x ${keywordsLimit} consultas`,
      });
    } else {
      setEstimate(null);
    }
  }, [targetDomain, competitors, keywordsLimit]);

  // Pre-rellenar desde historial AI Overview o desde análisis LLM del proyecto
  const prefillFromData = async (aiHistory: HistoryItem[]) => {
    if (prefilled) return;

    // 1. Si hay historial AI Overview → usar el último
    if (aiHistory.length > 0) {
      const last = aiHistory[0]; // ya viene ordenado por fecha desc
      setTargetDomain(last.targetDomain);
      setCompetitors(last.competitors.length > 0 ? last.competitors : ['']);
      setCountryCode(last.countryCode);
      setPrefilled(true);
      return;
    }

  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      const url = selectedProjectId
        ? `${API_BASE_URL}/api/ai-overview/history?projectId=${selectedProjectId}`
        : `${API_BASE_URL}/api/ai-overview/history`;
      const response = await apiFetch(url);
      const data = await response.json();
      if (data.success) {
        setHistory(data.data || []);
        prefillFromData(data.data || []);
      }
    } catch (err) {
      console.error('Error loading AI Overview history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    const validCompetitors = competitors.filter(c => c.trim());
    if (!targetDomain.trim() || validCompetitors.length === 0) {
      setError('Indica el dominio objetivo y al menos un competidor');
      return;
    }
    setExecuting(true);
    setError(null);
    try {
      let userApiKeys: Record<string, string> = {};
      try { const saved = localStorage.getItem('userApiKeys'); if (saved) userApiKeys = JSON.parse(saved); } catch {}

      const response = await apiFetch(`${API_BASE_URL}/api/ai-overview/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDomain: targetDomain.trim(),
          competitors: validCompetitors.map(c => c.trim()),
          countryCode, keywordsLimit,
          projectId: selectedProjectId,
          userApiKeys,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al ejecutar');

      setSelectedResult({
        id: data.data.id, timestamp: data.data.timestamp,
        targetDomain: targetDomain.trim(),
        competitors: validCompetitors.map(c => c.trim()),
        countryCode,
        costUsd: data.data.result.metadata.total_cost_usd,
        results: data.data.result,
      });
      loadHistory();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const viewResult = async (id: string) => {
    try {
      setLoading(true);
      const response = await apiFetch(`${API_BASE_URL}/api/ai-overview/results/${id}`);
      const data = await response.json();
      if (data.success) setSelectedResult(data.data);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const deleteResult = async (id: string) => {
    if (!window.confirm('¿Eliminar este analisis?')) return;
    try {
      await apiFetch(`${API_BASE_URL}/api/ai-overview/results/${id}`, { method: 'DELETE' });
      loadHistory();
      if (selectedResult?.id === id) setSelectedResult(null);
    } catch (err: any) { setError(err.message); }
  };

  const addCompetitor = () => setCompetitors(prev => [...prev, '']);
  const removeCompetitor = (idx: number) => setCompetitors(prev => prev.filter((_, i) => i !== idx));
  const updateCompetitor = (idx: number, value: string) => setCompetitors(prev => prev.map((c, i) => i === idx ? value : c));

  if (selectedResult) {
    return <ReportView data={selectedResult.results} timestamp={selectedResult.timestamp} onBack={() => setSelectedResult(null)} />;
  }

  // ==================== CONFIG + HISTORY VIEW ====================
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <MessageSquareQuote className="h-7 w-7 text-blue-600" />
          Presencia en AI Overviews
        </h1>
        <p className="text-gray-500 mt-1">¿Google te cita como fuente en sus respuestas de IA? Analiza tu visibilidad vs competidores.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Config Form */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            Configuracion del analisis
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tu dominio (el que quieres analizar)</label>
            <input type="text" value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)}
              placeholder="tudominio.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" disabled={executing} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Competidores (contra quien comparar)</label>
            <div className="space-y-2">
              {competitors.map((comp, idx) => (
                <div key={idx} className="flex gap-2">
                  <input type="text" value={comp} onChange={(e) => updateCompetitor(idx, e.target.value)}
                    placeholder="competidor.com" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" disabled={executing} />
                  {competitors.length > 1 && (
                    <button onClick={() => removeCompetitor(idx)} className="p-2 text-gray-400 hover:text-red-500" disabled={executing}><X className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              <button onClick={addCompetitor} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800" disabled={executing}>
                <Plus className="h-4 w-4" /> Agregar competidor
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mercado</label>
            <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" disabled={executing}>
              {COUNTRIES.map(c => (<option key={c.code} value={c.code}>{c.flag} {c.name}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Consultas a analizar por dominio</label>
            <select value={keywordsLimit} onChange={(e) => setKeywordsLimit(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" disabled={executing}>
              <option value={100}>100 (rapido, ~5s)</option>
              <option value={500}>500</option>
              <option value={1000}>1000 (~20s)</option>
              <option value={0}>TODAS (trae todo lo disponible)</option>
            </select>
          </div>

          {estimate && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <DollarSign className="h-4 w-4" />
                <span>Coste estimado: <strong className="text-gray-900">~${estimate.estimatedCost.toFixed(2)} USD</strong></span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{estimate.description}</p>
            </div>
          )}

          <button onClick={handleExecute}
            disabled={executing || !targetDomain.trim() || !competitors.some(c => c.trim())}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
            {executing ? (<><Loader2 className="h-5 w-5 animate-spin" />Consultando AI Overviews...</>) : (<><Play className="h-5 w-5" />Analizar presencia en AI Overviews</>)}
          </button>
        </div>

        {/* History */}
        <div className="lg:col-span-3 bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Informes anteriores
          </h2>

          {loading && !executing ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageSquareQuote className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay informes anteriores</p>
              <p className="text-sm mt-1">Configura tu dominio y competidores para analizar tu presencia en AI Overviews</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map(item => {
                const targetSov = item.shareOfVoice?.find(s => s.is_target);
                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{item.targetDomain}</span>
                        <span className="text-xs text-gray-400">vs {item.competitors.length} competidores</span>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(item.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-600 mb-3">
                      <span>{COUNTRIES.find(c => c.code === item.countryCode)?.flag} {item.countryCode}</span>
                      {targetSov && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Citado en {targetSov.share_by_volume_pct}% del volumen</span>
                      )}
                      {item.uniqueKeywords > 0 && <span className="text-xs text-gray-400">{fmtVol(item.uniqueKeywords)} consultas</span>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => viewResult(item.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                        <Eye className="h-3.5 w-3.5" /> Ver informe
                      </button>
                      <button onClick={() => deleteResult(item.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* EVOLUCIÓN TEMPORAL */}
      <AIOverviewTrends history={history} />
    </div>
  );
};

// ==================== TRENDS COMPONENT ====================

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

const AIOverviewTrends: React.FC<{ history: HistoryItem[] }> = ({ history }) => {
  // Filtrar solo análisis con datos de SoV, ordenados cronológicamente
  const validHistory = useMemo(() =>
    [...history]
      .filter(h => h.shareOfVoice && h.shareOfVoice.length > 0)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [history]
  );

  if (validHistory.length < 2) return null;

  // Recopilar todos los dominios que aparecen en el historial
  const allDomains = useMemo(() => {
    const domainSet = new Set<string>();
    validHistory.forEach(h => h.shareOfVoice?.forEach(s => domainSet.add(s.domain)));
    // Ordenar: target primero, luego por frecuencia de aparición
    const domainFreq: Record<string, number> = {};
    validHistory.forEach(h => h.shareOfVoice?.forEach(s => {
      domainFreq[s.domain] = (domainFreq[s.domain] || 0) + s.total_search_volume;
    }));
    const targetDomain = validHistory[validHistory.length - 1].shareOfVoice?.find(s => s.is_target)?.domain;
    return [...domainSet]
      .sort((a, b) => {
        if (a === targetDomain) return -1;
        if (b === targetDomain) return 1;
        return (domainFreq[b] || 0) - (domainFreq[a] || 0);
      })
      .slice(0, 6);
  }, [validHistory]);

  // SoV por volumen a lo largo del tiempo
  const sovData = useMemo(() =>
    validHistory.map(h => {
      const point: Record<string, any> = {
        label: new Date(h.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      };
      allDomains.forEach(domain => {
        const entry = h.shareOfVoice?.find(s => s.domain === domain);
        point[domain] = entry ? +entry.share_by_volume_pct.toFixed(1) : 0;
      });
      return point;
    }),
    [validHistory, allDomains]
  );

  // Keywords count del target a lo largo del tiempo
  const targetDomain = validHistory[validHistory.length - 1].shareOfVoice?.find(s => s.is_target)?.domain;
  const kwData = useMemo(() =>
    validHistory.map(h => {
      const target = h.shareOfVoice?.find(s => s.is_target);
      return {
        label: new Date(h.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        keywords: target?.keywords_count || 0,
        volume: target?.total_search_volume || 0,
        etv: target?.total_etv || 0,
      };
    }),
    [validHistory]
  );

  // Total keywords analizadas
  const totalKwData = useMemo(() =>
    validHistory.map(h => ({
      label: new Date(h.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      total: h.uniqueKeywords,
    })),
    [validHistory]
  );

  return (
    <div className="space-y-6">
      <div className="border-t pt-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          Evolución temporal
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {validHistory.length} análisis desde {new Date(validHistory[0].timestamp).toLocaleDateString('es-ES')} hasta {new Date(validHistory[validHistory.length - 1].timestamp).toLocaleDateString('es-ES')}
        </p>
      </div>

      {/* SoV por volumen */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Share of Voice por volumen de búsqueda</h3>
        <p className="text-xs text-gray-400 mb-4">% del volumen total de búsquedas donde cada dominio es citado en AI Overviews</p>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={sovData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} unit="%" />
            <Tooltip formatter={(value: number, name: string) => [`${value}%`, name]} />
            <Legend />
            {allDomains.map((domain, i) => (
              <Area
                key={domain}
                type="monotone"
                dataKey={domain}
                stackId="1"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.4}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Fila 2: Keywords target + Total keywords */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Keywords donde aparece el target */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-1">Consultas donde aparece {targetDomain}</h3>
          <p className="text-xs text-gray-400 mb-4">Número de keywords donde tu dominio es citado como fuente</p>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={kwData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="keywords" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Keywords" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ETV del target */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-1">Tráfico estimado (ETV) de {targetDomain}</h3>
          <p className="text-xs text-gray-400 mb-4">Estimated Traffic Value de las consultas donde apareces</p>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={kwData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'ETV']} />
              <Line type="monotone" dataKey="etv" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="ETV ($)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Universo total de keywords */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-800 mb-1">Universo de consultas analizadas</h3>
        <p className="text-xs text-gray-400 mb-4">Total de keywords únicas con AI Overviews encontradas en cada análisis</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={totalKwData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} name="Keywords totales" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AIOverview;
