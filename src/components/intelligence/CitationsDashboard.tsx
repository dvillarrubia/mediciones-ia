import React, { useMemo, useState, useEffect } from 'react';
import { Link2, Globe, ExternalLink, Info, Download } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  AnalysisDetail, COLORS, PERSONA_LABELS, PERSONA_COLORS,
  personasInQuestion, isRealDomain, isWebUrl, dateLabel, sortByDate,
  getBrandAppearanceRows, APPEARANCE_LABELS, APPEARANCE_COLORS, AppearanceType,
  buildCitationGaps
} from './sharedMetrics';
import { DateRangeFilter, Pagination, paginate, filterAnalysesByDateRange } from './dashboardFilters';
import { exportSheetsToExcel, downloadFilename } from './dashboardExcelExport';

const URL_PAGE_SIZE = 50;

interface Props {
  analyses: AnalysisDetail[];
  loading?: boolean;
  brandDomain?: string;
}

interface UrlRank { url: string; domain: string; count: number; }
interface DomainRank { domain: string; count: number; percentage: number; }

const CitationsDashboard: React.FC<Props> = ({ analyses, loading, brandDomain }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AppearanceType>('all');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const scoped = useMemo(
    () => filterAnalysesByDateRange(analyses || [], dateFrom, dateTo),
    [analyses, dateFrom, dateTo]
  );

  // Filas mención/citación de la marca (Hito 2.4)
  const brandRows = useMemo(() => {
    if (!scoped || scoped.length === 0) return [];
    const target = sortByDate(scoped).slice(-1)[0]?.configuration.brand || '';
    return getBrandAppearanceRows(scoped, target, brandDomain || '');
  }, [scoped, brandDomain]);

  const brandCounts = useMemo(() => {
    const c: Record<AppearanceType, number> = { no_aparece: 0, mencion: 0, citacion_com: 0, citacion_blog: 0 };
    brandRows.forEach(r => { c[r.type]++; });
    return c;
  }, [brandRows]);

  // Gap de citaciones (Hito 6.B — GEO)
  const citationGaps = useMemo(() => {
    if (!scoped || scoped.length === 0) return [];
    const target = sortByDate(scoped).slice(-1)[0]?.configuration.brand || '';
    return buildCitationGaps(scoped, target);
  }, [scoped]);

  const data = useMemo(() => {
    if (!scoped || scoped.length === 0) return null;
    const sorted = sortByDate(scoped);

    const urlAcc: Record<string, { domain: string; count: number }> = {};
    const domainAcc: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    let totalCitations = 0;
    let questionsTotal = 0;
    let questionsWithCitation = 0;

    sorted.forEach(a => {
      (a.results?.questions || []).forEach(q => {
        questionsTotal++;
        const webSources = (q.sources || []).filter(s => isWebUrl(s.url));
        if (webSources.length > 0) questionsWithCitation++;
        const personas = personasInQuestion(q);

        webSources.forEach(s => {
          totalCitations++;
          if (!urlAcc[s.url]) urlAcc[s.url] = { domain: s.domain || '', count: 0 };
          urlAcc[s.url].count++;
          if (isRealDomain(s.domain)) domainAcc[s.domain] = (domainAcc[s.domain] || 0) + 1;

          if (personas.length > 0) {
            personas.forEach(p => { byModel[p] = (byModel[p] || 0) + 1; });
          } else {
            byModel['otros'] = (byModel['otros'] || 0) + 1;
          }
        });
      });
    });

    const topUrls: UrlRank[] = Object.entries(urlAcc)
      .map(([url, d]) => ({ url, domain: d.domain, count: d.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    const totalDomainRefs = Object.values(domainAcc).reduce((s, c) => s + c, 0) || 1;
    const topDomains: DomainRank[] = Object.entries(domainAcc)
      .map(([domain, count]) => ({ domain, count, percentage: (count / totalDomainRefs) * 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const modelPie = Object.entries(byModel)
      .map(([k, v]) => ({ name: PERSONA_LABELS[k] || (k === 'otros' ? 'Otros' : k), value: v, color: PERSONA_COLORS[k] }))
      .sort((a, b) => b.value - a.value);

    const overTime = sorted.map(a => {
      let c = 0;
      (a.results?.questions || []).forEach(q => {
        c += (q.sources || []).filter(s => isWebUrl(s.url)).length;
      });
      return { label: dateLabel(a.timestamp), citations: c };
    });

    const citationRate = questionsTotal > 0 ? (questionsWithCitation / questionsTotal) * 100 : 0;
    const uniqueDomains = Object.keys(domainAcc).length;

    return { topUrls, topDomains, modelPie, overTime, totalCitations, citationRate, uniqueDomains, multiple: sorted.length > 1 };
  }, [scoped]);

  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo]);

  const filteredUrls = useMemo(
    () => (data ? data.topUrls.filter(u =>
      !search || u.url.toLowerCase().includes(search.toLowerCase()) || u.domain.toLowerCase().includes(search.toLowerCase())
    ) : []),
    [data, search]
  );

  const handleExport = () => {
    if (!data) return;
    const target = sortByDate(scoped).slice(-1)[0]?.configuration.brand || '';
    const urls: any[][] = [
      ['#', 'URL', 'Dominio', 'Citas'],
      ...filteredUrls.map((u, i) => [i + 1, u.url, u.domain, u.count]),
    ];
    const domains: any[][] = [
      ['Dominio', 'Citas', '% sobre total'],
      ...data.topDomains.map(d => [d.domain, d.count, +d.percentage.toFixed(1)]),
    ];
    const evolucion: any[][] = [
      ['Análisis', 'Citas web'],
      ...data.overTime.map(o => [o.label, o.citations]),
    ];
    const menciones: any[][] = [
      ['Prompt', 'Tipo', 'URL citada', 'Frase', 'Modelo'],
      ...brandRows.map(r => [r.prompt, APPEARANCE_LABELS[r.type], r.url || '', r.phrase || '', r.model]),
    ];
    exportSheetsToExcel(
      downloadFilename('citas', target),
      [
        { name: 'URLs citadas', aoa: urls, cols: [6, 70, 28, 10] },
        { name: 'Dominios', aoa: domains, cols: [32, 10, 14] },
        { name: 'Evolución', aoa: evolucion, cols: [22, 12] },
        { name: 'Menciones marca', aoa: menciones, cols: [50, 14, 60, 60, 16] },
      ]
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Cargando citas…</div>;
  }

  // Barra de fechas + export, reutilizada también en el estado vacío.
  const toolbar = (
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
        disabled={!data}
        className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        <Download className="w-4 h-4" /> Exportar Excel
      </button>
    </div>
  );

  if (!data || data.totalCitations === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="text-center py-20">
          <Link2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No se han detectado citas web en estos análisis.</p>
        </div>
      </div>
    );
  }

  const pagedUrls = paginate(filteredUrls, page, URL_PAGE_SIZE);

  return (
    <div className="space-y-6">
      {toolbar}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Citas totales</div>
          <div className="text-2xl font-bold text-gray-900">{data.totalCitations}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Citation Rate</div>
          <div className="text-2xl font-bold text-indigo-600">{data.citationRate.toFixed(1)}%</div>
          <div className="text-xs text-gray-400">preguntas con ≥1 fuente web</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Dominios únicos</div>
          <div className="text-2xl font-bold text-gray-900">{data.uniqueDomains}</div>
        </div>
      </div>

      {/* Menciones y citaciones de la marca (Hito 2.4) */}
      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-semibold text-gray-900">Menciones y citaciones de la marca</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'mencion', 'citacion_com', 'citacion_blog'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${typeFilter === t ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {t === 'all' ? 'Todas' : APPEARANCE_LABELS[t]}
                {t !== 'all' && <span className="ml-1 opacity-70">{brandCounts[t]}</span>}
              </button>
            ))}
          </div>
        </div>
        {!brandDomain && (
          <p className="text-xs text-amber-600 mb-3 flex items-center gap-1">
            <Info className="w-3 h-3" /> Configura el <strong>dominio de marca</strong> en Configuración → Glosario para distinguir citaciones de menciones.
          </p>
        )}
        {brandRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">La marca no aparece en estos análisis.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Prompt</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">URL citada</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Frase</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Modelo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {brandRows.filter(r => typeFilter === 'all' || r.type === typeFilter).slice(0, 200).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 max-w-xs truncate text-gray-700" title={r.prompt}>{r.prompt}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: APPEARANCE_COLORS[r.type] }}>
                        {APPEARANCE_LABELS[r.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                          <span className="truncate">{r.url}</span><ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 max-w-sm truncate text-gray-500" title={r.phrase || ''}>{r.phrase || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.model}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gap de citaciones (Hito 6.B — GEO) */}
      {citationGaps.length > 0 && (
        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold text-gray-900 mb-1">Gap de citaciones</h3>
          <p className="text-xs text-gray-400 mb-4">Webs de terceros (no de marcas) que la IA cita junto a tus competidores pero nunca contigo → dónde conseguir presencia (PR, colaboraciones, contenido).</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Dominio</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Citas con competencia</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Competidores presentes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {citationGaps.map((g, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      <a href={`https://${g.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                        {g.domain}<ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{g.competitorCitations}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {g.competitors.map((c, j) => (
                          <span key={j} className="bg-orange-50 text-orange-700 text-xs px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Citas por modelo + over time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Link2 className="w-4 h-4 text-blue-500" /> Citations by AI model</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.modelPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={(e: any) => `${((e.value / data.totalCitations) * 100).toFixed(0)}%`}>
                {data.modelPie.map((d, i) => <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {data.multiple ? (
          <div className="bg-white rounded-lg border p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Citations over time</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.overTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Area dataKey="citations" name="Citas" stroke="#6366f1" fill="#c7d2fe" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="bg-white rounded-lg border p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-500" /> Top dominios</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.topDomains} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="domain" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Citas" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top dominios (cuando hay serie temporal arriba) */}
      {data.multiple && (
        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-500" /> Top dominios citados</h3>
          <ResponsiveContainer width="100%" height={Math.max(220, data.topDomains.length * 32)}>
            <BarChart data={data.topDomains} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="domain" width={160} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Citas" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top URLs */}
      <div className="bg-white rounded-lg border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Top URLs citadas</h3>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar URL o dominio…"
              className="text-sm border rounded-md pl-3 pr-3 py-1.5 text-gray-700 w-64"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">URL</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Dominio</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Citas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedUrls.map((u, i) => (
                <tr key={u.url}>
                  <td className="px-3 py-2 text-gray-400">{(page - 1) * URL_PAGE_SIZE + i + 1}</td>
                  <td className="px-3 py-2 max-w-md truncate">
                    <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                      <span className="truncate">{u.url}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{u.domain}</td>
                  <td className="px-3 py-2 text-right font-semibold">{u.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUrls.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">Sin resultados para “{search}”.</p>
          )}
          <Pagination page={page} totalItems={filteredUrls.length} pageSize={URL_PAGE_SIZE} onChange={setPage} />
        </div>
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
          <Info className="w-3 h-3" /> "Citations by AI model" atribuye cada fuente web a los modelos presentes en la pregunta.
        </p>
      </div>
    </div>
  );
};

export default CitationsDashboard;
