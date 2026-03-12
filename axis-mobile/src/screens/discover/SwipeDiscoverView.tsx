/**
 * SwipeDiscoverView — faithful React Native port of axis-agent SwipeDiscoverView.tsx
 * Animations matched to web:
 *  - CosmicLaunchEffect: 6 rocket trails + 18 particles (Animated.Value)
 *  - READY FOR TAKEOFF: SVG gradient text, -3deg rotation, spring entry
 *  - Button stagger: withDelay 0.5/0.6/0.7s entry
 *  - SwipeToConfirm label: Animated.loop opacity pulse
 *  - SkeletonCard: shimmer pulse (Animated.loop)
 *  - InvestSheet: Available Balance pill + Max button
 */
import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, Image, Dimensions,
  ActivityIndicator, Animated as RNAnimated, StyleSheet, Platform,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay,
  interpolate, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import {
  RefreshCw, X, Wallet, ArrowLeft, ChevronRight, Check,
  TrendingUp, ShoppingCart, Rocket,
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

type TxStatus = 'IDLE' | 'SIGNING' | 'CONFIRMING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

interface TokenData { symbol: string; price: number; change24h: number; logoURI?: string; address: string; }
interface Props { onStrategySelect: (strategy: any) => void; onToggleView?: () => void; }

// ─── CosmicLaunchEffect ───────────────────────────────────────────────────────
// 6 diagonal rocket trails + 18 particles — mirrors web version exactly
const CosmicLaunchEffect = memo(() => {
  const TRAIL_COUNT = 6;
  const PARTICLE_COUNT = 18;
  const random = (min: number, max: number) => Math.random() * (max - min) + min;

  const trailAnims = useRef(
    Array.from({ length: TRAIL_COUNT }, () => new RNAnimated.Value(0))
  ).current;
  const particleAnims = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => new RNAnimated.Value(0))
  ).current;
  const trailData = useRef(
    Array.from({ length: TRAIL_COUNT }, () => ({
      delay: random(0, 300),
      duration: random(600, 1000),
      startX: W * -0.1,
      endX: W * 1.2,
      startY: H * 1.1,
      endY: H * -0.2,
      width: random(2, 6),
    }))
  ).current;
  const particleData = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      delay: random(0, 500),
      duration: random(800, 1600),
      size: random(2, 5),
      startX: random(-W * 0.1, W * 0.4),
      startY: random(H * 0.8, H * 1.2),
      endX: random(W * 0.5, W * 1.5),
      endY: random(-H * 0.5, -H * 1.5),
      color: ['#D4A261', '#f97316', '#22d3ee', '#ffffff'][Math.floor(random(0, 4))],
    }))
  ).current;

  useEffect(() => {
    const animations = [
      ...trailAnims.map((anim, i) =>
        RNAnimated.delay(trailData[i].delay,
          RNAnimated.timing(anim, { toValue: 1, duration: trailData[i].duration, useNativeDriver: true })
        )
      ),
      ...particleAnims.map((anim, i) =>
        RNAnimated.delay(particleData[i].delay,
          RNAnimated.timing(anim, { toValue: 1, duration: particleData[i].duration, useNativeDriver: true })
        )
      ),
    ];
    RNAnimated.parallel(animations).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {trailData.map((t, i) => {
        const anim = trailAnims[i];
        return (
          <RNAnimated.View key={`trail-${i}`} style={{
            position: 'absolute',
            width: t.width,
            height: H * 0.3,
            opacity: anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.8, 0.8, 0] }),
            transform: [
              { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [t.startX, t.endX] }) },
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [t.startY, t.endY] }) },
              { rotate: '45deg' },
            ],
          }}>
            <LinearGradient
              colors={['transparent', '#D4A261', '#f97316', '#22d3ee', 'transparent']}
              style={{ flex: 1 }}
            />
          </RNAnimated.View>
        );
      })}
      {particleData.map((p, i) => {
        const anim = particleAnims[i];
        return (
          <RNAnimated.View key={`particle-${i}`} style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            opacity: anim.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [p.startX, p.endX] }) },
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [p.startY, p.endY] }) },
              { scale: anim.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1.3, 1.3, 0] }) },
            ],
          }} />
        );
      })}
      {/* Ambient radial glow via gradient overlay */}
      <LinearGradient
        colors={['rgba(249,115,22,0.3)', 'rgba(34,211,238,0.15)', 'transparent']}
        style={{ position: 'absolute', bottom: -80, left: -80, width: W * 1.5, height: W * 1.5, borderRadius: W * 0.75 }}
      />
    </View>
  );
});

