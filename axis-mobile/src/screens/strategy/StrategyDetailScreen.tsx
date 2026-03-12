/**
 * StrategyDetailScreen — faithful React Native port of axis-agent StrategyDetailView.tsx
 * Features:
 *  - Scroll-based sticky header with opacity transition
 *  - Hero section: price + % change
 *  - Stats strip (horizontal scroll): TVL, ROI, Contract address copy
 *  - Composition list with animated progress bars
 *  - Watchlist toggle with API + animation
 *  - Share to X (Linking)
 *  - InvestSheet: full-screen Phantom numpad + slide-to-confirm
 *  - Bottom action bar with "Trade" button + AXIS balance
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Image, Dimensions, StyleSheet,
  ActivityIndicator, Platform, Animated as RNAnimated, Linking,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate,
  useAnimatedScrollHandler, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import {
  ArrowLeft, Star, Copy, TrendingUp, TrendingDown,
  Layers, Activity, PieChart, Wallet, ArrowRight,
  X, Check, ArrowDown, ChevronRight,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { api } from '../../services/api';
import { DexScreenerService } from '../../services/dexscreener';
import { useToast } from '../../components/common/context/ToastContext';
import { useWallet } from '../../context/WalletContext';
import { colors, gold, serifFont } from '../../config/theme';
import type { RootStackParamList } from '../../navigation/types';

const { width: W } = Dimensions.get('window');
const MASTER_MINT = '2JiisncKr8DhvA68MpszFDjGAVu2oFtqJJC837LLiKdT';

type TxStatus = 'IDLE' | 'SIGNING' | 'CONFIRMING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
type DetailRoute = RouteProp<RootStackParamList, 'StrategyDetail'>;

// ─── XIcon (Twitter/X) ───────────────────────────────────────────────────────
const XIcon = ({ size = 18, color = '#fff' }) => (
  <Text style={{ color, fontSize: size, fontWeight: '700' }}>𝕏</Text>
);

// ─── SwipeToConfirm with label pulse ─────────────────────────────────────────
interface SliderProps { onConfirm: () => void; isLoading: boolean; isSuccess: boolean; label: string; amount?: string; }
const SwipeToConfirm = ({ onConfirm, isLoading, isSuccess, label, amount }: SliderProps) => {
  const TRACK_W = W - 48;
  const HANDLE = 56;
  const PAD = 4;
  const MAX = TRACK_W - HANDLE - PAD * 2;
  const x = useSharedValue(0);
  const confirmed = useRef(false);
  const labelPulse = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    // Pulse like web's animate-pulse
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(labelPulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        RNAnimated.timing(labelPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Reset slider on amount change (matches web behavior)
  useEffect(() => {
    if (!isLoading && !isSuccess) {
      x.value = withSpring(0, { stiffness: 300, damping: 30 });
      confirmed.current = false;
    }
  }, [amount]);

  useEffect(() => {
    if (isSuccess) x.value = withSpring(MAX);
    else if (!isLoading) { x.value = withSpring(0); confirmed.current = false; }
  }, [isSuccess, isLoading]);

  const gesture = Gesture.Pan()
    .enabled(!isLoading && !isSuccess)
    .onUpdate(e => { x.value = Math.max(0, Math.min(e.translationX, MAX)); })
    .onEnd(() => {
      if (x.value > MAX * 0.6) {
        x.value = withSpring(MAX, { stiffness: 500, damping: 40 });
        if (!confirmed.current && !isLoading && !isSuccess) { confirmed.current = true; runOnJS(onConfirm)(); }
      } else { x.value = withSpring(0, { stiffness: 400, damping: 30 }); confirmed.current = false; }
    });

  const fillStyle = useAnimatedStyle(() => ({ width: HANDLE + PAD * 2 + x.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, MAX * 0.5], [1, 0]) }));
  const handleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={{ height: 64, borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: isSuccess ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)', backgroundColor: isSuccess ? 'rgba(16,185,129,0.2)' : '#1C1C1E',
      ...(isSuccess ? { shadowColor: '#10B981', shadowRadius: 20, shadowOpacity: 0.3, elevation: 8 } : {}),
    }}>
      <Animated.View style={[fillStyle, { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 32, overflow: 'hidden' }]}>
        {!isSuccess ? (
          <LinearGradient colors={[gold[700], gold[400]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#10B981' }]} />}
      </Animated.View>
      <Animated.View style={[textStyle, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }]}>
        <RNAnimated.Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 4, opacity: labelPulse }}>
          {isLoading ? 'PROCESSING...' : label}
        </RNAnimated.Text>
      </Animated.View>
      {isSuccess && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 4 }}>SUCCESS</Text>
        </View>
      )}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[handleStyle, { position: 'absolute', top: PAD, left: PAD, width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 }]}>
          {isLoading ? <ActivityIndicator size="small" color={gold[400]} /> : isSuccess ? <Check size={24} color="#10B981" /> : <ChevronRight size={24} color={gold[400]} />}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

// ─── InvestSheet ──────────────────────────────────────────────────────────────
interface InvestSheetProps {
  isOpen: boolean; onClose: () => void; strategy: any;
  status: TxStatus; onConfirm: (amount: string, mode: 'BUY' | 'SELL') => Promise<void>;
  userEtfBalance: number;
}
const InvestSheet = ({ isOpen, onClose, strategy, status, onConfirm, userEtfBalance }: InvestSheetProps) => {
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
  const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];

  if (!isOpen) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0C0C0C', zIndex: 9999 }]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: 16 }}>
        <Pressable onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center' }}>
          <X size={20} color="#fff" />
        </Pressable>
        <View style={{ flexDirection: 'row', backgroundColor: '#1C1C1E', padding: 4, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
          {(['BUY', 'SELL'] as const).map(m => (
            <Pressable key={m} onPress={() => setMode(m)} style={{ paddingHorizontal: 20, paddingVertical: 6, borderRadius: 16, backgroundColor: mode === m ? gold[400] : 'transparent' }}>
              <Text style={{ color: mode === m ? '#000' : '#78716C', fontSize: 12, fontWeight: '700' }}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Amount */}
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 64, fontWeight: '500', color: amount === '0' ? '#57534E' : '#fff', letterSpacing: -2 }}>{amount}</Text>
        <Text style={{ color: '#78716C', fontSize: 18, fontWeight: '700', marginTop: 8 }}>{mode === 'BUY' ? 'USDC' : ticker}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: '#1C1C1E', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', gap: 8 }}>
          <Wallet size={14} color="#78716C" />
          <Text style={{ color: '#A8A29E', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
            Available: {mode === 'BUY' ? '0.00 USDC' : `${userEtfBalance.toFixed(4)} ${ticker}`}
          </Text>
          <Pressable onPress={() => setAmount(mode === 'BUY' ? '0' : userEtfBalance.toFixed(4))}>
            <Text style={{ color: gold[400], fontSize: 11, fontWeight: '700' }}>Max</Text>
          </Pressable>
        </View>
        {amount !== '0' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
            <ArrowDown size={14} color="#78716C" />
            <Text style={{ color: '#78716C', fontSize: 13 }}>
              Receive approx. {parseFloat(amount || '0').toFixed(4)} {mode === 'BUY' ? ticker : 'USDC'}
            </Text>
          </View>
        )}
      </View>

      {/* Keypad */}
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}>
        {(status === 'IDLE' || status === 'ERROR') && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 28, maxWidth: 320, alignSelf: 'center' }}>
            {KEYS.map((key, i) => (
              <Pressable
                key={i}
                onPress={() => key === '⌫' ? handleBack() : handleNum(key)}
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
          <SwipeToConfirm onConfirm={handleExecute} isLoading={false} isSuccess={status === 'SUCCESS'} label={`SLIDE TO ${mode}`} amount={amount} />
        )}
      </View>
    </View>
  );
};

