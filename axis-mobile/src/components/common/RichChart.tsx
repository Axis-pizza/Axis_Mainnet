/**
 * RichChart - Smooth area chart using Victory Native (React Native)
 * Replaces Lightweight Charts from web version
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { CartesianChart, Area, Line } from 'victory-native';
import { useFont } from '@shopify/react-native-skia';

interface RichChartProps {
  data: any[];
  isPositive: boolean;
  height?: number;
  colors?: {
    lineColor?: string;
    areaTopColor?: string;
    areaBottomColor?: string;
  };
}

function emaSmooth(values: number[], alpha = 0.25) {
  if (values.length === 0) return [];
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function normalizeData(raw: any[]) {
  if (!raw || raw.length === 0) return [];

  const normalized = raw
    .map((d) => {
      const time = d?.time ?? d?.timestamp ?? 0;
      const value =
        typeof d?.value === 'number'
          ? d.value
          : typeof d?.close === 'number'
          ? d.close
          : typeof d?.price === 'number'
          ? d.price
          : null;

      if (!time || value === null || typeof value !== 'number' || Number.isNaN(value)) return null;
      return { x: Number(time), y: value };
    })
    .filter(Boolean) as { x: number; y: number }[];

  normalized.sort((a, b) => a.x - b.x);
  return normalized.filter((v, i, arr) => i === 0 || v.x !== arr[i - 1].x);
}

export const RichChart = ({ data, isPositive, height = 300, colors }: RichChartProps) => {
  const chartData = useMemo(() => {
    const base = normalizeData(data);
    if (base.length <= 2) return base;

    const values = base.map((d) => d.y);
    const smoothValues = emaSmooth(values, 0.18);

    return base.map((d, i) => ({ x: d.x, y: smoothValues[i] }));
  }, [data]);

  const mainColor = colors?.lineColor || (isPositive ? '#10B981' : '#EF4444');
  const topColor = colors?.areaTopColor || (isPositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)');

  if (chartData.length < 2) {
    return <View style={{ height, backgroundColor: 'transparent' }} />;
  }

  return (
    <View style={{ height, width: '100%' }}>
      <CartesianChart
        data={chartData}
        xKey="x"
        yKeys={["y"]}
        domainPadding={{ top: 20 }}
        axisOptions={{ tickCount: 0, labelOffset: 0 }}
      >
        {({ points, chartBounds }) => (
          <>
            <Area
              points={points.y}
              y0={chartBounds.bottom}
              color={topColor}
              curveType="natural"
            />
            <Line
              points={points.y}
              color={mainColor}
              strokeWidth={2}
              curveType="natural"
            />
          </>
        )}
      </CartesianChart>
    </View>
  );
};
