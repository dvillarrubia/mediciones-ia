import React, { useMemo, useState } from 'react';
import { Download, CheckSquare, Square } from 'lucide-react';
import { DateRangeFilter, filterAnalysesByDateRange } from './dashboardFilters';
import { exportSheetsToExcel, downloadFilename, type SheetSpec } from './dashboardExcelExport';
import {
  type AnalysisDetail,
  type BrandAlias,
  sortByDate,
  brandNameVariants,
  isWebUrl,
  isRealDomain,
  buildTopicMetrics,
  buildBrandSentiment,
  buildCitationGaps,
  buildPositionDistribution,
  buildModelVisibility,
  getBrandAppearanceRows,
  buildGapsMatrix,
  APPEARANCE_LABELS,
  SENTIMENT_LABELS,
  SENTIMENT_KEYS,
  modelLabel,
  modelosDelRango,
} from './sharedMetrics';

interface Props {
  analyses: AnalysisDetail[];
  loading?: boolean;
  brandDomain?: string;
  brandAliases?: BrandAlias[];
}

/** Bloques exportables. `build` devuelve las hojas de ese bloque. */
interface Bloque {
  id: string;
  label: string;
  descripcion: string;
}

const BLOQUES: Bloque[] = [
  { id: 'metricas',   label: 'Métricas',      descripcion: 'Visibilidad por modelo y distribución de posición' },
  { id: 'sentimiento', label: 'Sentimiento',  descripcion: 'Distribución por marca y detalle por mención' },
  { id: 'topics',     label: 'Topics',        descripcion: 'Menciones y sentimiento por categoría' },
  { id: 'citas',      label: 'URLs / Citas',  descripcion: 'Dominios citados, menciones de marca y gap de citaciones' },
  { id: 'gaps',       label: 'GAPS',          descripcion: 'Matriz de prompts × fecha' },
];