// ─── TokenIcon with fallback ─────────────────────────────────────────────────
const TokenIcon = ({ symbol, src, address, size = 40 }: { symbol: string; src?: string | null; address?: string; size?: number }) => {
  const [uri, setUri] = useState(src || (address ? `https://static.jup.ag/tokens/${address}.png` : `https://ui-avatars.com/api/?name=${symbol}&background=random&color=fff&size=128&bold=true`));
  const errCount = useRef(0);
  const handleErr = () => {
    errCount.current++;
    if (errCount.current === 1 && address) setUri(`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${address}/logo.png`);
    else setUri(`https://ui-avatars.com/api/?name=${symbol}&background=random&color=fff&size=128&bold=true`);
  };
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} onError={handleErr} />;
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function StrategyDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { publicKey } = useWallet();
  const { strategy: rawStrategy } = route.params;

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });

  const headerBgStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 60], [0, 1]) }));
  const headerTitleStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 60], [0, 1]) }));

  const [strategy] = useState(rawStrategy);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isInvestOpen, setIsInvestOpen] = useState(false);
  const [investStatus, setInvestStatus] = useState<TxStatus>('IDLE');
  const [userEtfBalance] = useState(0);
  const [tokensInfo, setTokensInfo] = useState<any[]>(strategy.tokens || []);
  const [tokenPrices, setTokenPrices] = useState<Record<string, { price: number; change24h: number }>>({});
  const [loading, setLoading] = useState(true);

  // Animated progress bar values per token
  const progressAnims = useRef<RNAnimated.Value[]>([]);

  useEffect(() => {
    progressAnims.current = (strategy.tokens || []).map(() => new RNAnimated.Value(0));
    setLoading(true);
    const init = async () => {
      try {
        const mints = (strategy.tokens || []).map((t: any) => t.address || t.mint).filter((m: any) => m?.length > 30);
        if (mints.length > 0) {
          const dexData = await DexScreenerService.getMarketData(mints);
          setTokenPrices(dexData);
        }
        // Enrich token logos
        const tokRes = await api.getTokens();
        if (tokRes.success) {
          const enriched = (strategy.tokens || []).map((t: any) => {
            const meta = (tokRes.tokens || []).find((m: any) => m.symbol === t.symbol?.toUpperCase());
            return { ...t, logoURI: meta?.logoURI || t.logoURI, name: meta?.name || t.symbol };
          });
          setTokensInfo(enriched);
        }
        // Watchlist check
        if (publicKey) {
          const wRes = await api.checkWatchlist(strategy.id, publicKey.toBase58()).catch(() => null);
          if (wRes?.isWatchlisted) setIsWatchlisted(true);
        }
      } catch {}
      setLoading(false);
      // Animate progress bars
      progressAnims.current.forEach((anim, i) => {
        RNAnimated.timing(anim, { toValue: 1, duration: 1000, delay: i * 100, useNativeDriver: false }).start();
      });
    };
    init();
  }, [strategy.id, publicKey]);

  const handleToggleWatchlist = async () => {
    if (!publicKey) { showToast('Connect wallet first', 'info'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = !isWatchlisted;
    setIsWatchlisted(next);
    try { await api.toggleWatchlist(strategy.id, publicKey.toBase58()); }
    catch { setIsWatchlisted(!next); showToast('Failed to update', 'error'); }
  };

  const handleCopyCA = async () => {
    await Clipboard.setStringAsync(MASTER_MINT);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('Contract address copied', 'success');
  };

  const handleShareToX = () => {
    const text = `Check out ${strategy.name} ($${strategy.ticker || strategy.name}) on Axis! 🚀`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    Linking.openURL(url);
  };

  const handleTransaction = async (amount: string, mode: 'BUY' | 'SELL') => {
    if (!publicKey) { showToast('Connect wallet first', 'error'); return; }
    setInvestStatus('SIGNING');
    try {
      await new Promise(r => setTimeout(r, 1500));
      setInvestStatus('SUCCESS');
      showToast(`Success! ${mode} ${amount}`, 'success');
      setTimeout(() => { setIsInvestOpen(false); setInvestStatus('IDLE'); }, 2000);
    } catch {
      setInvestStatus('ERROR');
      showToast('Transaction failed', 'error');
      setTimeout(() => setInvestStatus('IDLE'), 2000);
    }
  };

  // Price + change from token data
  const changePct = useMemo(() => {
    if (!tokensInfo.length) return strategy.roi || 0;
    return tokensInfo.reduce((sum: number, t: any) => {
      const d = tokenPrices[t.address || t.mint];
      return sum + (d?.change24h || 0) * ((t.weight || 0) / 100);
    }, 0);
  }, [tokensInfo, tokenPrices, strategy.roi]);

  const isPositive = changePct >= 0;
  const latestValue = strategy.price || strategy.tvl || 100;

  const typeColor = { AGGRESSIVE: gold[400], BALANCED: '#3b82f6', CONSERVATIVE: '#30a46c' }[strategy.type as string] || gold[400];

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Sticky floating header */}
      <Animated.View style={[headerBgStyle, { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 }]}>
        <View style={{ backgroundColor: 'rgba(0,0,0,0.85)', borderBottomWidth: 1, borderBottomColor: 'rgba(184,134,63,0.08)', paddingTop: insets.top, paddingBottom: 10 }} />
      </Animated.View>

      {/* Always-visible header buttons */}
      <View style={{ position: 'absolute', top: insets.top + 4, left: 0, right: 0, zIndex: 200, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 }}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ArrowLeft size={20} color="#fff" />
        </Pressable>

        <Animated.Text style={[headerTitleStyle, { color: '#fff', fontWeight: '700', fontSize: 14, alignSelf: 'center' }]}>
          ${strategy.ticker || strategy.name}
        </Animated.Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={handleToggleWatchlist} style={styles.iconBtn}>
            <Star size={20} color={isWatchlisted ? '#FFD700' : 'rgba(255,255,255,0.7)'} fill={isWatchlisted ? '#FFD700' : 'none'} />
          </Pressable>
          <Pressable onPress={handleShareToX} style={styles.iconBtn}>
            <XIcon size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      </View>

      {/* Scrollable content */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 52, paddingBottom: 120 }}
      >
        {/* Hero */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#78716C', marginBottom: 4 }}>{strategy.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
            <Text style={{ fontSize: 48, fontWeight: '700', color: '#fff', fontFamily: serifFont, letterSpacing: -1 }}>
              ${latestValue.toFixed(2)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            {isPositive ? <TrendingUp size={16} color="#34D399" /> : <TrendingDown size={16} color="#F87171" />}
            <Text style={{ color: isPositive ? '#34D399' : '#F87171', fontWeight: '700', fontSize: 14 }}>
              {Math.abs(changePct).toFixed(2)}%
            </Text>
            <Text style={{ color: '#57534E', fontSize: 13 }}>Today</Text>
          </View>
        </View>

        {/* Stats Strip — horizontal scroll */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }} style={{ marginBottom: 24 }}>
          {/* TVL */}
          <View style={styles.statCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Layers size={14} color="#78716C" />
              <Text style={styles.statLabel}>TVL</Text>
            </View>
            <Text style={styles.statValue}>
              {typeof strategy.tvl === 'number' ? (strategy.tvl >= 1000 ? `${(strategy.tvl / 1000).toFixed(1)}k` : strategy.tvl.toFixed(0)) : '0'}
              <Text style={{ fontSize: 11, color: '#57534E' }}> USDC</Text>
            </Text>
          </View>

          {/* ROI */}
          <View style={styles.statCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Activity size={14} color="#78716C" />
              <Text style={styles.statLabel}>ROI (All)</Text>
            </View>
            <Text style={[styles.statValue, { color: isPositive ? gold[400] : '#F87171' }]}>
              {changePct > 0 ? '+' : ''}{changePct.toFixed(2)}%
            </Text>
          </View>

          {/* Contract */}
          <Pressable onPress={handleCopyCA} style={[styles.statCard, { backgroundColor: 'rgba(184,134,63,0.05)' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Copy size={14} color="#78716C" />
              <Text style={styles.statLabel}>Contract</Text>
            </View>
            <Text style={[styles.statValue, { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
              {MASTER_MINT.slice(0, 4)}...{MASTER_MINT.slice(-4)}
            </Text>
          </Pressable>

          {/* Type */}
          <View style={styles.statCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <PieChart size={14} color="#78716C" />
              <Text style={styles.statLabel}>Type</Text>
            </View>
            <Text style={[styles.statValue, { color: typeColor }]}>{strategy.type}</Text>
          </View>
        </ScrollView>

        {/* Composition */}
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <PieChart size={16} color="#78716C" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#78716C', letterSpacing: 2, textTransform: 'uppercase' }}>Composition</Text>
          </View>

          <View style={{ backgroundColor: 'rgba(20,14,8,0.5)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(184,134,63,0.08)', overflow: 'hidden' }}>
            {loading ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={gold[400]} />
                <Text style={{ color: '#57534E', marginTop: 8, fontSize: 13 }}>Loading composition...</Text>
              </View>
            ) : tokensInfo.map((token: any, i: number) => {
              const d = tokenPrices[token.address || token.mint];
              const progressAnim = progressAnims.current[i] || new RNAnimated.Value(0);
              const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${token.weight || 0}%`] });

              return (
                <View
                  key={i}
                  style={[styles.tokenRow, i < tokensInfo.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(184,134,63,0.08)' }]}
                >
                  {/* Token icon + info */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                    <TokenIcon symbol={token.symbol || '?'} src={token.logoURI} address={token.address || token.mint} size={40} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <View>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{token.symbol || 'UNK'}</Text>
                          <Text style={{ color: '#78716C', fontSize: 11 }}>{token.name || 'Token'}</Text>
                        </View>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{token.weight}%</Text>
                      </View>
                      {/* Progress bar */}
                      <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                        <RNAnimated.View style={{ height: '100%', width: progressWidth, backgroundColor: gold[400], borderRadius: 3 }} />
                      </View>
                      {d && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          <Text style={{ color: '#78716C', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                            {d.price >= 1 ? `$${d.price.toFixed(2)}` : `$${d.price.toFixed(4)}`}
                          </Text>
                          <Text style={{ color: d.change24h >= 0 ? '#34D399' : '#F87171', fontSize: 10, fontWeight: '700' }}>
                            {d.change24h >= 0 ? '+' : ''}{d.change24h.toFixed(2)}%
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </Animated.ScrollView>

      {/* Bottom Action Bar */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(8,5,3,0.97)', borderTopWidth: 1, borderTopColor: 'rgba(184,134,63,0.15)', paddingTop: 12, paddingHorizontal: 24, paddingBottom: insets.bottom + 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 10, color: '#78716C', letterSpacing: 1, textTransform: 'uppercase' }}>Your AXIS</Text>
            <Text style={{ fontSize: 18, color: '#fff', fontWeight: '700', fontFamily: serifFont }}>{userEtfBalance.toFixed(2)}</Text>
          </View>
          <Pressable
            onPress={() => setIsInvestOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24, backgroundColor: gold[400] }}
          >
            <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>Trade</Text>
            <ArrowRight size={16} color="#000" />
          </Pressable>
        </View>
      </View>

      {/* InvestSheet */}
      {isInvestOpen && (
        <InvestSheet
          isOpen={isInvestOpen}
          onClose={() => { setIsInvestOpen(false); setInvestStatus('IDLE'); }}
          strategy={strategy}
          status={investStatus}
          onConfirm={handleTransaction}
          userEtfBalance={userEtfBalance}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(184,134,63,0.12)' },
  statCard: { minWidth: 140, padding: 16, backgroundColor: '#140E08', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(184,134,63,0.08)' },
  statLabel: { fontSize: 10, color: '#78716C', fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  statValue: { fontSize: 18, color: '#fff', fontWeight: '700' },
  tokenRow: { padding: 16 },
});
