/**
 * StrategyChart - Strategy performance chart using Victory Native (React Native)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { CartesianChart, Area, Line } from 'victory-native';
import { TrendingDown } from 'lucide-react-native';
import { api } from '../../services/api';

interface ChartData {
  x: number;
  y: number;
}

interface StrategyChartProps {
  strategyId: string;
  refreshTrigger?: number;
}

const TIMEFRAMES = [
  { label: '1D', value: '1d' },
  { label: '1W', value: '7d' },
  { label: '1M', value: '30d' },
];

export const StrategyChart = ({ strategyId, refreshTrigger }: StrategyChartProps) => {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const [error, setError] = useState(false);
  const [latestValue, setLatestValue] = useState<number | null>(null);

  useEffect(() => {
    const fetchChart = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await api.getStrategyChart(strategyId, period);
        if (res.success && res.data && res.data.length > 0) {
          setData(res.data.map((d: any) => ({ x: d.time, y: d.value })));
          setLatestValue(res.data[res.data.length - 1].value);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (strategyId) {
      fetchChart();
    }
  }, [strategyId, period, refreshTrigger]);

  const percentChange = latestValue ? latestValue - 100 : 0;
  const isPositive = percentChange >= 0;
  const chartColor = isPositive ? '#10B981' : '#EF4444';
  const areaColor = isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';

  if (loading && data.length === 0) {
    return (
      <View style={{ height: 256, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16 }}>
        <ActivityIndicator size="large" color="#B8863F" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ height: 256, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16 }}>
        <TrendingDown size={32} color="rgba(255,255,255,0.3)" />
        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 8 }}>Chart data unavailable</Text>
      </View>
    );
  }

  return (
    <View style={{ width: '100%' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 8 }}>
        <View>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Performance
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#fff' }}>
              {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
            </Text>
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: isPositive ? '#34D399' : '#F87171' }}>
                {TIMEFRAMES.find((t) => t.value === period)?.label}
              </Text>
            </View>
          </View>
        </View>

        {/* Timeframe Selector */}
        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 2, borderWidth: 1, borderColor: 'rgba(184,134,63,0.15)' }}>
          {TIMEFRAMES.map((tf) => (
            <Pressable
              key={tf.value}
              onPress={() => setPeriod(tf.value)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: period === tf.value ? 'rgba(255,255,255,0.1)' : 'transparent',
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: period === tf.value ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                {tf.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Chart */}
      {data.length >= 2 && (
        <View style={{ height: 240, width: '100%' }}>
          <CartesianChart
            data={data}
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
                  color={areaColor}
                  curveType="natural"
                />
                <Line
                  points={points.y}
                  color={chartColor}
                  strokeWidth={2}
                  curveType="natural"
                />
              </>
            )}
          </CartesianChart>
        </View>
      )}
    </View>
  );
};