export const DownloadsDashboard: React.FC<Props> = ({ analyses, loading, brandDomain, brandAliases }) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(BLOQUES.map(b => b.id)));

  const scoped = useMemo(
    () => filterAnalysesByDateRange(analyses || [], dateFrom, dateTo),
    [analyses, dateFrom, dateTo]
  );

  const target = useMemo(
    () => sortByDate(scoped).slice(-1)[0]?.configuration?.brand || '',
    [scoped]
  );

  const alternar = (id: string) => {
    setSeleccion(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const construirHojas = (): SheetSpec[] => {
    const hojas: SheetSpec[] = [];
    const nombres = brandNameVariants(target, brandAliases);

    if (seleccion.has('metricas')) {
      const vis = buildModelVisibility(scoped, target);
      hojas.push({
        name: 'Visibilidad por modelo',
        aoa: [
          ['Modelo', 'Respuestas', 'Con la marca', '% menciones', 'Share of Voice (%)', 'Posición media'],
          ...vis.map(v => [
            v.label, v.responses, v.mentioned,
            +v.mentionRate.toFixed(1), +v.sovPct.toFixed(1),
            v.avgPosition == null ? '' : +v.avgPosition.toFixed(2),
          ]),
        ],
        cols: [26, 12, 14, 14, 18, 16],
      });
      const d = buildPositionDistribution(scoped, target).current;
      hojas.push({
        name: 'Distribución posición',
        aoa: [
          ['Bucket', 'Preguntas', '% sobre total'],
          ['Posición 1', d.p1, d.total ? +((d.p1 / d.total) * 100).toFixed(1) : 0],
          ['Posición 2-3', d.p2_3, d.total ? +((d.p2_3 / d.total) * 100).toFixed(1) : 0],
          ['Posición 4-7', d.p4_7, d.total ? +((d.p4_7 / d.total) * 100).toFixed(1) : 0],
          ['Posición 8+', d.p8plus, d.total ? +((d.p8plus / d.total) * 100).toFixed(1) : 0],
        ],
        cols: [18, 12, 14],
      });
    }

    if (seleccion.has('sentimiento')) {
      const marcas = buildBrandSentiment(scoped, target);
      hojas.push({
        name: 'Sentimiento resumen',
        aoa: [
          ['Marca', 'Objetivo', 'Menciones', ...SENTIMENT_KEYS.map(k => SENTIMENT_LABELS[k]), 'Net (%)'],
          ...marcas.map(b => [
            b.brand, b.isTarget ? 'sí' : '',
            b.total, ...SENTIMENT_KEYS.map(k => b.counts[k]), +b.net.toFixed(1),
          ]),
        ],
        cols: [28, 10, 12, 14, 12, 12, 12, 14, 12],
      });

      const detalle: (string | number)[][] = [['Marca', 'Sentimiento', 'Modelo', 'Categoría', 'Pregunta', 'Evidencia']];
      scoped.forEach(a => (a.results?.questions || []).forEach(q => {
        (q.brandMentions || []).forEach(bm => {
          if (!bm.mentioned) return;
          detalle.push([
            bm.brand || '',
            SENTIMENT_LABELS[(bm.detailedSentiment || bm.context || 'neutral') as keyof typeof SENTIMENT_LABELS] || String(bm.detailedSentiment || ''),
            modelLabel(q.multiModelAnalysis?.[0]),
            q.category || '',
            q.question || '',
            (bm.evidence || [])[0] || '',
          ]);
        });
      }));
      hojas.push({ name: 'Sentimiento detalle', aoa: detalle, cols: [24, 14, 20, 20, 60, 70] });
    }

    if (seleccion.has('topics')) {
      const topics = buildTopicMetrics(scoped);
      hojas.push({
        name: 'Topics',
        aoa: [
          ['Topic', 'Menciones', 'Positivas', 'Neutras', 'Negativas', '% Positivo', '% Negativo', 'Net (%)'],
          ...topics.map(t => [
            t.topic, t.mentions, t.positive, t.neutral, t.negative,
            +t.pctPositive.toFixed(1), +t.pctNegative.toFixed(1), +t.net.toFixed(1),
          ]),
        ],
        cols: [40, 12, 12, 12, 12, 12, 12, 12],
      });
    }

    if (seleccion.has('citas')) {
      const dominios: Record<string, number> = {};
      scoped.forEach(a => (a.results?.questions || []).forEach(q => {
        (q.sources || []).forEach(s => {
          if (!isWebUrl(s.url) || !isRealDomain(s.domain)) return;
          dominios[s.domain] = (dominios[s.domain] || 0) + 1;
        });
      }));
      hojas.push({
        name: 'Dominios citados',
        aoa: [['Dominio', 'Citas'], ...Object.entries(dominios).sort((a, b) => b[1] - a[1]).map(([d, c]) => [d, c])],
        cols: [36, 10],
      });

      const filas = getBrandAppearanceRows(scoped, target, brandDomain || '', nombres);
      hojas.push({
        name: 'Menciones marca',
        aoa: [
          ['Prompt', 'Tipo', 'URL citada', 'Frase', 'Modelo'],
          ...filas.map(r => [r.prompt, APPEARANCE_LABELS[r.type], r.url || '', r.phrase || '', r.model]),
        ],
        cols: [50, 16, 60, 60, 18],
      });

      const gaps = buildCitationGaps(scoped, target);
      hojas.push({
        name: 'Gap de citaciones',
        aoa: [
          ['Dominio', 'Citas con competencia', 'Competidores configurados', 'Marcas descubiertas'],
          ...gaps.map(g => [g.domain, g.competitorCitations || 0, g.competitors.join(', '), g.discovered.join(', ')]),
        ],
        cols: [34, 20, 42, 42],
      });
    }

    if (seleccion.has('gaps')) {
      const m = buildGapsMatrix(scoped, target, brandDomain || '', nombres);
      hojas.push({
        name: 'Matriz GAPS',
        aoa: [
          ['Prompt', 'Categoría', ...m.columns.map(c => c.labelWithModel), 'Ausencias'],
          ...m.rows.map(r => [
            r.prompt,
            r.category || '',
            ...m.columns.map(c => APPEARANCE_LABELS[r.cells[c.id]?.type] || '—'),
            r.absentCount,
          ]),
        ],
        cols: [60, 20, ...m.columns.map(() => 26), 12],
      });
    }

    return hojas;
  };

  const descargar = () => {
    const hojas = construirHojas();
    if (hojas.length === 0) return;
    exportSheetsToExcel(downloadFilename('informe', target, modelosDelRango(scoped)), hojas);
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Cargando…</div>;

  const sinDatos = !scoped || scoped.length === 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Descargar informe en Excel</h3>
        <p className="text-sm text-gray-500 mb-4">
          Un único archivo con las pestañas que elijas, listo para redactar el informe a partir de él.
          El filtro de fechas se aplica a todas por igual.
        </p>

        <div className="mb-4">
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={({ dateFrom: f, dateTo: t }) => { setDateFrom(f); setDateTo(t); }}
          />
          <p className="text-xs text-gray-400 mt-1">
            {sinDatos
              ? 'No hay análisis en el rango seleccionado.'
              : `${scoped.length} análisis en el rango · marca: ${target || '—'}`}
          </p>
        </div>

        <div className="space-y-2 mb-5">
          {BLOQUES.map(b => {
            const activo = seleccion.has(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => alternar(b.id)}
                className={`w-full flex items-start gap-3 text-left px-3 py-2 rounded-lg border transition-colors ${
                  activo ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {activo
                  ? <CheckSquare className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  : <Square className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />}
                <span>
                  <span className={`block text-sm font-medium ${activo ? 'text-blue-900' : 'text-gray-700'}`}>{b.label}</span>
                  <span className="block text-xs text-gray-500">{b.descripcion}</span>
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={descargar}
          disabled={sinDatos || seleccion.size === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          <Download className="w-4 h-4" />
          Descargar Excel ({seleccion.size} {seleccion.size === 1 ? 'bloque' : 'bloques'})
        </button>
      </div>
    </div>
  );
};

export default DownloadsDashboard;
