import React, { memo } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import { formatCompactUSD } from '../../../utils/formatNumber';
import type { JupiterToken } from '../../../services/jupiter';

export interface PredictionGroup {
  marketId: string;
  marketQuestion: string;
  eventTitle: string;
  image: string;
  expiry: string;
  totalVolume?: number;
  yesToken?: JupiterToken;
  noToken?: JupiterToken;
}

export const PredictionEventCard = memo(
  ({
    group,
    selectedSide,
    onClick,
  }: {
    group: PredictionGroup;
    selectedSide?: 'YES' | 'NO';
    onClick: () => void;
  }) => {
    const yesProb = group.yesToken?.price != null ? (group.yesToken.price * 100).toFixed(1) : '50.0';
    const noProb = group.noToken?.price != null ? (group.noToken.price * 100).toFixed(1) : '50.0';

    const formattedDate = group.expiry
      ? new Date(group.expiry).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    return (
      <Pressable
        onPress={onClick}
        style={{
          width: '100%',
          marginBottom: 16,
          padding: 16,
          borderRadius: 16,
          backgroundColor: 'rgba(255,255,255,0.03)',
          borderWidth: 1,
          borderColor: selectedSide ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)',
        }}
      >
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
          {/* Event Image */}
          <Image
            source={{ uri: group.image }}
            style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' }}
          />

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }} numberOfLines={1}>
                {group.eventTitle}
              </Text>
            </View>

            <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff', lineHeight: 20 }} numberOfLines={2}>
              {group.marketQuestion}
            </Text>

            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>Expires:</Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '500', fontFamily: 'monospace' }}>{formattedDate}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#34D399', fontFamily: 'monospace' }}>Y: {yesProb}%</Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>|</Text>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#F87171', fontFamily: 'monospace' }}>N: {noProb}%</Text>
              </View>
            </View>
          </View>

          <View style={{ justifyContent: 'center', paddingLeft: 8 }}>
            <ChevronRight size={18} color="#F59E0B" />
          </View>
        </View>

        {selectedSide && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, backgroundColor: 'rgba(245,158,11,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' }}>
            <Check size={12} color="#FBBF24" />
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FBBF24' }}>{selectedSide} INCLUDED</Text>
          </View>
        )}

        {/* Probability Bar */}
        <View style={{ height: 4, width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2, flexDirection: 'row', overflow: 'hidden' }}>
          <View style={{ width: `${yesProb}%` as any, height: '100%', backgroundColor: 'rgba(16,185,129,0.5)' }} />
          <View style={{ width: `${noProb}%` as any, height: '100%', backgroundColor: 'rgba(239,68,68,0.5)' }} />
        </View>
      </Pressable>
    );
  }
);
