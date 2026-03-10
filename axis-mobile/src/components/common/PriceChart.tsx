/**
 * PriceChart - Token price history visualization (React Native)
 */

import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { api } from '../../services/api';

interface PriceChartProps {
  tokenAddress: string;
  height?: number;
  showControls?: boolean;
  color?: string;
}

export const PriceChart = ({
  tokenAddress,
  height = 120,
  showControls = true,
  color = '#10b981',
}: PriceChartProps) => {
  const [data, setData] = useState<{ timestamp: number; price: number }[]>([]);
  const [interval, setInterval] = useState<'1h' | '1d' | '1w'>('1d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await api.getTokenHistory(tokenAddress, interval);
        if (res.success && res.history?.data) {
          setData(res.history.data);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };

    if (tokenAddress) {
      fetchHistory();
    }
  }, [tokenAddress, interval]);

  const { path, change, minPrice, maxPrice } = useMemo(() => {
    if (data.length < 2) return { path: '', change: 0, minPrice: 0, maxPrice: 0 };

    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const svgWidth = 300;
    const h = height - 20;

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * svgWidth;
      const y = h - ((d.price - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const change = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;

    return {
      path: `M ${points.join(' L ')}`,
      change,
      minPrice: min,
      maxPrice: max,
    };
  }, [data, height]);

  const isPositive = change >= 0;
  const chartColor = isPositive ? color : '#ef4444';

  if (loading) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color="#B8863F" />
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No price data available</Text>
      </View>
    );
  }

  return (
    <View style={{ position: 'relative' }}>
      {showControls && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: isPositive ? '#34D399' : '#F87171' }}>
            {isPositive ? '+' : ''}{change.toFixed(2)}%
          </Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['1h', '1d', '1w'] as const).map((i) => (
              <Pressable
                key={i}
                onPress={() => setInterval(i)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  backgroundColor: interval === i ? 'rgba(255,255,255,0.1)' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, color: interval === i ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                  {i.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Svg
        viewBox={`0 0 300 ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id={`chartGradient-${tokenAddress.slice(0, 8)}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={chartColor} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={chartColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Area fill */}
        <Path
          d={`${path} L 300,${height - 20} L 0,${height - 20} Z`}
          fill={`url(#chartGradient-${tokenAddress.slice(0, 8)})`}
        />

        {/* Line */}
        <Path
          d={path}
          fill="none"
          stroke={chartColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </Svg>

      {/* Price labels */}
      <View style={{ position: 'absolute', right: 0, top: showControls ? 40 : 0, bottom: 20, justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>${maxPrice.toFixed(2)}</Text>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>${minPrice.toFixed(2)}</Text>
      </View>
    </View>
  );
};
