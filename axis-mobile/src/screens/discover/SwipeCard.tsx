import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Pressable, Dimensions, Linking } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolate, runOnJS, useSharedValue as useSV, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { TrendingUp, TrendingDown, Clock, Copy, ExternalLink, Wallet } from 'lucide-react-native';
import { colors, serifFont } from '../../config/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

// --- Types ---
interface Token {
  symbol: string;
  weight: number;
  address?: string;
  logoURI?: string | null;
  currentPrice?: number;
  change24h?: number;
}

interface StrategyCardData {
  id: string;
  name: string;
  ticker?: string;
  type: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  tokens: Token[];
  roi: number;
  tvl: number;
  creatorAddress: string;
  creatorPfpUrl?: string | null;
  description?: string;
  createdAt: number;
  mintAddress?: string;
}

interface Props {
  strategy: StrategyCardData;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onTap: () => void;
  isTop: boolean;
  index: number;
}

// --- Helpers ---
export const formatPrice = (price: any) => {
  const p = Number(price);
  if (isNaN(p) || p === 0) return '$0.00';
  if (p < 0.000001) return '$' + p.toFixed(8);
  if (p < 0.01) return '$' + p.toFixed(6);
  if (p < 1) return '$' + p.toFixed(4);
  return '$' + p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatTvl = (value: number): string => {
  if (value < 0.01) return '< 0.01';
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export const timeAgo = (timestamp: number) => {
  if (!timestamp) return 'Recently';
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours}h ago`;
  return 'Just now';
};

// --- FormatChange — web-exact colors: #34D399 / #F87171 ---
export const FormatChange = ({
  value,
  size = 14,
  textStyle,
}: {
  value: any;
  size?: number;
  textStyle?: any;
}) => {
  const c = Number(value);
  if (isNaN(c) || !isFinite(c))
    return <Text style={[{ fontWeight: 'bold', color: 'rgba(255,255,255,0.4)' }, textStyle]}>0.00%</Text>;
  const isPositive = c >= 0;
  const color = isPositive ? '#34D399' : '#F87171';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      {isPositive ? (
        <TrendingUp size={size} color={color} style={{ marginRight: 4 }} />
      ) : (
        <TrendingDown size={size} color={color} style={{ marginRight: 4 }} />
      )}
      <Text style={[{ fontWeight: 'bold', color }, textStyle]}>
        {Math.abs(c).toFixed(2)}%
      </Text>
    </View>
  );
};

// --- TokenIcon ---
export const TokenIcon = ({ symbol, src, address, size = 20 }: {
  symbol: string; src?: string | null; address?: string; size?: number;
}) => {
  const getInitialSrc = () => {
    if (src && src.startsWith('http')) return src;
    if (address) return `https://static.jup.ag/tokens/${address}.png`;
    return `https://jup.ag/tokens/${symbol}.svg`;
  };
  const [imgSrc, setImgSrc] = useState(getInitialSrc());
  const [errorCount, setErrorCount] = useState(0);
  useEffect(() => { setErrorCount(0); setImgSrc(getInitialSrc()); }, [src, address, symbol]);
  const handleError = () => {
    const n = errorCount + 1;
    setErrorCount(n);
    if (n === 1 && address)
      setImgSrc(`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${address}/logo.png`);
    else
      setImgSrc(`https://ui-avatars.com/api/?name=${symbol}&background=random&color=fff&size=128&bold=true`);
  };
  return (
    <Image
      source={{ uri: imgSrc }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(0,0,0,0.5)' }}
      onError={handleError}
    />
  );
};

// --- Type badge colors — matches web EXACTLY (amber for AGGRESSIVE) ---
const typeStyles = {
  AGGRESSIVE: {
    text: '#fde68a',      // amber-200
    bg: 'rgba(245,158,11,0.1)',   // amber-500/10
    border: 'rgba(245,158,11,0.3)', // amber-500/30
  },
  BALANCED: {
    text: '#bfdbfe',      // blue-200
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.3)',
  },
  CONSERVATIVE: {
    text: '#a7f3d0',      // emerald-200
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
  },
};

// ─── AnimatedBar — mirrors web's motion.div width 0→fill with easeOut + stagger ──
const AnimatedBar = ({ relativeFill, delay }: { relativeFill: number; delay: number }) => {
  const width = useSharedValue(0);
  useEffect(() => {
    const t = setTimeout(() => {
      width.value = withTiming(relativeFill, { duration: 600, easing: Easing.out(Easing.quad) });
    }, delay);
    return () => clearTimeout(t);
  }, [relativeFill, delay]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));
  return (
    <Animated.View style={[style, {
      position: 'absolute', left: 0, top: 0, bottom: 0,
      backgroundColor: 'rgba(255,255,255,0.1)',
    }]} />
  );
};

