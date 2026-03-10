import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import { TokenImage } from '../../common/TokenImage';
import { formatCompactUSD } from '../../../utils/formatNumber';
import type { JupiterToken } from '../../../services/jupiter';

export const StockTokenCard = memo(
  ({
    token,
    isSelected,
    onSelect,
  }: {
    token: JupiterToken;
    isSelected: boolean;
    onSelect: () => void;
  }) => {
    return (
      <Pressable
        onPress={onSelect}
        disabled={isSelected}
        style={{
          flex: 1,
          alignItems: 'center',
          padding: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isSelected ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.05)',
          backgroundColor: isSelected ? 'rgba(120,61,10,0.4)' : 'rgba(255,255,255,0.05)',
          position: 'relative',
        }}
      >
        {/* Selection Badge */}
        <View
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: isSelected ? '#F59E0B' : 'rgba(255,255,255,0.1)',
            backgroundColor: isSelected ? '#F59E0B' : 'rgba(0,0,0,0.2)',
          }}
        >
          {isSelected ? <Check size={14} color="#000" /> : <Plus size={14} color="rgba(255,255,255,0.3)" />}
        </View>

        {/* Logo */}
        <View style={{ marginBottom: 12 }}>
          <TokenImage
            src={token.logoURI}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: isSelected ? 2 : 0,
              borderColor: isSelected ? '#F59E0B' : 'transparent',
            }}
          />
        </View>

        {/* Info */}
        <View style={{ alignItems: 'center', width: '100%' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: isSelected ? '#FBBF24' : '#fff', marginBottom: 2 }} numberOfLines={1}>
            {token.symbol}
          </Text>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }} numberOfLines={1}>
            {token.name}
          </Text>
        </View>

        {/* Metrics */}
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Price</Text>
          <Text style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>
            {token.price ? `$${token.price.toLocaleString()}` : formatCompactUSD(token.dailyVolume)}
          </Text>
        </View>
      </Pressable>
    );
  },
  (prev, next) => prev.isSelected === next.isSelected && prev.token.address === next.token.address
);
