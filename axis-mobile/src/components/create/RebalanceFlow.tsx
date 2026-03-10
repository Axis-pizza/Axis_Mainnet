/**
 * RebalanceFlow - Adjust strategy weights and execute rebalance (React Native)
 */

import React, { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import {
  RefreshCw, ArrowLeft, TrendingUp, AlertCircle, CheckCircle2,
  Sliders, Minus, Plus, Info, Zap,
} from 'lucide-react-native';
import { useWallet } from '../../context/WalletContext';
import { PizzaChart } from '../common/PizzaChart';

interface TokenAllocation {
  symbol: string;
  weight: number;
}

interface RebalanceFlowProps {
  strategyAddress?: string;
  strategyName: string;
  strategyType: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  currentTokens: TokenAllocation[];
  onBack: () => void;
  onComplete: () => void;
}

type RebalanceStatus = 'ADJUST' | 'PREVIEW' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

const typeColors = {
  AGGRESSIVE: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
  BALANCED: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' },
  CONSERVATIVE: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
};

export const RebalanceFlow = ({
  strategyName,
  strategyType,
  currentTokens,
  onBack,
  onComplete,
}: RebalanceFlowProps) => {
  const { publicKey } = useWallet();

  const [tokens, setTokens] = useState<TokenAllocation[]>(currentTokens);
  const [status, setStatus] = useState<RebalanceStatus>('ADJUST');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slippage, setSlippage] = useState<number>(1);

  const totalWeight = tokens.reduce((sum, t) => sum + t.weight, 0);
  const isValidDistribution = Math.abs(totalWeight - 100) < 0.01;
  const hasChanges = tokens.some((t, i) => t.weight !== currentTokens[i]?.weight);

  const adjustWeight = (index: number, delta: number) => {
    setTokens((prev) => {
      const newTokens = [...prev];
      const newWeight = Math.max(0, Math.min(100, newTokens[index].weight + delta));
      newTokens[index] = { ...newTokens[index], weight: newWeight };
      return newTokens;
    });
  };

  const handleRebalance = async () => {
    if (!publicKey) return;
    setStatus('PROCESSING');
    setErrorMessage(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setStatus('SUCCESS');
    } catch (e: any) {
      setErrorMessage(e?.message || 'Rebalance failed');
      setStatus('ERROR');
    }
  };

  const handlePreview = () => {
    if (isValidDistribution && hasChanges) {
      setStatus('PREVIEW');
    }
  };

  const typeStyle = typeColors[strategyType];

  if (status === 'SUCCESS') {
    return (
      <ScrollView contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: 96, height: 96, backgroundColor: '#3B82F6', borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
          <CheckCircle2 size={48} color="#fff" />
        </View>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>Rebalanced! ⚡</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 32 }}>{strategyName} has been updated</Text>

        <PizzaChart slices={tokens} size={140} showLabels={true} />

        <View style={{ width: '100%', padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 32, marginTop: 32 }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginBottom: 12 }}>New Allocation</Text>
          {tokens.map((token) => (
            <View key={token.symbol} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#fff', fontFamily: 'monospace' }}>{token.symbol}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)' }}>{token.weight}%</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={onComplete}
          style={{ width: '100%', paddingVertical: 16, backgroundColor: '#F97316', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <TrendingUp size={16} color="#000" />
          <Text style={{ fontWeight: 'bold', color: '#000', fontSize: 16 }}>Back to Dashboard</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Pressable onPress={onBack} style={{ padding: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <ArrowLeft size={20} color="#fff" />
        </Pressable>
        <View>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>Rebalance Strategy</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{strategyName}</Text>
        </View>
      </View>

      {/* Current vs New Comparison */}
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Current</Text>
          <PizzaChart slices={currentTokens} size={100} showLabels={false} />
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>New</Text>
          <PizzaChart slices={tokens} size={100} showLabels={false} />
        </View>
      </View>

      {/* Weight Adjusters */}
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: typeStyle.bg, borderWidth: 1, borderColor: typeStyle.border, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sliders size={16} color="#fff" />
            <Text style={{ fontWeight: 'bold', color: '#fff' }}>Adjust Weights</Text>
          </View>
          <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isValidDistribution ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }}>
            <Text style={{ fontSize: 12, color: isValidDistribution ? '#34D399' : '#F87171' }}>
              Total: {totalWeight.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          {tokens.map((token, index) => (
            <View key={token.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ width: 48, fontFamily: 'monospace', fontSize: 14, color: '#fff' }}>{token.symbol}</Text>

              <Pressable
                onPress={() => adjustWeight(index, -5)}
                style={{ padding: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}
              >
                <Minus size={16} color="#fff" />
              </Pressable>

              <View style={{ flex: 1 }}>
                <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${token.weight}%` as any, height: '100%', backgroundColor: '#F97316', borderRadius: 4 }} />
                </View>
              </View>

              <Pressable
                onPress={() => adjustWeight(index, 5)}
                style={{ padding: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}
              >
                <Plus size={16} color="#fff" />
              </Pressable>

              <Text style={{ width: 44, textAlign: 'right', fontSize: 14, color: '#fff' }}>{token.weight}%</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Slippage Setting */}
      <View style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Info size={16} color="rgba(255,255,255,0.7)" />
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Slippage Tolerance</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[0.5, 1, 2, 3].map((s) => (
              <Pressable
                key={s}
                onPress={() => setSlippage(s)}
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: slippage === s ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.1)' }}
              >
                <Text style={{ fontSize: 12, color: slippage === s ? '#FB923C' : 'rgba(255,255,255,0.5)' }}>{s}%</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Validation Warning */}
      {!isValidDistribution && (
        <View style={{ padding: 12, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <AlertCircle size={20} color="#FBBF24" />
          <Text style={{ fontSize: 14, color: '#FBBF24', flex: 1 }}>
            Weights must sum to exactly 100%. Current: {totalWeight.toFixed(1)}%
          </Text>
        </View>
      )}

      {/* Error */}
      {errorMessage && (
        <View style={{ padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <AlertCircle size={20} color="#F87171" />
          <Text style={{ fontSize: 14, color: '#F87171', flex: 1 }}>{errorMessage}</Text>
        </View>
      )}

      {/* Buttons */}
      {status === 'ADJUST' && (
        <Pressable
          onPress={handlePreview}
          disabled={!isValidDistribution || !hasChanges}
          style={{ width: '100%', paddingVertical: 16, backgroundColor: '#6366F1', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (!isValidDistribution || !hasChanges) ? 0.5 : 1 }}
        >
          <RefreshCw size={20} color="#fff" />
          <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 16 }}>Preview Rebalance</Text>
        </Pressable>
      )}

      {status === 'PREVIEW' && (
        <View style={{ gap: 12 }}>
          <View style={{ padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>Rebalance Preview</Text>
            <View style={{ gap: 8 }}>
              {tokens.map((token, i) => {
                const diff = token.weight - (currentTokens[i]?.weight || 0);
                if (Math.abs(diff) < 0.1) return null;
                return (
                  <View key={token.symbol} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#fff', fontSize: 14 }}>{token.symbol}</Text>
                    <Text style={{ color: diff > 0 ? '#34D399' : '#F87171', fontSize: 14 }}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={handleRebalance}
            style={{ width: '100%', paddingVertical: 16, backgroundColor: '#10B981', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Zap size={20} color="#000" />
            <Text style={{ fontWeight: 'bold', color: '#000', fontSize: 16 }}>Execute Rebalance</Text>
          </Pressable>

          <Pressable
            onPress={() => setStatus('ADJUST')}
            style={{ width: '100%', paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '500', fontSize: 14 }}>Back to Adjust</Text>
          </Pressable>
        </View>
      )}

      {status === 'PROCESSING' && (
        <View style={{ width: '100%', paddingVertical: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 16 }}>Executing Rebalance...</Text>
        </View>
      )}
    </ScrollView>
  );
};

export default RebalanceFlow;