// ─── SkeletonCard with shimmer pulse ─────────────────────────────────────────
const SkeletonCard = memo(({ index }: { index: number }) => {
  const tx = useSharedValue(W);
  const rot = useSharedValue(22);
  const shimmer = useRef(new RNAnimated.Value(0)).current;
  const dealDelay = (2 - index) * 180;

  const finalScale = 1 - index * 0.05;
  const finalY = index * 10;
  const finalRot = index === 1 ? -2 : index === 2 ? 3 : 0;

  useEffect(() => {
    const t = setTimeout(() => {
      tx.value = withSpring(0, { damping: 22, stiffness: 160 });
      rot.value = withTiming(finalRot, { duration: 450 });
    }, dealDelay);
    // Start shimmer pulse loop
    const pulseLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: true }),
        RNAnimated.timing(shimmer, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    return () => { clearTimeout(t); pulseLoop.stop(); };
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: finalY },
      { rotate: `${rot.value}deg` },
      { scale: finalScale },
    ],
    opacity: Math.max(0, 1 - index * 0.3),
  }));

  const pulseOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.12] });

  return (
    <Animated.View style={[cardStyle, StyleSheet.absoluteFillObject, {
      borderRadius: 32, backgroundColor: '#121212',
      borderWidth: 1, borderColor: 'rgba(184,134,63,0.15)',
      overflow: 'hidden', padding: 20, zIndex: 100 - index,
    }]} pointerEvents="none">
      {/* Header skeleton */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          <RNAnimated.View style={{ width: 64, height: 20, borderRadius: 10, backgroundColor: 'white', opacity: pulseOpacity, marginBottom: 8 }} />
          <RNAnimated.View style={{ width: 160, height: 32, borderRadius: 8, backgroundColor: 'white', opacity: pulseOpacity }} />
        </View>
        <RNAnimated.View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.14] }) }} />
      </View>
      {/* Description skeleton */}
      <RNAnimated.View style={{ width: '100%', height: 12, borderRadius: 6, backgroundColor: 'white', opacity: pulseOpacity, marginBottom: 6 }} />
      <RNAnimated.View style={{ width: '75%', height: 12, borderRadius: 6, backgroundColor: 'white', opacity: pulseOpacity, marginBottom: 20 }} />
      {/* Stats grid */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <RNAnimated.View style={{ flex: 1, height: 90, borderRadius: 16, backgroundColor: 'white', opacity: pulseOpacity, borderWidth: 1, borderColor: 'rgba(184,134,63,0.08)' }} />
        <View style={{ flex: 1, gap: 8 }}>
          <RNAnimated.View style={{ flex: 1, height: 41, borderRadius: 12, backgroundColor: 'white', opacity: pulseOpacity }} />
          <RNAnimated.View style={{ flex: 1, height: 41, borderRadius: 12, backgroundColor: 'white', opacity: pulseOpacity }} />
        </View>
      </View>
      {/* List skeleton */}
      {[1, 2, 3, 4].map(i => (
        <RNAnimated.View key={i} style={{ height: 52, borderRadius: 12, backgroundColor: 'white', opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.02, 0.07] }), borderWidth: 1, borderColor: 'rgba(184,134,63,0.06)', marginBottom: 8 }} />
      ))}
    </Animated.View>
  );
});

// ─── SwipeToConfirm with label pulse ─────────────────────────────────────────
interface SliderProps { onConfirm: () => void; isLoading: boolean; isSuccess: boolean; label: string; amount?: string; }
const SwipeToConfirm = memo(({ onConfirm, isLoading, isSuccess, label, amount }: SliderProps) => {
  const TRACK_W = W - 48;
  const HANDLE = 56;
  const PAD = 4;
  const MAX = TRACK_W - HANDLE - PAD * 2;

  const x = useSharedValue(0);
  const confirmed = useRef(false);
  const labelPulse = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    // Pulse the label text like web's animate-pulse
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(labelPulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        RNAnimated.timing(labelPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Reset on amount change (mirrors web's animate(x, 0) on amount change)
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
  const textOpacity = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, MAX * 0.5], [1, 0]) }));
  const handleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={{
      height: 64, borderRadius: 32, overflow: 'hidden',
      borderWidth: 1,
      borderColor: isSuccess ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)',
      backgroundColor: isSuccess ? 'rgba(16,185,129,0.2)' : '#1C1C1E',
      ...(isSuccess ? { shadowColor: '#10B981', shadowRadius: 20, shadowOpacity: 0.3, elevation: 8 } : {}),
    }}>
      <Animated.View style={[fillStyle, { position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 32, overflow: 'hidden' }]}>
        {!isSuccess ? (
          <LinearGradient colors={[gold[700] ?? '#6B4420', gold[400] ?? '#B8863F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#10B981' }]} />
        )}
      </Animated.View>

      <Animated.View style={[textOpacity, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }]}>
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
        <Animated.View style={[handleStyle, {
          position: 'absolute', top: PAD, left: PAD,
          width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2,
          backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
          shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
        }]}>
          {isLoading ? <ActivityIndicator size="small" color={gold[400]} />
            : isSuccess ? <Check size={24} color="#10B981" />
            : <ChevronRight size={24} color={gold[400]} />}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