// --- Main Component ---
export function SwipeCard({ strategy, onSwipeLeft, onSwipeRight, onTap, isTop, index }: Props) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const prevIndex = useRef(index);

  // Spring promotion when card moves to top (matches web animate(y, 0, spring))
  useEffect(() => {
    if (index === 0 && prevIndex.current > 0) {
      translateY.value = prevIndex.current * 14;
      translateY.value = withSpring(0, { stiffness: 400, damping: 30 });
    }
    prevIndex.current = index;
  }, [index]);

  const gesture = Gesture.Pan()
    .enabled(isTop)
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.2;
    })
    .onEnd((e) => {
      const { translationX, velocityX } = e;
      if (translationX > SWIPE_THRESHOLD || velocityX > 600) {
        translateX.value = withSpring(SCREEN_WIDTH * 1.5, { stiffness: 600, damping: 40 });
        runOnJS(onSwipeRight)();
      } else if (translationX < -SWIPE_THRESHOLD || velocityX < -600) {
        translateX.value = withSpring(-SCREEN_WIDTH * 1.5, { stiffness: 600, damping: 40 });
        runOnJS(onSwipeLeft)();
      } else {
        translateX.value = withSpring(0, { stiffness: 500, damping: 28 });
        translateY.value = withSpring(0, { stiffness: 500, damping: 28 });
      }
    });

  // Deck rotation — mirrors web: index 1 = -2deg, index 2 = +3deg
  const deckRotate = index === 1 ? -2 : index === 2 ? 3 : 0;

  const cardStyle = useAnimatedStyle(() => {
    const rotate = isTop
      ? interpolate(translateX.value, [-200, 200], [-12, 12])
      : deckRotate;
    const cardOpacity = isTop
      ? interpolate(translateX.value, [-400, -200, 0, 200, 400], [0, 1, 1, 1, 0])
      : 1;
    return {
      transform: [
        { translateX: isTop ? translateX.value : 0 },
        { translateY: isTop ? translateY.value : index * 14 },
        { rotate: `${rotate}deg` },
        { scale: 1 - index * 0.05 },
      ],
      opacity: cardOpacity,
    };
  });

  const likeOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [20, SWIPE_THRESHOLD], [0, 1]),
  }));
  const nopeOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -20], [1, 0]),
  }));

  const isPositive = strategy.roi >= 0;
  const ts = typeStyles[strategy.type] || typeStyles.BALANCED;
  const sortedTokens = [...strategy.tokens].sort((a, b) => b.weight - a.weight);
  const maxLogos = 8;
  const displayTokens = sortedTokens.slice(0, maxLogos);
  const overflow = Math.max(0, sortedTokens.length - maxLogos);
  const maxWeight = Math.max(...sortedTokens.map(t => t.weight), 1);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[cardStyle, {
        position: 'absolute', width: '100%', height: '100%', zIndex: 100 - index,
      }]}>
        <Pressable onPress={isTop ? onTap : undefined} style={{ flex: 1 }}>
          {/* Card body — dark cool gradient exactly matching web */}
          <View style={{
            flex: 1, borderRadius: 32, overflow: 'hidden',
            backgroundColor: '#0e0e0e',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
            shadowColor: '#000', shadowRadius: 32, shadowOpacity: 0.6, elevation: 16,
          }}>
            {/* Background gradient (simulated via LinearGradient) */}
            <LinearGradient
              colors={['#111', '#0a0a0a']}
              start={{ x: 0.15, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ position: 'absolute', inset: 0 as any }}
            />

            {/* Glossy reflection at top (matches web h-1/3 from-white/5) */}
            <LinearGradient
              colors={['rgba(255,255,255,0.05)', 'transparent']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '33%', zIndex: 1 }}
              pointerEvents="none"
            />

            {/* ROI glow tint */}
            <View style={{
              position: 'absolute', inset: 0 as any, opacity: 0.2,
              backgroundColor: isPositive ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
            }} />

            {/* Swipe indicators */}
            <Animated.View style={[likeOpacity, {
              position: 'absolute', top: 40, left: 40, zIndex: 50,
              transform: [{ rotate: '-12deg' }],
            }]}>
              <View style={{ borderWidth: 6, borderColor: '#34D399', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
                <Text style={{ color: '#34D399', fontWeight: '900', fontSize: 36 }}>LIKE</Text>
              </View>
            </Animated.View>
            <Animated.View style={[nopeOpacity, {
              position: 'absolute', top: 40, right: 40, zIndex: 50,
              transform: [{ rotate: '12deg' }],
            }]}>
              <View style={{ borderWidth: 6, borderColor: '#F87171', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
                <Text style={{ color: '#F87171', fontWeight: '900', fontSize: 36 }}>PASS</Text>
              </View>
            </Animated.View>

            {/* ── Header ── */}
            <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8, zIndex: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  {/* Type badge — amber for AGGRESSIVE */}
                  <View style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10, paddingVertical: 2,
                    borderRadius: 20, borderWidth: 1,
                    backgroundColor: ts.bg, borderColor: ts.border, marginBottom: 8,
                  }}>
                    <Text style={{ color: ts.text, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>
                      {strategy.type}
                    </Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold', lineHeight: 26, letterSpacing: -0.5, fontFamily: serifFont }} numberOfLines={1}>
                    ${strategy.ticker || strategy.name}
                  </Text>
                  {strategy.ticker && (
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4, letterSpacing: 0.3 }} numberOfLines={1}>
                      {strategy.name}
                    </Text>
                  )}
                </View>

                {/* Creator PFP — amber gradient ring with glow */}
                <View style={{ alignItems: 'center' }}>
                  <View style={{
                    padding: 2, borderRadius: 24, zIndex: 10,
                    shadowColor: 'rgba(245,158,11,0.4)', shadowRadius: 10, shadowOpacity: 1,
                  }}>
                    <LinearGradient
                      colors={['rgba(252,211,77,0.3)', 'rgba(245,158,11,0.05)']}
                      style={{ padding: 2, borderRadius: 24 }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                        <Image
                          source={{ uri: strategy.creatorPfpUrl || `https://api.dicebear.com/7.x/identicon/png?seed=${strategy.creatorAddress}` }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </View>
                    </LinearGradient>
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'monospace', marginTop: 4 }}>
                    {strategy.creatorAddress.slice(0, 4)}
                  </Text>
                </View>
              </View>

              {/* Description */}
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 18, minHeight: 36 }} numberOfLines={2}>
                {strategy.description || 'No description provided.'}
              </Text>

              {/* ID + time */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 4 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'monospace' }}>
                    {strategy.id.slice(0, 4)}...{strategy.id.slice(-4)}
                  </Text>
                  <Copy size={10} color="rgba(255,255,255,0.4)" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} color="rgba(255,255,255,0.5)" />
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{timeAgo(strategy.createdAt)}</Text>
                </View>
              </View>
            </View>

            {/* ── Stats grid — bg-[#0a0a0a] border-white/10 matching web ── */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 8, gap: 12, zIndex: 10 }}>
              {/* 24h ROI */}
              <View style={{
                flex: 1, borderRadius: 16, borderWidth: 1,
                backgroundColor: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)',
                height: 100, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                <LinearGradient
                  colors={isPositive ? ['rgba(52,211,153,0.3)', 'transparent'] : ['rgba(248,113,113,0.3)', 'transparent']}
                  style={{ position: 'absolute', inset: 0 as any, opacity: 0.2 }}
                />
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>24h</Text>
                <FormatChange value={strategy.roi} size={24} textStyle={{ fontSize: 28, fontWeight: 'bold' }} />
              </View>

              {/* TVL */}
              <View style={{
                flex: 1, borderRadius: 16, borderWidth: 1,
                backgroundColor: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)',
                height: 100, paddingHorizontal: 16, justifyContent: 'center', overflow: 'hidden',
              }}>
                <Wallet size={48} color="rgba(255,255,255,0.1)" style={{ position: 'absolute', right: 8, top: 8 }} />
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>TVL</Text>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', letterSpacing: -0.5 }}>{formatTvl(strategy.tvl)}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>USDC</Text>
              </View>
            </View>

            {/* ── Composition: 2-column grid with Animated bars ── */}
            <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 4, paddingBottom: 4, overflow: 'hidden', zIndex: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' }} />
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2 }}>Assets</Text>
                </View>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{strategy.tokens.length}</Text>
                </View>
              </View>

              {/* 2-column grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {displayTokens.map((token, i) => {
                  const relativeFill = (token.weight / maxWeight) * 100;
                  return (
                    <View key={i} style={{
                      width: '48%',
                      height: 32, borderRadius: 10,
                      backgroundColor: '#0a0a0a',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
                      overflow: 'hidden',
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 6,
                    }}>
                      {/* Animated background bar — 0 → relativeFill% with delay */}
                      <AnimatedBar relativeFill={relativeFill} delay={i * 50} />
                      {/* Content */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1, zIndex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TokenIcon symbol={token.symbol} src={token.logoURI} address={token.address} size={16} />
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.3 }}>
                            {token.symbol}
                          </Text>
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'monospace' }}>
                          {token.weight}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {overflow > 0 && (
                <View style={{ alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '500', letterSpacing: 2, textTransform: 'uppercase' }}>
                    + {overflow} MORE ASSETS
                  </Text>
                </View>
              )}
            </View>

            {/* ── Footer — Solscan link ── */}
            <Pressable
              onPress={() => Linking.openURL(`https://solscan.io/token/${strategy.mintAddress || strategy.id}?cluster=devnet`)}
              style={{
                paddingVertical: 12, paddingHorizontal: 24,
                borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
                flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
                backgroundColor: 'rgba(0,0,0,0.4)',
              }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}>
                Mint: {(strategy.mintAddress || strategy.id).slice(0, 8)}...
              </Text>
              <ExternalLink size={10} color="rgba(255,255,255,0.3)" />
            </Pressable>

          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}
