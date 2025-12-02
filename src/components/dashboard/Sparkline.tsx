import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export default function Sparkline({ data, color = '#3B82F6', height = 40 }: SparklineProps) {
  // Transform data into format Recharts expects
  const chartData = data.map((value, index) => ({
    index,
    value
  }));

  // Calculate trend direction
  const trend = data.length >= 2 ? data[data.length - 1] - data[0] : 0;
  const trendColor = trend > 0 ? '#10B981' : trend < 0 ? '#EF4444' : color;

  return (
    <div className="relative" style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={trendColor}
            strokeWidth={2}
            dot={false}
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