// ─── InvestSheet with balance pill + Max ────────────────────────────────────
interface InvestSheetProps { isOpen: boolean; onClose: () => void; strategy: any; status: TxStatus; onConfirm: (amount: string, mode: 'BUY' | 'SELL') => Promise<void>; }
const InvestSheet = memo(({ isOpen, onClose, strategy, status, onConfirm }: InvestSheetProps) => {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('0');
  const [usdcBalance, setUsdcBalance] = useState(0);
  const ticker = strategy?.ticker || 'ETF';
  const MOCK_PRICE = 1.0;

  useEffect(() => {
    if (isOpen) { setAmount('0'); setMode('BUY'); }
  }, [isOpen]);

  const estimatedOutput = useMemo(() => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return '0.0000';
    return (val * MOCK_PRICE).toFixed(4);
  }, [amount]);

  const currentBalance = mode === 'BUY' ? usdcBalance : 0;

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
  const handleMax = () => {
    const maxAmt = mode === 'BUY' ? usdcBalance * 0.95 : 0;
    setAmount(maxAmt.toFixed(4));
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
          {/* BUY / SELL toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: '#1C1C1E', padding: 4, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
            {(['BUY', 'SELL'] as const).map(m => (
              <Pressable key={m} onPress={() => setMode(m)} style={{ paddingHorizontal: 20, paddingVertical: 6, borderRadius: 16, backgroundColor: mode === m ? (gold[400] ?? '#B8863F') : 'transparent' }}>
                <Text style={{ color: mode === m ? '#000' : '#78716C', fontSize: 12, fontWeight: '700' }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Amount + Balance */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 64, fontWeight: '500', color: amount === '0' ? '#57534E' : '#fff', letterSpacing: -2 }}>
            {amount}
          </Text>
          <Text style={{ color: '#78716C', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
            {mode === 'BUY' ? 'USDC' : ticker}
          </Text>

          {/* Available Balance pill — matches web exactly */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginTop: 16, gap: 6 }}>
            <Wallet size={14} color="#78716C" />
            <Text style={{ color: '#A8A29E', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
              Available: {currentBalance.toFixed(4)} {mode === 'BUY' ? 'USDC' : ticker}
            </Text>
            <Pressable onPress={handleMax}>
              <Text style={{ color: gold[400] ?? '#B8863F', fontSize: 11, fontWeight: '700' }}>Max</Text>
            </Pressable>
          </View>

          {amount !== '0' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 6 }}>
              <ArrowLeft size={14} color="#78716C" style={{ transform: [{ rotate: '-90deg' }] }} />
              <Text style={{ color: '#78716C', fontSize: 13 }}>
                Receive approx. {estimatedOutput} {mode === 'BUY' ? ticker : 'USDC'}
              </Text>
            </View>
          )}
        </View>

        {/* Numpad + action */}
        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}>
          {(status === 'IDLE' || status === 'ERROR') && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 32, maxWidth: 320, alignSelf: 'center' }}>
              {KEYS.map((key, i) => (
                <Pressable key={i} onPress={() => key === '⌫' ? handleBack() : handleNum(key.toString())}
                  style={({ pressed }) => ({ width: '33.33%', height: 56, justifyContent: 'center', alignItems: 'center', borderRadius: 28, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
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
    </Modal>
  );
});

// ─── SuccessOverlay with CosmicLaunchEffect + gradient title + stagger ────────
interface SuccessProps { strategy: any; onClose: () => void; onGoToStrategy: () => void; onBuy: () => void; }
const SuccessOverlay = memo(({ strategy, onClose, onGoToStrategy, onBuy }: SuccessProps) => {
  const insets = useSafeAreaInsets();

  // Title spring: scale 0.8→1, y 30→0, opacity 0→1, delay 0.1s
  const titleScale = useSharedValue(0.8);
  const titleY = useSharedValue(30);
  const titleOpacity = useSharedValue(0);
  // Card: opacity 0→1, y 50→0, delay 0.3s
  const cardY = useSharedValue(50);
  const cardOpacity = useSharedValue(0);
  // Buttons stagger: 0.5 / 0.6 / 0.7s
  const btn1Opacity = useSharedValue(0);
  const btn1Y = useSharedValue(20);
  const btn2Opacity = useSharedValue(0);
  const btn2Y = useSharedValue(20);
  const btn3Opacity = useSharedValue(0);
  const btn3Y = useSharedValue(20);
  // Overlay fade
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    overlayOpacity.value = withTiming(1, { duration: 200 });
    // title: delay 100ms
    titleOpacity.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 100 }));
    titleScale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 100 }));
    titleY.value = withDelay(100, withSpring(0, { damping: 14, stiffness: 100 }));
    // card: delay 300ms
    cardOpacity.value = withDelay(300, withSpring(1));
    cardY.value = withDelay(300, withSpring(0));
    // buttons: delay 500/600/700ms
    btn1Opacity.value = withDelay(500, withSpring(1));
    btn1Y.value = withDelay(500, withSpring(0));
    btn2Opacity.value = withDelay(600, withSpring(1));
    btn2Y.value = withDelay(600, withSpring(0));
    btn3Opacity.value = withDelay(700, withSpring(1));
    btn3Y.value = withDelay(700, withSpring(0));
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }, { translateY: titleY.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));
  const btn1Style = useAnimatedStyle(() => ({ opacity: btn1Opacity.value, transform: [{ translateY: btn1Y.value }] }));
  const btn2Style = useAnimatedStyle(() => ({ opacity: btn2Opacity.value, transform: [{ translateY: btn2Y.value }] }));
  const btn3Style = useAnimatedStyle(() => ({ opacity: btn3Opacity.value, transform: [{ translateY: btn3Y.value }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, overlayStyle, {
      backgroundColor: 'rgba(0,0,0,0.97)',
      zIndex: 200, justifyContent: 'center', alignItems: 'center', padding: 24,
      overflow: 'hidden',
    }]}>
      {/* Cosmic particles */}
      <CosmicLaunchEffect />
      {/* Ambient gradient overlay */}
      <View style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <LinearGradient
          colors={['rgba(154,52,18,0.2)', 'transparent', 'rgba(30,58,138,0.2)']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* READY FOR TAKEOFF — SVG gradient text, -3deg rotation */}
      <Animated.View style={[titleStyle, { marginBottom: 40, zIndex: 20, transform: [
        { scale: titleScale },
        { translateY: titleY },
        { rotate: '-3deg' },
      ]}]}>
        <Svg height={130} width={W - 48}>
          <Defs>
            <SvgLinearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#fb923c" />
              <Stop offset="0.5" stopColor="#fef08a" />
              <Stop offset="1" stopColor="#f97316" />
            </SvgLinearGradient>
          </Defs>
          <SvgText
            fill="url(#titleGrad)"
            fontSize={52}
            fontWeight="900"
            fontStyle="italic"
            textAnchor="middle"
            x={(W - 48) / 2}
            y={58}
          >
            READY FOR
          </SvgText>
          <SvgText
            fill="url(#titleGrad)"
            fontSize={52}
            fontWeight="900"
            fontStyle="italic"
            textAnchor="middle"
            x={(W - 48) / 2}
            y={118}
          >
            TAKEOFF
          </SvgText>
        </Svg>
      </Animated.View>

      {/* Strategy card preview */}
      <Animated.View style={[cardStyle, {
        width: '100%', maxWidth: 320,
        backgroundColor: '#140E08', borderRadius: 24,
        borderWidth: 1, borderColor: 'rgba(184,134,63,0.25)',
        overflow: 'hidden', marginBottom: 24, zIndex: 20,
        shadowColor: '#000', shadowRadius: 24, shadowOpacity: 0.8, elevation: 12,
      }]}>
        {/* Gradient bar at top */}
        <LinearGradient
          colors={['#ea580c', '#eab308', '#06b6d4']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ height: 6, position: 'absolute', top: 0, left: 0, right: 0 }}
        />
        <View style={{ padding: 20, paddingTop: 26 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View style={{ position: 'relative' }}>
              <Image
                source={{ uri: strategy?.creatorPfpUrl || `https://api.dicebear.com/7.x/identicon/png?seed=${strategy?.creatorAddress}` }}
                style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: 'rgba(184,134,63,0.3)' }}
              />
              <View style={{ position: 'absolute', bottom: -6, right: -4, backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>ROI {(strategy?.roi || 0).toFixed(0)}%</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }} numberOfLines={1}>{strategy?.name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 4 }}>
                By {strategy?.creatorAddress?.slice(0, 4)}...{strategy?.creatorAddress?.slice(-4)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginLeft: 4 }}>
            {(strategy?.tokens || []).slice(0, 6).map((t: any, i: number) => (
              <View key={i} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(184,134,63,0.15)', marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                {t.logoURI ? <Image source={{ uri: t.logoURI }} style={{ width: 36, height: 36 }} /> : <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{t.symbol?.[0]}</Text>}
              </View>
            ))}
          </View>
        </View>
      </Animated.View>

      {/* Buttons with stagger */}
      <View style={{ width: '100%', maxWidth: 320, gap: 10, zIndex: 20 }}>
        <Animated.View style={btn1Style}>
          <Pressable onPress={onBuy} style={{ borderRadius: 16, overflow: 'hidden' }}>
            <LinearGradient colors={['#059669', '#06b6d4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, shadowColor: '#10B981', shadowRadius: 20, shadowOpacity: 0.4 }}>
              <ShoppingCart size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>Buy Now</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <Animated.View style={btn2Style}>
          <Pressable onPress={onGoToStrategy} style={{ borderRadius: 16, overflow: 'hidden' }}>
            <LinearGradient colors={['#ea580c', '#ca8a04']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, shadowColor: '#f97316', shadowRadius: 20, shadowOpacity: 0.4 }}>
              <Rocket size={20} color="#fff" fill="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>LFG (View Detail)</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <Animated.View style={btn3Style}>
          <Pressable onPress={onClose} style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(184,134,63,0.15)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '700' }}>Keep Scouting</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
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
  const [tokenDataMap, setTokenDataMap] = useState<Record<string, any>>({});
  const [matchedStrategy, setMatchedStrategy] = useState<any | null>(null);
  const [isInvestOpen, setIsInvestOpen] = useState(false);
  const [investStatus, setInvestStatus] = useState<TxStatus>('IDLE');
  const [investTarget, setInvestTarget] = useState<any | null>(null);
  const lastSwipeTime = useRef(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [publicRes, tokensRes] = await Promise.all([
        api.discoverStrategies(1000).catch(() => ({ strategies: [] })),
        api.getTokens().catch(() => ({ tokens: [] })),
      ]);
      const tokenMap: Record<string, any> = {};
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
    } catch (e) { console.error('SwipeDiscoverView load error:', e); }
    finally { setLoading(false); }
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
      name: s.name, ticker: s.ticker, type: s.type || 'BALANCED',
      tokens: enrichedTokens, roi, tvl: s.tvl || 0,
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

  const handleInvest = (strategy: any) => { setInvestTarget(strategy); setIsInvestOpen(true); };

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

  const isDone = currentIndex >= enriched.length && !loading;
  const visibleCards = enriched.slice(currentIndex, currentIndex + 3);

  // Loading skeleton
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
              onTap={() => onStrategySelect(strategy)}
            />
          ))
        )}
      </View>

      {/* Bottom action buttons */}
      {!isDone && visibleCards.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingHorizontal: 24, paddingBottom: insets.bottom + 24, paddingTop: 16 }}>
          <Pressable onPress={handleSwipeLeft} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.4)', justifyContent: 'center', alignItems: 'center' }}>
            <X size={22} color="#EF4444" />
          </Pressable>
          <Pressable onPress={() => onStrategySelect(visibleCards[0])} style={{ width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: 'rgba(184,134,63,0.4)', overflow: 'hidden' }}>
            <LinearGradient colors={[gold[800] ?? '#3D1F00', gold[600] ?? '#7C4A00', gold[400] ?? '#B8863F']} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Wallet size={26} color="#fff" />
            </LinearGradient>
          </Pressable>
          <Pressable onPress={handleSwipeRight} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.4)', justifyContent: 'center', alignItems: 'center' }}>
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
