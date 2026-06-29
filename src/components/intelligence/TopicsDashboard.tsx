import React, { useMemo, useState, useEffect } from 'react';
import { Hash, Download } from 'lucide-react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AnalysisDetail, normalizeSentimentKey, sortByDate
} from './sharedMetrics';
import { DateRangeFilter, Pagination, paginate, filterAnalysesByDateRange } from './dashboardFilters';
import { exportSheetsToExcel, downloadFilename } from './dashboardExcelExport';

const TOPIC_PAGE_SIZE = 25;

interface Props {
  analyses: AnalysisDetail[];
  loading?: boolean;
}

interface TopicMetric {
  topic: string;
  mentions: number;
  positive: number;
  neutral: number;
  negative: number;
  pctPositive: number;
  pctNegative: number;
  pctNeutral: number;
  net: number;
}

// Color del treemap según net sentiment (rojo → gris → verde)
function netColor(net: number): string {
  if (net >= 60) return '#15803d';
  if (net >= 30) return '#22c55e';
  if (net >= 5) return '#86efac';
  if (net > -5) return '#cbd5e1';
  if (net > -30) return '#f87171';
  return '#dc2626';
}

const TopicsDashboard: React.FC<Props> = ({ analyses, loading }) => {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const scoped = useMemo(
    () => filterAnalysesByDateRange(analyses || [], dateFrom, dateTo),
    [analyses, dateFrom, dateTo]
  );

  const data = useMemo(() => {
    if (!scoped || scoped.length === 0) return null;
    const latest = sortByDate(scoped).slice(-1)[0];

    const acc: Record<string, { mentions: number; pos: number; neu: number; neg: number }> = {};
    (latest.results?.questions || []).forEach(q => {
      const topic = q.category || 'Sin categoría';
      if (!acc[topic]) acc[topic] = { mentions: 0, pos: 0, neu: 0, neg: 0 };
      (q.brandMentions || []).forEach(bm => {
        if (!bm.mentioned) return;
        acc[topic].mentions++;
        const k = normalizeSentimentKey(bm.detailedSentiment || bm.context);
        if (k === 'very_positive' || k === 'positive') acc[topic].pos++;
        else if (k === 'very_negative' || k === 'negative') acc[topic].neg++;
        else acc[topic].neu++;
      });
    });

    const topics: TopicMetric[] = Object.entries(acc)
      .map(([topic, d]) => {
        const total = d.mentions || 1;
        const net = ((d.pos - d.neg) / total) * 100;
        return {
          topic,
          mentions: d.mentions,
          positive: d.pos, neutral: d.neu, negative: d.neg,
          pctPositive: (d.pos / total) * 100,
          pctNegative: (d.neg / total) * 100,
          pctNeutral: (d.neu / total) * 100,
          net,
        };
      })
      .filter(t => t.mentions > 0)
      .sort((a, b) => b.mentions - a.mentions);

    const treemapData = topics.map(t => ({ name: t.topic, size: t.mentions, net: t.net }));
    return { topics, treemapData };
  }, [scoped]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo]);

  const handleExport = () => {
    if (!data) return;
    const target = sortByDate(scoped).slice(-1)[0]?.configuration.brand || '';
    const aoa: any[][] = [
      ['Topic', 'Menciones', 'Positivas', 'Neutras', 'Negativas', '% Positivo', '% Negativo', 'Net (%)'],
      ...data.topics.map(t => [
        t.topic, t.mentions, t.positive, t.neutral, t.negative,
        +t.pctPositive.toFixed(1), +t.pctNegative.toFixed(1), +t.net.toFixed(1),
      ]),
    ];
    exportSheetsToExcel(
      downloadFilename('topics', target),
      [{ name: 'Topics', aoa, cols: [40, 12, 12, 12, 12, 12, 12, 12] }]
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Cargando topics…</div>;
  }

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

  if (!data || data.topics.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="text-center py-20">
          <Hash className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay topics para mostrar.</p>
        </div>
      </div>
    );
  }

  const pagedTopics = paginate(data.topics, page, TOPIC_PAGE_SIZE);

  return (
    <div className="space-y-6">
      {toolbar}

      {/* Treemap */}
      <div className="bg-white rounded-lg border p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Hash className="w-4 h-4 text-indigo-500" /> Topics</h3>
        <ResponsiveContainer width="100%" height={360}>
          <Treemap
            data={data.treemapData}
            dataKey="size"
            stroke="#fff"
            content={<TopicCell />}
          >
            <Tooltip content={<TreemapTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* Topic Details */}
      <div className="bg-white rounded-lg border p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Topic Details</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Topic</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Menciones</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Desglose</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Positivo</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Negativo</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedTopics.map(t => (
                <tr key={t.topic}>
                  <td className="px-3 py-2 font-medium text-gray-900">{t.topic}</td>
                  <td className="px-3 py-2 text-right font-semibold">{t.mentions}</td>
                  <td className="px-3 py-2">
                    <div className="flex h-3 w-40 rounded overflow-hidden bg-gray-100">
                      <div style={{ width: `${t.pctPositive}%`, backgroundColor: '#22c55e' }} />
                      <div style={{ width: `${t.pctNeutral}%`, backgroundColor: '#d1d5db' }} />
                      <div style={{ width: `${t.pctNegative}%`, backgroundColor: '#ef4444' }} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-green-600">{t.pctPositive.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right text-red-600">{t.pctNegative.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: t.net >= 0 ? '#15803d' : '#dc2626' }}>
                    {t.net >= 0 ? '+' : ''}{t.net.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalItems={data.topics.length} pageSize={TOPIC_PAGE_SIZE} onChange={setPage} />
        </div>
      </div>
    </div>
  );
};

// Tooltip del treemap: siempre muestra el nombre del topic (aunque la celda sea pequeña y no quepa la etiqueta).
const TreemapTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload || {};
  if (!d.name) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-sm">
      <div className="font-semibold text-gray-900">{d.name}</div>
      <div className="text-gray-600">{d.size} menciones</div>
      {typeof d.net === 'number' && (
        <div style={{ color: d.net >= 0 ? '#15803d' : '#dc2626' }}>
          Net {d.net >= 0 ? '+' : ''}{d.net.toFixed(0)}%
        </div>
      )}
    </div>
  );
};

// Celda personalizada del treemap: color por net sentiment + etiqueta con nombre y conteo.
const TopicCell: React.FC<any> = (props) => {
  const { x, y, width, height, name, size, net } = props;
  if (width <= 0 || height <= 0) return null;
  const fill = typeof net === 'number' ? netColor(net) : '#3b82f6';
  const showLabel = width > 50 && height > 28;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: '#fff', strokeWidth: 2 }} />
      {showLabel && (
        <>
          <text x={x + 6} y={y + 18} fill="#fff" fontSize={12} fontWeight={600}>{name}</text>
          <text x={x + 6} y={y + 34} fill="#fff" fontSize={11} opacity={0.9}>{size}</text>
        </>
      )}
    </g>
  );
};

export default TopicsDashboard;
