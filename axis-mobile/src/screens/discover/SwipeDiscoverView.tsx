/**
 * SwipeDiscoverView — faithful React Native port of axis-agent SwipeDiscoverView.tsx
 * Features:
 *  - Poker-deal skeleton loader (3 cards animate in from right)
 *  - Stack of 3 swipeable cards
 *  - Like / Pass / Detail bottom action buttons
 *  - SuccessOverlay "READY FOR TAKEOFF" with strategy preview
 *  - InvestSheet: full-screen Phantom-style numpad + slide-to-confirm
 *  - Refresh button in header
 */
import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, Image, Dimensions,
  ActivityIndicator, Animated as RNAnimated, StyleSheet, Platform,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolate, runOnJS, Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RefreshCw, X, Wallet, ArrowLeft, ChevronRight, Check,
  TrendingUp, TrendingDown, ShoppingCart, Rocket,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { api } from '../../services/api';
import { JupiterService } from '../../services/jupiter';
import { DexScreenerService } from '../../services/dexscreener';
import { SwipeCard } from './SwipeCard';
import { useToast } from '../../components/common/context/ToastContext';
import { useWallet } from '../../context/WalletContext';
import { colors, gold, serifFont } from '../../config/theme';

const { width: W, height: H } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────
type TxStatus = 'IDLE' | 'SIGNING' | 'CONFIRMING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

interface TokenData {
  symbol: string;
  price: number;
  change24h: number;
  logoURI?: string;
  address: string;
}

interface Props {
  onStrategySelect: (strategy: any) => void;
  onToggleView?: () => void;
}

// ─── SkeletonCard (poker-deal animation) ─────────────────────────────────────
const SkeletonCard = memo(({ index }: { index: number }) => {
  const tx = useSharedValue(W);
  const rot = useSharedValue(22);
  const dealDelay = (2 - index) * 180; // back cards deal first

  const finalScale = 1 - index * 0.05;
  const finalY = index * 10;
  const finalRot = index === 1 ? -2 : index === 2 ? 3 : 0;

  useEffect(() => {
    const t = setTimeout(() => {
      tx.value = withSpring(0, { damping: 22, stiffness: 160 });
      rot.value = withTiming(finalRot, { duration: 450 });
    }, dealDelay);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: finalY },
      { rotate: `${rot.value}deg` },
      { scale: finalScale },
    ],
    opacity: Math.max(0, 1 - index * 0.3),
  }));

  const pulseLine = (w: string, h: number, mt = 0) => (
    <View style={{ width: w as any, height: h, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: mt }} />
  );

  return (
    <Animated.View
      style={[style, StyleSheet.absoluteFillObject, {
        borderRadius: 32,
        backgroundColor: '#121212',
        borderWidth: 1,
        borderColor: 'rgba(184,134,63,0.15)',
        overflow: 'hidden',
        padding: 20,
        zIndex: 100 - index,
      }]}
      pointerEvents="none"
    >
      {/* shimmer pulse */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          {pulseLine('30%', 20)}
          {pulseLine('55%', 32, 8)}
        </View>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' }} />
      </View>
      {pulseLine('80%', 12)}
      {pulseLine('60%', 12, 6)}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        <View style={{ flex: 1, height: 90, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)' }} />
        <View style={{ flex: 1, height: 90, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)' }} />
      </View>
      <View style={{ marginTop: 16, gap: 8 }}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={{ height: 52, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(184,134,63,0.06)' }} />
        ))}
      </View>
    </Animated.View>
  );
});

