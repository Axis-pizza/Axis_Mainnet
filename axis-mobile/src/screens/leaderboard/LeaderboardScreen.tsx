/**
 * LeaderboardScreen - Vault Rankings (React Native)
 */

import React from 'react';
import { View, Text, FlatList, Pressable, SafeAreaView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, TrendingUp } from 'lucide-react-native';
import { colors, serifFont } from '../../config/theme';

const MOCK_LEADERBOARD = [
  { rank: 1, name: 'Solana Supercycle', creator: 'Shogun_0x', roi: '+245%', tvl: '$1.2M', risk: 'HIGH', strategy: 'Sniper' },
  { rank: 2, name: 'Stable Yields', creator: 'DeFi_Dad', roi: '+18%', tvl: '$4.5M', risk: 'LOW', strategy: 'Fortress' },
  { rank: 3, name: 'Jup Aggregator', creator: 'Meow', roi: '+45%', tvl: '$890K', risk: 'MED', strategy: 'Wave' },
  { rank: 4, name: 'Meme Index 10', creator: 'Ansem', roi: '+120%', tvl: '$300K', risk: 'HIGH', strategy: 'Sniper' },
  { rank: 5, name: 'Delta Neutral', creator: '0xDrift', roi: '+12%', tvl: '$2.1M', risk: 'LOW', strategy: 'Fortress' },
  { rank: 6, name: 'Yield Matrix', creator: 'alpha_0x', roi: '+67%', tvl: '$560K', risk: 'MED', strategy: 'Wave' },
  { rank: 7, name: 'DeFi Blue Chip', creator: 'whaleWatcher', roi: '+33%', tvl: '$3.8M', risk: 'LOW', strategy: 'Fortress' },
  { rank: 8, name: 'Degen Portfolio', creator: 'yolo_moon', roi: '+189%', tvl: '$120K', risk: 'HIGH', strategy: 'Sniper' },
  { rank: 9, name: 'Prediction Oracle', creator: 'markets_ai', roi: '+55%', tvl: '$740K', risk: 'MED', strategy: 'Wave' },
  { rank: 10, name: 'Solana Ecosystem', creator: 'sol_maxi', roi: '+28%', tvl: '$2.2M', risk: 'LOW', strategy: 'Fortress' },
];

const getRankStyle = (rank: number) => {
  if (rank === 1) return { bg: 'rgba(234,179,8,0.2)', text: '#EAB308', border: 'rgba(234,179,8,0.3)' };
  if (rank === 2) return { bg: 'rgba(156,163,175,0.2)', text: '#9CA3AF', border: 'rgba(156,163,175,0.3)' };
  if (rank === 3) return { bg: 'rgba(180,83,9,0.2)', text: '#B45309', border: 'rgba(180,83,9,0.3)' };
  return { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.3)', border: 'rgba(255,255,255,0)' };
};

const getStrategyColor = (strategy: string) => {
  if (strategy === 'Sniper') return '#F87171';
  if (strategy === 'Fortress') return '#60A5FA';
  return '#C084FC';
};

export function LeaderboardScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#050505', paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', fontFamily: serifFont, marginBottom: 4 }}>
          Vault Rankings
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 3 }}>
          Top Performing Strategies
        </Text>
      </View>

      <FlatList
        data={MOCK_LEADERBOARD}
        keyExtractor={(item) => String(item.rank)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: vault, index }) => {
          const rankStyle = getRankStyle(vault.rank);
          const stratColor = getStrategyColor(vault.strategy);

          return (
            <Pressable
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#1a1a1a' : '#111',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.05)',
                borderRadius: 16,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                {/* Rank Badge */}
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: rankStyle.bg,
                    borderWidth: 1,
                    borderColor: rankStyle.border,
                  }}
                >
                  <Text style={{ fontWeight: 'bold', fontSize: 14, color: rankStyle.text }}>
                    {vault.rank}
                  </Text>
                </View>

                {/* Info */}
                <View>
                  <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#fff', marginBottom: 4 }}>
                    {vault.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Users size={10} color="rgba(255,255,255,0.4)" />
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{vault.creator}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>•</Text>
                    <Text style={{ fontSize: 10, color: stratColor }}>{vault.strategy}</Text>
                  </View>
                </View>
              </View>

              {/* Stats */}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#34D399', fontSize: 16 }}>
                  {vault.roi}
                </Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                  TVL {vault.tvl}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
