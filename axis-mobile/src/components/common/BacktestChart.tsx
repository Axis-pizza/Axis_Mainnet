/**
 * BacktestChart - Strategy performance visualization (React Native)
 */

import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line } from 'react-native-svg';

interface BacktestChartProps {
  data: {
    timestamps?: number[];
    values: number[];
    sharpeRatio?: number;
    maxDrawdown?: number;
    volatility?: number;
  };
  height?: number;
  showMetrics?: boolean;
  label?: string;
}

export const BacktestChart = ({
  data,
  height = 140,
  showMetrics = true,
  label = 'ROI (30d)',
}: BacktestChartProps) => {
  const { path, areaPath, change, benchmarkPath, isValid } = useMemo(() => {
    if (!data?.values || !Array.isArray(data.values) || data.values.length < 2) {
      return { path: '', areaPath: '', change: 0, benchmarkPath: '', isValid: false };
    }

    const values = data.values;
    const min = Math.min(...values) * 0.99;
    const max = Math.max(...values) * 1.01;
    const range = max - min || 1;

    const svgWidth = 280;
    const h = height - 40;

    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * svgWidth;
      const y = h - ((v - min) / range) * h;
      return { x, y };
    });

    const pathStr = `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
    const areaStr = `${pathStr} L ${svgWidth},${h} L 0,${h} Z`;
    const startY = points[0].y;
    const benchmarkStr = `M 0,${startY.toFixed(1)} L ${svgWidth},${startY.toFixed(1)}`;
    const change = ((values[values.length - 1] - values[0]) / values[0]) * 100;

    return { path: pathStr, areaPath: areaStr, change, benchmarkPath: benchmarkStr, isValid: true };
  }, [data, height]);

  if (!isValid) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
          Not enough data for simulation
        </Text>
      </View>
    );
  }

  const isPositive = change >= 0;
  const chartColor = isPositive ? '#10B981' : '#EF4444';

  return (
    <View style={{ width: '100%' }}>
      {/* Header Stats */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            {label}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: isPositive ? '#34D399' : '#F87171', fontFamily: 'monospace' }}>
            {isPositive ? '+' : ''}{change.toFixed(2)}%
          </Text>
        </View>
        {showMetrics && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {data.sharpeRatio !== undefined && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Sharpe</Text>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: 'rgba(255,255,255,0.8)' }}>{data.sharpeRatio.toFixed(2)}</Text>
              </View>
            )}
            {data.maxDrawdown !== undefined && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Max DD</Text>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#F87171' }}>{data.maxDrawdown.toFixed(1)}%</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Chart SVG */}
      <Svg width="100%" height={height - 40} viewBox={`0 0 280 ${height - 40}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="backtestGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={chartColor} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={chartColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Benchmark line */}
        <Path
          d={benchmarkPath}
          fill="none"
          stroke="white"
          strokeOpacity="0.1"
          strokeWidth="1"
          strokeDasharray="4,4"
        />

        {/* Area Fill */}
        <Path d={areaPath} fill="url(#backtestGradient)" />

        {/* Main Line */}
        <Path
          d={path}
          fill="none"
          stroke={chartColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
};
