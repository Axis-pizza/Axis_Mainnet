/**
 * MiniChart - Small animated sparkline chart (React Native)
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export const MiniChart = ({
  isPositive,
  intensity,
}: {
  isPositive: boolean;
  intensity: number;
}) => {
  const color = isPositive ? '#10B981' : '#EF4444';

  return (
    <View style={{ width: '100%', height: 96, marginTop: 8, marginBottom: 16 }}>
      <Svg viewBox="0 0 200 60" width="100%" height="100%">
        <Defs>
          <LinearGradient id={`grad-${isPositive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Background gradient area */}
        <Path
          d="M0,45 Q20,35 40,50 T80,25 T120,45 T160,15 T200,30 V60 H0 Z"
          fill={`url(#grad-${isPositive ? 'up' : 'down'})`}
        />

        {/* Main line */}
        <Path
          d="M0,45 Q20,35 40,50 T80,25 T120,45 T160,15 T200,30"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
};