// ─── SwipeToConfirm slider ─────────────────────────────────────────────────
interface SliderProps {
  onConfirm: () => void;
  isLoading: boolean;
  isSuccess: boolean;
  label: string;
}
const SwipeToConfirm = memo(({ onConfirm, isLoading, isSuccess, label }: SliderProps) => {
  const TRACK_W = W - 48;
  const HANDLE = 56;
  const PAD = 4;
  const MAX = TRACK_W - HANDLE - PAD * 2;

  const x = useSharedValue(0);
  const confirmed = useRef(false);

  useEffect(() => {
    if (isSuccess) x.value = withSpring(MAX);
    else if (!isLoading) x.value = withSpring(0);
  }, [isSuccess, isLoading]);

  const gesture = Gesture.Pan()
    .enabled(!isLoading && !isSuccess)
    .onUpdate(e => {
      x.value = Math.max(0, Math.min(e.translationX, MAX));
    })
    .onEnd(() => {
      if (x.value > MAX * 0.6) {
        x.value = withSpring(MAX);
        if (!confirmed.current && !isLoading && !isSuccess) {
          confirmed.current = true;
          runOnJS(onConfirm)();
        }
      } else {
        x.value = withSpring(0);
        confirmed.current = false;
      }
    });

  const progressStyle = useAnimatedStyle(() => ({
    width: HANDLE + PAD * 2 + x.value,
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, MAX * 0.5], [1, 0]),
  }));
  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View style={{ height: 64, borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: isSuccess ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)', backgroundColor: isSuccess ? 'rgba(16,185,129,0.2)' : '#1C1C1E' }}>
      {/* progress fill */}
      <Animated.View style={[progressStyle, { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 32, backgroundColor: isSuccess ? '#10B981' : undefined, overflow: 'hidden' }]}>
        {!isSuccess && (
          <LinearGradient colors={[gold[700], gold[400]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        )}
      </Animated.View>

      {/* label */}
      <Animated.View style={[textStyle, { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 2 }}>
          {isLoading ? 'PROCESSING...' : label}
        </Text>
      </Animated.View>

      {isSuccess && (
        <View style={{ position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 2 }}>SUCCESS</Text>
        </View>
      )}

      {/* handle */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[handleStyle, { position: 'absolute', top: PAD, left: PAD, width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6 }]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={gold[400]} />
          ) : isSuccess ? (
            <Check size={24} color="#10B981" />
          ) : (
            <ChevronRight size={24} color={gold[400]} />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

// ─── InvestSheet ──────────────────────────────────────────────────────────────
interface InvestSheetProps {
  isOpen: boolean;
  onClose: () => void;
  strategy: any;
  status: TxStatus;
  onConfirm: (amount: string, mode: 'BUY' | 'SELL') => Promise<void>;
}
const InvestSheet = memo(({ isOpen, onClose, strategy, status, onConfirm }: InvestSheetProps) => {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('0');
  const ticker = strategy?.ticker || 'ETF';

  useEffect(() => { if (isOpen) { setAmount('0'); setMode('BUY'); } }, [isOpen]);

  const handleNum = (num: string) => {
    if (status !== 'IDLE' && status !== 'ERROR') return;
    if (amount === '0' && num !== '.') setAmount(num);
    else if (amount.includes('.') && num === '.') return;
    else if (amount.length < 9) setAmount(p => p + num);
  };
  const handleBack = () => {
    if (status !== 'IDLE' && status !== 'ERROR') return;
    setAmount(p => p.length > 1 ? p.slice(0, -1) : '0');
  };
  const handleExecute = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { showToast('Enter valid amount', 'error'); return; }
    onConfirm(amount, mode);
  };

  const isProcessing = status === 'SIGNING' || status === 'CONFIRMING' || status === 'PROCESSING';
  const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, '⌫'];

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: 16 }}>
          <Pressable onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center' }}>
            <X size={20} color="#fff" />
          </Pressable>

          {/* Buy/Sell Toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: '#1C1C1E', padding: 4, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
            {(['BUY', 'SELL'] as const).map(m => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{ paddingHorizontal: 20, paddingVertical: 6, borderRadius: 16, backgroundColor: mode === m ? gold[400] : 'transparent' }}
              >
                <Text style={{ color: mode === m ? '#000' : '#78716C', fontSize: 12, fontWeight: '700' }}>{m}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Amount Display */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 64, fontWeight: '500', color: amount === '0' ? '#57534E' : '#fff', letterSpacing: -2 }}>
            {amount}
          </Text>
          <Text style={{ color: '#78716C', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
            {mode === 'BUY' ? 'USDC' : ticker}
          </Text>

          {amount !== '0' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 6 }}>
              <ArrowLeft size={14} color="#78716C" style={{ transform: [{ rotate: '270deg' }] }} />
              <Text style={{ color: '#78716C', fontSize: 13 }}>
                Receive approx. {parseFloat(amount).toFixed(4)} {mode === 'BUY' ? ticker : 'USDC'}
              </Text>
            </View>
          )}
        </View>

        {/* Numpad & Action */}
        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24, backgroundColor: '#0C0C0C' }}>
          {(status === 'IDLE' || status === 'ERROR') && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 32, maxWidth: 320, alignSelf: 'center', gap: 0 }}>
              {KEYS.map((key, i) => (
                <Pressable
                  key={i}
                  onPress={() => key === '⌫' ? handleBack() : handleNum(key.toString())}
                  style={({ pressed }) => ({ width: '33.33%', height: 56, justifyContent: 'center', alignItems: 'center', borderRadius: 28, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}
                >
                  <Text style={{ fontSize: key === '⌫' ? 18 : 24, color: '#fff', fontWeight: '400' }}>{key}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {isProcessing ? (
            <View style={{ height: 64, borderRadius: 32, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="small" color={gold[400]} />
              <Text style={{ color: '#fff', fontWeight: '700', letterSpacing: 2, fontSize: 13 }}>PROCESSING...</Text>
            </View>
          ) : (
            <SwipeToConfirm
              onConfirm={handleExecute}
              isLoading={false}
              isSuccess={status === 'SUCCESS'}
              label={`SLIDE TO ${mode}`}
            />
          )}
        </View>
      </View>
    </Modal>
  );
});

// ─── SuccessOverlay ────────────────────────────────────────────────────────────
interface SuccessProps {
  strategy: any;
  onClose: () => void;
  onGoToStrategy: () => void;
  onBuy: () => void;
}
const SuccessOverlay = memo(({ strategy, onClose, onGoToStrategy, onBuy }: SuccessProps) => {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 100 });
    opacity.value = withTiming(1, { duration: 200 });
  }, []);

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.97)', zIndex: 200, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
      {/* Title */}
      <Animated.View style={[innerStyle, { marginBottom: 32, alignItems: 'center' }]}>
        <Text style={{ fontSize: 56, fontWeight: '900', fontStyle: 'italic', letterSpacing: -2, textAlign: 'center', lineHeight: 56, color: gold[400] }}>
          {'READY FOR\nTAKEOFF'}
        </Text>
      </Animated.View>

      {/* Strategy card preview */}
      <Animated.View style={[innerStyle, { width: '100%', maxWidth: 320, backgroundColor: '#140E08', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(184,134,63,0.25)', padding: 20, marginBottom: 24, overflow: 'hidden' }]}>
        {/* top gradient bar */}
        <LinearGradient colors={['#ea580c', '#eab308', '#06b6d4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, paddingTop: 8 }}>
          <View style={{ position: 'relative' }}>
            <Image
              source={{ uri: strategy.creatorPfpUrl || `https://api.dicebear.com/7.x/identicon/png?seed=${strategy.creatorAddress}` }}
              style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(184,134,63,0.3)' }}
            />
            <View style={{ position: 'absolute', bottom: -4, right: -4, backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>ROI {(strategy.roi || 0).toFixed(0)}%</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }} numberOfLines={1}>{strategy.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 }}>
              By {strategy.creatorAddress?.slice(0, 4)}...{strategy.creatorAddress?.slice(-4)}
            </Text>
          </View>
        </View>
        {/* Token icons */}
        <View style={{ flexDirection: 'row', marginLeft: 4 }}>
          {(strategy.tokens || []).slice(0, 6).map((t: any, i: number) => (
            <View key={i} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(184,134,63,0.15)', marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
              {t.logoURI ? (
                <Image source={{ uri: t.logoURI }} style={{ width: 32, height: 32, borderRadius: 16 }} />
              ) : (
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{t.symbol?.[0]}</Text>
              )}
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Buttons */}
      <Animated.View style={[innerStyle, { width: '100%', maxWidth: 320, gap: 10 }]}>
        <Pressable onPress={onBuy} style={{ borderRadius: 16, overflow: 'hidden' }}>
          <LinearGradient colors={['#059669', '#06b6d4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <ShoppingCart size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>Buy Now</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={onGoToStrategy} style={{ borderRadius: 16, overflow: 'hidden' }}>
          <LinearGradient colors={['#ea580c', '#ca8a04']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Rocket size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>LFG (View Detail)</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={onClose} style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(184,134,63,0.15)' }}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '700' }}>Keep Scouting</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
export function SwipeDiscoverView({ onStrategySelect, onToggleView }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { publicKey } = useWallet();

  const [strategies, setStrategies] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tokenDataMap, setTokenDataMap] = useState<Record<string, TokenData>>({});

  const [matchedStrategy, setMatchedStrategy] = useState<any | null>(null);
  const [isInvestOpen, setIsInvestOpen] = useState(false);
  const [investStatus, setInvestStatus] = useState<TxStatus>('IDLE');
  const [investTarget, setInvestTarget] = useState<any | null>(null);

  const dataFetched = useRef(false);
  const lastSwipeTime = useRef(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    dataFetched.current = false;
    try {
      const [publicRes, tokensRes] = await Promise.all([
        api.discoverStrategies(100).catch(() => ({ strategies: [] })),
        api.getTokens().catch(() => ({ tokens: [] })),
      ]);

      const tokenMap: Record<string, TokenData> = {};
      (tokensRes.tokens || []).forEach((t: any) => {
        if (t.mint) tokenMap[t.mint] = { symbol: t.symbol?.toUpperCase() || '???', price: t.price || 0, change24h: t.change24h || 0, logoURI: t.logoURI, address: t.mint };
      });

      const list = publicRes.strategies || publicRes || [];
      setStrategies(list);

      // Phase 2: live prices
      const mints = new Set<string>();
      list.forEach((s: any) => {
        let tokens = s.tokens || [];
        if (typeof tokens === 'string') { try { tokens = JSON.parse(tokens); } catch {} }
        tokens.forEach((t: any) => { if (t.mint) mints.add(t.mint); });
      });
      const mintArray = Array.from(mints).slice(0, 50);
      if (mintArray.length > 0) {
        const [prices, dex] = await Promise.all([
          JupiterService.getPrices(mintArray).catch(() => ({}) as any),
          DexScreenerService.getMarketData(mintArray).catch(() => ({}) as any),
        ]);
        mintArray.forEach(m => {
          tokenMap[m] = { ...(tokenMap[m] || { symbol: '???', address: m }), price: prices[m] || dex[m]?.price || 0, change24h: dex[m]?.change24h || 0 };
        });
      }
      setTokenDataMap(tokenMap);
    } catch (e) {
      console.error('SwipeDiscoverView load error:', e);
    } finally {
      setLoading(false);
      dataFetched.current = true;
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  const enriched = useMemo(() => strategies.map(s => {
    let tokens = s.tokens || [];
    if (typeof tokens === 'string') { try { tokens = JSON.parse(tokens); } catch {} }
    const enrichedTokens = tokens.map((t: any) => {
      const d = tokenDataMap[t.mint];
      return { ...t, address: t.mint, currentPrice: d?.price, change24h: d?.change24h, logoURI: t.logoURI || d?.logoURI };
    });
    const roi = enrichedTokens.reduce((sum: number, t: any) => sum + (t.change24h || 0) * ((t.weight || 0) / 100), 0);
    return {
      id: s.id || s.address,
      name: s.name, ticker: s.ticker,
      type: s.type || 'BALANCED',
      tokens: enrichedTokens, roi,
      tvl: s.tvl || 0,
      creatorAddress: s.ownerPubkey || s.owner_pubkey || '',
      creatorPfpUrl: s.creatorPfpUrl || null,
      description: s.description,
      createdAt: s.createdAt || Date.now() / 1000,
      mintAddress: s.mintAddress || s.address,
      vaultAddress: s.vaultAddress,
    };
  }), [strategies, tokenDataMap]);

  const handleSwipeLeft = useCallback(() => {
    const now = Date.now();
    if (now - lastSwipeTime.current < 300) return;
    lastSwipeTime.current = now;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentIndex(p => Math.min(p + 1, enriched.length));
  }, [enriched.length]);

  const handleSwipeRight = useCallback(() => {
    const now = Date.now();
    if (now - lastSwipeTime.current < 300) return;
    lastSwipeTime.current = now;
    const strategy = enriched[currentIndex];
    if (strategy) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMatchedStrategy(strategy);
    }
    setCurrentIndex(p => Math.min(p + 1, enriched.length));
  }, [currentIndex, enriched]);

  const handleTap = useCallback((strategy: any) => {
    onStrategySelect(strategy);
  }, [onStrategySelect]);

  const handleInvest = (strategy: any) => {
    setInvestTarget(strategy);
    setIsInvestOpen(true);
  };

  const handleTransaction = async (amount: string, mode: 'BUY' | 'SELL') => {
    if (!publicKey) { showToast('Connect wallet first', 'error'); return; }
    setInvestStatus('SIGNING');
    try {
      await new Promise(r => setTimeout(r, 1500)); // mock
      setInvestStatus('SUCCESS');
      showToast(`Success! ${mode} ${amount}`, 'success');
      setTimeout(() => { setIsInvestOpen(false); setInvestStatus('IDLE'); }, 2000);
    } catch {
      setInvestStatus('ERROR');
      showToast('Transaction failed', 'error');
      setTimeout(() => setInvestStatus('IDLE'), 2000);
    }
  };

  const isDone = currentIndex >= enriched.length && !loading;
  const visibleCards = enriched.slice(currentIndex, currentIndex + 3);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, paddingTop: insets.top + 8 }}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 16, position: 'relative' }}>
          {[2, 1, 0].map(i => <SkeletonCard key={i} index={i} />)}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, paddingBottom: insets.bottom + 24, paddingTop: 16 }}>
          {[0, 1, 2].map(i => <View key={i} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.05)' }} />)}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 8 }}>
        {onToggleView && (
          <Pressable onPress={onToggleView} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(184,134,63,0.2)', backgroundColor: 'rgba(184,134,63,0.05)' }}>
            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>LIST VIEW</Text>
          </Pressable>
        )}
        <Pressable onPress={loadData} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(184,134,63,0.1)', justifyContent: 'center', alignItems: 'center', marginLeft: 'auto' }}>
          <RefreshCw size={16} color={colors.accent} />
        </Pressable>
      </View>

      {/* Card stack */}
      <View style={{ flex: 1, marginHorizontal: 16, position: 'relative' }}>
        {isDone ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>All Caught Up!</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 24 }}>You've seen all strategies</Text>
            <Pressable onPress={() => { setCurrentIndex(0); loadData(); }} style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, backgroundColor: `${colors.accent}20`, borderWidth: 1, borderColor: colors.accent }}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Refresh</Text>
            </Pressable>
          </View>
        ) : (
          visibleCards.map((strategy, i) => (
            <SwipeCard
              key={strategy.id}
              strategy={strategy}
              isTop={i === 0}
              index={i}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              onTap={() => handleTap(strategy)}
            />
          ))
        )}
      </View>

      {/* Bottom action buttons */}
      {!isDone && visibleCards.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingHorizontal: 24, paddingBottom: insets.bottom + 24, paddingTop: 16 }}>
          {/* Pass */}
          <Pressable
            onPress={handleSwipeLeft}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.4)', justifyContent: 'center', alignItems: 'center' }}
          >
            <X size={22} color="#EF4444" />
          </Pressable>

          {/* Detail (center, larger) */}
          <Pressable
            onPress={() => handleTap(visibleCards[0])}
            style={{ width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: 'rgba(184,134,63,0.4)', overflow: 'hidden' }}
          >
            <LinearGradient colors={[gold[800], gold[600], gold[400]]} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Wallet size={26} color="#fff" />
            </LinearGradient>
          </Pressable>

          {/* Like */}
          <Pressable
            onPress={handleSwipeRight}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.4)', justifyContent: 'center', alignItems: 'center' }}
          >
            <TrendingUp size={22} color="#10B981" />
          </Pressable>
        </View>
      )}

      {/* SuccessOverlay */}
      {matchedStrategy && (
        <SuccessOverlay
          strategy={matchedStrategy}
          onClose={() => setMatchedStrategy(null)}
          onGoToStrategy={() => { setMatchedStrategy(null); onStrategySelect(matchedStrategy); }}
          onBuy={() => { setMatchedStrategy(null); handleInvest(matchedStrategy); }}
        />
      )}

      {/* InvestSheet */}
      <InvestSheet
        isOpen={isInvestOpen}
        onClose={() => { setIsInvestOpen(false); setInvestStatus('IDLE'); }}
        strategy={investTarget}
        status={investStatus}
        onConfirm={handleTransaction}
      />
    </View>
  );
}
