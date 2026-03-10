/**
 * RedeemModal - Redeem strategy shares (React Native)
 */

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { X, ArrowDown, AlertCircle } from 'lucide-react-native';
import { useWallet } from '../../context/WalletContext';
import { Connection, PublicKey } from '@solana/web3.js';
import { withdraw } from '../../services/kagemusha';

interface RedeemModalProps {
  isOpen: boolean;
  onClose: () => void;
  strategyAddress: string;
  strategyName: string;
  maxShares?: number;
  onSuccess: () => void;
}

const RPC_URL = 'https://api.devnet.solana.com';

export const RedeemModal = ({
  isOpen,
  onClose,
  strategyAddress,
  strategyName,
  maxShares = 100,
  onSuccess,
}: RedeemModalProps) => {
  const { publicKey, signTransaction } = useWallet();
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRedeem = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const wallet = { publicKey, signTransaction };

      await withdraw(
        connection,
        wallet,
        new PublicKey(strategyAddress),
        Number(amount)
      );

      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to redeem shares');
    } finally {
      setIsLoading(false);
    }
  };

  const setPercentage = (pct: number) => {
    setAmount((maxShares * pct).toFixed(4));
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: '#121212',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
            padding: 24,
            paddingBottom: 40,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>Redeem Shares</Text>
            <Pressable onPress={onClose} style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16 }}>
              <X size={16} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          {/* Strategy Info */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Strategy</Text>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>{strategyName}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Available Shares</Text>
              <Text style={{ fontSize: 14, fontFamily: 'monospace', color: '#34D399' }}>{maxShares.toFixed(4)}</Text>
            </View>
          </View>

          {/* Amount Input */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Amount to Redeem</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="decimal-pad"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  paddingVertical: 12,
                  paddingLeft: 16,
                  paddingRight: 80,
                  fontFamily: 'monospace',
                  fontSize: 18,
                  color: '#fff',
                }}
              />
              <Text style={{ position: 'absolute', right: 16, top: '50%', fontSize: 12, color: 'rgba(255,255,255,0.3)', transform: [{ translateY: -9 }] }}>SHARES</Text>
            </View>
          </View>

          {/* Percentage Buttons */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <Pressable
                key={pct}
                onPress={() => setPercentage(pct)}
                style={{ flex: 1, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.7)' }}>{pct * 100}%</Text>
              </Pressable>
            ))}
          </View>

          {/* Error */}
          {error && (
            <View style={{ marginBottom: 16, padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} color="#F87171" />
              <Text style={{ fontSize: 12, color: '#F87171', flex: 1 }}>{error}</Text>
            </View>
          )}

          {/* Redeem Button */}
          <Pressable
            onPress={handleRedeem}
            disabled={isLoading || !amount || Number(amount) <= 0}
            style={{
              width: '100%',
              paddingVertical: 16,
              borderRadius: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: '#EF4444',
              opacity: (isLoading || !amount || Number(amount) <= 0) ? 0.5 : 1,
            }}
          >
            {isLoading ? (
              <><ActivityIndicator size="small" color="#fff" /><Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>Redeeming...</Text></>
            ) : (
              <><ArrowDown size={20} color="#fff" /><Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>Confirm Redemption</Text></>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
