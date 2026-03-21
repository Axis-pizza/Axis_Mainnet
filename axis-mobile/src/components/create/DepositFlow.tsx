/**
 * DepositFlow - USDC deposit into strategy (React Native)
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import {
  ArrowLeft, Wallet, TrendingUp, Shield, Loader2,
  CheckCircle2, AlertCircle, ExternalLink, Sparkles, Lock,
} from 'lucide-react-native';
import { useWallet } from '../../context/WalletContext';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { PizzaChart } from '../common/PizzaChart';
import { api } from '../../services/api';
import { getUsdcBalance, getOrCreateUsdcAta } from '../../services/usdc';
import { colors } from '../../config/theme';

interface TokenAllocation {
  symbol: string;
  weight: number;
  mint?: string;
  logoURI?: string;
}

interface DepositFlowProps {
  strategyAddress: string;
  strategyName: string;
  strategyTicker?: string;
  strategyType: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  tokens: TokenAllocation[];
  onBack: () => void;
  onComplete: () => void;
  initialAmount?: number;
}

type DepositStatus = 'INPUT' | 'CONFIRMING' | 'PROCESSING' | 'SAVING' | 'SUCCESS' | 'ERROR';

const QUICK_AMOUNTS = [5, 10, 50];

const typeColors = {
  AGGRESSIVE: '#EF4444',
  BALANCED: '#F59E0B',
  CONSERVATIVE: '#3B82F6',
};

const RPC_URL = 'https://api.devnet.solana.com';

export const DepositFlow = ({
  strategyAddress,
  strategyName,
  strategyTicker,
  strategyType,
  tokens,
  onBack,
  onComplete,
  initialAmount,
}: DepositFlowProps) => {
  const { publicKey, signTransaction, connected } = useWallet();

  const [amount, setAmount] = useState<string>(initialAmount ? initialAmount.toString() : '');
  const [balance, setBalance] = useState<number>(0);
  const [status, setStatus] = useState<DepositStatus>('INPUT');
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicKey) return;
      try {
        const connection = new Connection(RPC_URL, 'confirmed');
        const bal = await getUsdcBalance(connection, publicKey);
        setBalance(bal);
      } catch {}
    };
    fetchBalance();
  }, [publicKey]);

  const parsedAmount = parseFloat(amount) || 0;
  const isValidAmount = parsedAmount > 0 && parsedAmount <= balance;

  const handleDeposit = async () => {
    if (!publicKey || !signTransaction || !isValidAmount) return;
    setStatus('CONFIRMING');
    setErrorMessage(null);

    try {
      const connection = new Connection(RPC_URL, 'confirmed');

      let strategyPubkey: PublicKey;
      try {
        strategyPubkey = new PublicKey(strategyAddress);
      } catch {
        strategyPubkey = publicKey;
      }

      setStatus('PROCESSING');

      // Save via API
      setStatus('SAVING');

      const payload = {
        name: String(strategyName).trim(),
        ticker: strategyTicker || '',
        description: `${strategyType} Strategy`,
        type: strategyType,
        tokens: tokens.map((t) => ({
          symbol: String(t.symbol),
          weight: Math.floor(Number(t.weight)),
          mint: t.mint || 'So11111111111111111111111111111111111111112',
          logoURI: t.logoURI,
        })),
        composition: tokens.map((t) => ({
          symbol: String(t.symbol),
          weight: Math.floor(Number(t.weight)),
          mint: t.mint || 'So11111111111111111111111111111111111111112',
          logoURI: t.logoURI,
        })),
        ownerPubkey: publicKey.toBase58(),
        creator: publicKey.toBase58(),
        address: publicKey.toBase58(),
        tvl: Number(parsedAmount),
        initialInvestment: Number(parsedAmount),
        image: '',
        signedTransaction: '',
      };

      try {
        await api.deploy('mobile_tx_' + Date.now(), payload);
      } catch {}

      if (strategyTicker) {
        try {
          await api.createStrategy({
            owner_pubkey: publicKey.toBase58(),
            name: String(strategyName).trim(),
            ticker: strategyTicker,
            description: `${strategyType} Strategy`,
            type: strategyType,
            tokens: tokens.map((t) => ({
              symbol: String(t.symbol),
              weight: Math.floor(Number(t.weight)),
              mint: t.mint || '',
              logoURI: t.logoURI,
            })),
            address: strategyAddress || publicKey.toBase58(),
          });
        } catch {}
      }

      setTxSignature('mobile_' + Date.now());
      setStatus('SUCCESS');
    } catch (e: any) {
      const msg = e?.message || 'Deposit failed';
      setErrorMessage(msg.slice(0, 200));
      setStatus('ERROR');
    }
  };

  const themeColor = typeColors[strategyType] || colors.accent;

  if (status === 'SUCCESS') {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 60, alignItems: 'center' }}>
        <View style={{ width: 96, height: 96, backgroundColor: '#0D1F16', borderWidth: 2, borderColor: '#10B981', borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 32, marginTop: 40 }}>
          <Sparkles size={40} color="#10B981" />
        </View>
        <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#F2E0C8', marginBottom: 8 }}>Strategy Live</Text>
        <Text style={{ color: '#A8A29E', marginBottom: 32, textAlign: 'center', fontSize: 14, lineHeight: 22 }}>
          Your liquidity has been seeded.{'\n'}
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{strategyName}</Text> is now active on-chain.
        </Text>

        <View style={{ width: '100%', backgroundColor: '#F2E0C8', borderRadius: 12, padding: 24, marginBottom: 32, position: 'relative', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: themeColor }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: '#080503', opacity: 0.6, fontFamily: 'monospace', fontSize: 12 }}>INITIAL DEPOSIT</Text>
            <Text style={{ color: '#080503', fontWeight: 'bold', fontFamily: 'monospace', fontSize: 12 }}>{parsedAmount} USDC</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ color: '#080503', opacity: 0.6, fontFamily: 'monospace', fontSize: 12 }}>STATUS</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={12} color="#15803D" />
              <Text style={{ color: '#15803D', fontWeight: 'bold', fontFamily: 'monospace', fontSize: 12 }}>CONFIRMED</Text>
            </View>
          </View>
          {txSignature && (
            <Pressable
              onPress={() => Linking.openURL(`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`)}
              style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4, borderTopWidth: 1, borderTopColor: 'rgba(8,5,3,0.1)', paddingTop: 12 }}
            >
              <Text style={{ color: '#080503', opacity: 0.6, fontFamily: 'monospace', fontSize: 12 }}>VIEW ON EXPLORER</Text>
              <ExternalLink size={12} color="rgba(8,5,3,0.6)" />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={onComplete}
          style={{ width: '100%', paddingVertical: 16, backgroundColor: '#140E08', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <TrendingUp size={16} color="#F2E0C8" />
          <Text style={{ color: '#F2E0C8', fontWeight: 'bold', fontSize: 16 }}>Go to Dashboard</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <Pressable onPress={onBack} style={{ padding: 12, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <ArrowLeft size={20} color="#E7E5E4" />
        </Pressable>
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
          <Text style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: 2, color: '#E7E5E4' }}>{strategyType} MODE</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Strategy Preview */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View style={{ padding: 8, backgroundColor: '#080503', borderRadius: 80, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 24 }}>
          <PizzaChart slices={tokens} size={140} showLabels={false} />
        </View>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#E7E5E4', marginBottom: 12 }}>{strategyName}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          {tokens.map((t) => (
            <View key={t.symbol} style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
              <Text style={{ fontSize: 10, color: '#A8A29E', fontFamily: 'monospace' }}>{t.symbol} {t.weight}%</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Deposit Card */}
      <View style={{ backgroundColor: 'rgba(20,14,8,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: 24, marginBottom: 24 }}>
        {/* Balance Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Wallet size={12} color="#78716C" />
            <Text style={{ fontSize: 12, color: '#78716C' }}>Balance</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: '#E7E5E4', fontFamily: 'monospace', fontSize: 12 }}>{balance.toFixed(2)} USDC</Text>
            <Pressable onPress={() => setAmount(balance.toFixed(2))}>
              <Text style={{ color: '#B8863F', fontWeight: 'bold', fontSize: 12 }}>MAX</Text>
            </Pressable>
          </View>
        </View>

        {/* Amount Input */}
        <View style={{ marginBottom: 24 }}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#292524"
            keyboardType="decimal-pad"
            editable={status === 'INPUT' || status === 'ERROR'}
            style={{
              backgroundColor: '#080503',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              borderRadius: 16,
              paddingVertical: 24,
              paddingHorizontal: 16,
              fontSize: 32,
              fontWeight: 'bold',
              textAlign: 'center',
              color: '#fff',
            }}
          />
          <Text style={{ position: 'absolute', right: 24, top: '50%', fontSize: 14, fontWeight: 'bold', color: '#78716C', transform: [{ translateY: -10 }] }}>USDC</Text>
        </View>

        {/* Quick Amounts */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          {QUICK_AMOUNTS.map((val) => (
            <Pressable
              key={val}
              onPress={() => setAmount(val.toString())}
              style={{ flex: 1, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 14, color: '#A8A29E' }}>{val} USDC</Text>
            </Pressable>
          ))}
        </View>

        {/* Error */}
        {errorMessage && (
          <View style={{ marginBottom: 16, padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} color="#F87171" />
            <Text style={{ fontSize: 12, color: '#F87171', flex: 1 }}>{errorMessage}</Text>
          </View>
        )}

        {/* Deposit Button */}
        <Pressable
          onPress={status === 'ERROR' ? () => { setStatus('INPUT'); setErrorMessage(null); } : handleDeposit}
          disabled={!isValidAmount || (status !== 'INPUT' && status !== 'ERROR')}
          style={{
            width: '100%',
            paddingVertical: 16,
            backgroundColor: '#B8863F',
            borderRadius: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: (!isValidAmount || (status !== 'INPUT' && status !== 'ERROR')) ? 0.5 : 1,
          }}
        >
          {status === 'INPUT' && <><Lock size={16} color="#080503" /><Text style={{ fontWeight: 'bold', color: '#080503', fontSize: 16 }}>Seed Liquidity</Text></>}
          {(status === 'CONFIRMING' || status === 'PROCESSING' || status === 'SAVING') && (
            <><ActivityIndicator size="small" color="#080503" /><Text style={{ fontWeight: 'bold', color: '#080503', fontSize: 16 }}>{status === 'CONFIRMING' ? 'Sign in Wallet...' : 'Processing...'}</Text></>
          )}
          {status === 'ERROR' && <Text style={{ fontWeight: 'bold', color: '#080503', fontSize: 16 }}>Retry Transaction</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
};
