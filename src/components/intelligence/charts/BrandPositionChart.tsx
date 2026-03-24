import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface BrandPoint {
  brand: string;
  mentions: number;
  sentiment: number;
  isTarget: boolean;
}

interface Props {
  data: BrandPoint[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm shadow-lg">
      <p className="font-semibold">{d.brand}</p>
      <p>Menciones: {d.mentions}</p>
      <p>Sentimiento: {d.sentiment > 0 ? '+' : ''}{d.sentiment.toFixed(2)}</p>
    </div>
  );
};

const BrandPositionChart: React.FC<Props> = ({ data }) => {
  if (data.length === 0) return null;

  const targetData = data.filter(d => d.isTarget);
  const competitorData = data.filter(d => !d.isTarget);

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          type="number"
          dataKey="mentions"
          name="Menciones"
          label={{ value: 'Menciones', position: 'bottom', offset: 0, style: { fill: '#6b7280', fontSize: 12 } }}
          tick={{ fill: '#6b7280', fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="sentiment"
          name="Sentimiento"
          domain={[-2, 2]}
          label={{ value: 'Sentimiento', angle: -90, position: 'insideLeft', style: { fill: '#6b7280', fontSize: 12 } }}
          tick={{ fill: '#6b7280', fontSize: 11 }}
        />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        <Tooltip content={<CustomTooltip />} />
        {targetData.length > 0 && (
          <Scatter name="Tu marca" data={targetData} fill="#3b82f6" r={8} />
        )}
        {competitorData.length > 0 && (
          <Scatter name="Competidores" data={competitorData} fill="#9ca3af" r={6} />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
};

export default BrandPositionChart;
