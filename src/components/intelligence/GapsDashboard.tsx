import React, { useMemo, useState, useEffect } from 'react';
import { Crosshair, Info, CalendarDays, Users, Download } from 'lucide-react';
import {
  AnalysisDetail, sortByDate, buildGapsMatrix, buildCompetitiveView,
  APPEARANCE_LABELS, APPEARANCE_COLORS, AppearanceType
} from './sharedMetrics';
import { DateRangeFilter, filterAnalysesByDateRange } from './dashboardFilters';
import { exportSheetsToExcel, downloadFilename } from './dashboardExcelExport';

interface Props {
  analyses: AnalysisDetail[];
  loading?: boolean;
  brandDomain?: string;
}

const LEGEND: AppearanceType[] = ['no_aparece', 'mencion', 'citacion_com', 'citacion_blog'];
const TYPE_SHORT: Record<AppearanceType, string> = {
  no_aparece: 'No aparece', mencion: 'Mención', citacion_com: 'sitio', citacion_blog: 'blog',
};

const GapsDashboard: React.FC<Props> = ({ analyses, loading, brandDomain }) => {
  const [view, setView] = useState<'temporal' | 'competencia'>('temporal');

  // --- temporal ---
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [competitor, setCompetitor] = useState<string>('all');

  // --- competencia ---
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>('');
  const [compCompetitor, setCompCompetitor] = useState<string>('all');
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [onlyNotFirst, setOnlyNotFirst] = useState(false);

  // --- rango de fechas (común a ambas vistas) ---
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const scoped = useMemo(
    () => filterAnalysesByDateRange(analyses || [], dateFrom, dateTo),
    [analyses, dateFrom, dateTo]
  );

  const sorted = useMemo(() => sortByDate(scoped), [scoped]);
  const targetBrand = sorted.slice(-1)[0]?.configuration.brand || '';

  useEffect(() => {
    if (sorted.length === 0) return;
    // Si no hay selección o la actual quedó fuera del rango de fechas, elige el último.
    if (!selectedAnalysisId || !sorted.some(a => a.id === selectedAnalysisId)) {
      setSelectedAnalysisId(sorted[sorted.length - 1].id);
    }
  }, [sorted, selectedAnalysisId]);

  const matrix = useMemo(
    () => (sorted.length > 0 ? buildGapsMatrix(sorted, targetBrand, brandDomain || '') : null),
    [sorted, targetBrand, brandDomain]
  );

  const selectedAnalysis = sorted.find(a => a.id === selectedAnalysisId) || sorted[sorted.length - 1] || null;
  const competitive = useMemo(
    () => buildCompetitiveView(selectedAnalysis, targetBrand, brandDomain || ''),
    [selectedAnalysis, targetBrand, brandDomain]
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Cargando GAPS…</div>;
  }
  if (!matrix || matrix.rows.length === 0) {
    return (
      <div className="space-y-4">
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={({ dateFrom, dateTo }) => { setDateFrom(dateFrom); setDateTo(dateTo); }}
          count={scoped.length}
          total={analyses?.length}
        />
        <div className="text-center py-20">
          <Crosshair className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay prompts para analizar GAPS.</p>
        </div>
      </div>
    );
  }

  const Legend = () => (
    <div className="flex items-center gap-4 flex-wrap text-xs text-gray-600">
      {LEGEND.map(t => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: APPEARANCE_COLORS[t] }} />
          {APPEARANCE_LABELS[t]}
        </span>
      ))}
      {!brandDomain && (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <Info className="w-3 h-3" /> Configura el dominio de marca para distinguir citaciones (.com / blog).
        </span>
      )}
    </div>
  );

  const posBadge = (type: AppearanceType, position: number | null) => {
    const label = type === 'no_aparece' ? 'No aparece' : `pos. ${position ?? '?'} — ${TYPE_SHORT[type]}`;
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white whitespace-nowrap" style={{ backgroundColor: APPEARANCE_COLORS[type] }}>
        {label}
      </span>
    );
  };

  // ---- filtros aplicados ----
  const temporalRows = matrix.rows.filter(r => {
    if (onlyGaps && !r.absentLatest) return false;
    if (competitor !== 'all' && !r.competitors.includes(competitor)) return false;
    return true;
  });

  const compRows = competitive.rows.filter(r => {
    if (onlyAbsent && r.type !== 'no_aparece') return false;
    if (onlyNotFirst && r.isFirst) return false;
    if (compCompetitor !== 'all' && !r.competitors.some(c => c.brand === compCompetitor)) return false;
    return true;
  });

  // Export: matriz temporal (prompt × análisis) respetando los filtros de la vista temporal.
  const handleExport = () => {
    const header = ['Prompt', 'Categoría', ...matrix.columns.map(c => c.label)];
    const rows = temporalRows.map(row => [
      row.prompt,
      row.category || '',
      ...matrix.columns.map(c => {
        const cell = row.cells[c.id];
        const type = cell?.type || 'no_aparece';
        if (type === 'no_aparece') return 'No aparece';
        return `${APPEARANCE_LABELS[type]}${cell?.position ? ` #${cell.position}` : ''}`;
      }),
    ]);
    const target = sorted.slice(-1)[0]?.configuration.brand || '';
    exportSheetsToExcel(
      downloadFilename('gaps', target),
      [{ name: 'Matriz GAPS', aoa: [header, ...rows], cols: [50, 20, ...matrix.columns.map(() => 16)] }]
    );
  };

  return (
    <div className="space-y-5">
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

      {/* Switch de vista */}
      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => setView('temporal')}
          className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-2 ${view === 'temporal' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
        >
          <CalendarDays className="w-4 h-4" /> Evolución temporal <span className="opacity-70">{matrix.columns.length} análisis</span>
        </button>
        <button
          onClick={() => setView('competencia')}
          className={`px-4 py-2 text-sm font-medium inline-flex items-center gap-2 ${view === 'competencia' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
        >
          <Users className="w-4 h-4" /> Por competencia
        </button>
      </div>

      {/* ===== VISTA TEMPORAL ===== */}
      {view === 'temporal' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setOnlyGaps(v => !v)}
                className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${onlyGaps ? 'border-red-600 bg-red-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                ● Solo GAPS (no aparece)
              </button>
              <select value={competitor} onChange={(e) => setCompetitor(e.target.value)} className="text-sm border rounded-md px-3 py-1.5 text-gray-700">
                <option value="all">Competencia: todos</option>
                {matrix.allCompetitors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <span className="text-xs text-gray-400">{temporalRows.length} de {matrix.rows.length} prompts</span>
          </div>

          <Legend />

          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">Prompt</th>
                  {matrix.columns.map(c => (
                    <th key={c.id} className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {temporalRows.slice(0, 200).map(row => (
                  <tr key={row.promptKey} className="hover:bg-gray-50">
                    <td className="px-4 py-2 sticky left-0 bg-white z-10 max-w-sm">
                      <div className="truncate text-gray-800" title={row.prompt}>{row.prompt}</div>
                      {row.category && <div className="text-xs text-gray-400">{row.category}</div>}
                    </td>
                    {matrix.columns.map(c => {
                      const cell = row.cells[c.id];
                      const type = cell?.type || 'no_aparece';
                      const title = `${APPEARANCE_LABELS[type]}${cell?.position ? ` · pos #${cell.position}` : ''}`;
                      return (
                        <td key={c.id} className="px-3 py-2 text-center" title={title}>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white mx-auto" style={{ backgroundColor: APPEARANCE_COLORS[type] }}>
                            {type !== 'no_aparece' && cell?.position ? cell.position : ''}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Info className="w-3 h-3" /> Ordenado por severidad (más ausencias primero). El número dentro del punto es la posición de la marca.{temporalRows.length > 200 ? ` Mostrando 200 de ${temporalRows.length}.` : ''}
          </p>
        </>
      )}

      {/* ===== VISTA POR COMPETENCIA ===== */}
      {view === 'competencia' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={selectedAnalysisId} onChange={(e) => setSelectedAnalysisId(e.target.value)} className="text-sm border rounded-md px-3 py-1.5 text-gray-700">
                {sorted.slice().reverse().map(a => (
                  <option key={a.id} value={a.id}>{new Date(a.timestamp).toLocaleDateString('es-ES')}</option>
                ))}
              </select>
              <select value={compCompetitor} onChange={(e) => setCompCompetitor(e.target.value)} className="text-sm border rounded-md px-3 py-1.5 text-gray-700">
                <option value="all">Todos los competidores</option>
                {competitive.competitors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="text-sm text-gray-600 inline-flex items-center gap-2">
                <input type="checkbox" checked={onlyNotFirst} onChange={(e) => setOnlyNotFirst(e.target.checked)} />
                Solo donde no soy nº1
              </label>
              <label className="text-sm text-gray-600 inline-flex items-center gap-2">
                <input type="checkbox" checked={onlyAbsent} onChange={(e) => setOnlyAbsent(e.target.checked)} />
                Solo donde NO aparece la marca
              </label>
            </div>
            <span className="text-xs text-gray-400">{compRows.length} prompts</span>
          </div>

          <Legend />

          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Prompt</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Posición {targetBrand}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Competidores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compRows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 max-w-sm">
                      <div className="truncate text-gray-800" title={r.prompt}>{r.prompt}</div>
                      {r.category && <div className="text-xs text-gray-400">{r.category}</div>}
                    </td>
                    <td className="px-4 py-2">{posBadge(r.type, r.position)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {r.competitors.length === 0 && <span className="text-gray-300">—</span>}
                        {r.competitors.map((c, j) => (
                          <span key={j} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                            {c.position ? <span className="font-semibold text-gray-500">#{c.position}</span> : null} {c.brand}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {compRows.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400">No hay prompts que cumplan el filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Info className="w-3 h-3" /> Se muestran todos los prompts del análisis. Usa los filtros para ver solo gaps (no nº1 / no aparece). Ordenado peores primero.{compRows.length > 200 ? ` Mostrando 200 de ${compRows.length}.` : ''}
          </p>
        </>
      )}
    </div>
  );
};

export default GapsDashboard;
