import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Award } from 'lucide-react';

interface ShareOfVoiceData {
  brand: string;
  mentions: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

interface ShareOfVoiceChartProps {
  data: ShareOfVoiceData[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

export default function ShareOfVoiceChart({ data }: ShareOfVoiceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Share of Voice</h3>
        <div className="text-center py-12 text-gray-500">
          <p>No hay datos de menciones de marca disponibles</p>
          <p className="text-sm mt-2">Ejecute algunos análisis para ver el share of voice</p>
        </div>
      </div>
    );
  }

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'stable':
        return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  const getSentimentColor = (sentiment: ShareOfVoiceData['sentiment']) => {
    const total = sentiment.positive + sentiment.neutral + sentiment.negative;
    if (total === 0) return 'text-gray-600';

    const positiveRatio = sentiment.positive / total;
    const negativeRatio = sentiment.negative / total;

    if (positiveRatio > 0.6) return 'text-green-600';
    if (negativeRatio > 0.4) return 'text-red-600';
    return 'text-yellow-600';
  };

  const formatSentiment = (sentiment: ShareOfVoiceData['sentiment']) => {
    const total = sentiment.positive + sentiment.neutral + sentiment.negative;
    if (total === 0) return 'Sin datos';

    const positivePercent = ((sentiment.positive / total) * 100).toFixed(0);
    const neutralPercent = ((sentiment.neutral / total) * 100).toFixed(0);
    const negativePercent = ((sentiment.negative / total) * 100).toFixed(0);

    return `${positivePercent}% pos, ${neutralPercent}% neu, ${negativePercent}% neg`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4">
          <p className="font-semibold text-gray-900 mb-2">{data.brand}</p>
          <div className="space-y-1 text-sm">
            <p className="text-gray-700">
              <span className="font-medium">Share of Voice:</span> {data.percentage.toFixed(1)}%
            </p>
            <p className="text-gray-700">
              <span className="font-medium">Menciones:</span> {data.mentions}
            </p>
            <p className="text-gray-700">
              <span className="font-medium">Sentimiento:</span>
            </p>
            <div className="pl-2 space-y-1">
              <p className="text-green-600">✓ Positivo: {data.sentiment.positive}</p>
              <p className="text-gray-600">− Neutral: {data.sentiment.neutral}</p>
              <p className="text-red-600">✗ Negativo: {data.sentiment.negative}</p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Top 5 marcas para el gráfico
  const chartData = data.slice(0, 5);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Award className="h-6 w-6 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">Share of Voice</h3>
        <span className="text-sm text-gray-500">
          ({data.length} {data.length === 1 ? 'marca' : 'marcas'})
        </span>
      </div>

      {/* Gráfico de barras */}
      <div className="mb-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} unit="%" />
            <YAxis type="category" dataKey="brand" width={120} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="percentage" radius={[0, 8, 8, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla detallada */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Marca
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Menciones
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Share
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tendencia
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sentimiento
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm font-medium text-gray-900">{item.brand}</span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {item.mentions}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {item.percentage.toFixed(1)}%
                    </span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2 w-16">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${item.percentage}%`,
                          backgroundColor: COLORS[index % COLORS.length]
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {getTrendIcon(item.trend)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`text-xs ${getSentimentColor(item.sentiment)}`}>
                    {formatSentiment(item.sentiment)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resumen de líder */}
      {data.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Award className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Líder de Share of Voice
              </p>
              <p className="text-sm text-blue-700 mt-1">
                <span className="font-medium">{data[0].brand}</span> lidera con{' '}
                <span className="font-medium">{data[0].percentage.toFixed(1)}%</span> de las menciones{' '}
                ({data[0].mentions} menciones totales)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
