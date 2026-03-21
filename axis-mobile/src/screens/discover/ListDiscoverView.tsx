/**
 * ListDiscoverView — faithful React Native port of axis-agent ListDiscoverView.tsx
 * Features:
 *  - 3 horizontal auto-scroll rows (ScrollRow) at different speeds
 *  - Shimmer skeleton loading cards
 *  - Token price enrichment (Jupiter + DexScreener, two-phase)
 *  - Creator profile enrichment (top 20)
 *  - Search bar with clear button
 *  - SwipeCardBody mini compact card
 *  - Empty state with 🍕
 */
import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Image, Dimensions,
  Animated as RNAnimated, Easing,
} from 'react-native';
import { Search, TrendingUp, TrendingDown, Clock, Copy, Wallet } from 'lucide-react-native';
import { api } from '../../services/api';
import { JupiterService } from '../../services/jupiter';
import { DexScreenerService } from '../../services/dexscreener';
import { colors, gold } from '../../config/theme';

const { width: W } = Dimensions.get('window');

interface DiscoveredToken {
  symbol: string; weight: number; address?: string;
  logoURI?: string | null; currentPrice?: number; change24h?: number;
}
interface DiscoveredStrategy {
  id: string; name: string; ticker?: string;
  type: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  tokens: DiscoveredToken[]; description?: string;
  ownerPubkey: string; tvl: number; createdAt: number;
  roi: number; creatorPfpUrl?: string | null;
  mintAddress?: string; vaultAddress?: string;
}
interface Props {
  onStrategySelect: (strategy: any) => void;
  onOpenInSwipe?: (strategyId: string) => void;
}

const timeAgo = (ts: number) => {
  if (!ts) return 'Recently';
  const s = Math.floor(Date.now() / 1000) - ts;
  const d = Math.floor(s / 86400); if (d > 0) return `${d}d ago`;
  const h = Math.floor(s / 3600); if (h > 0) return `${h}h ago`;
  return 'Just now';
};
const formatTvl = (v: number) => {
  if (v < 0.01) return '< 0.01';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const typeColors = {
  AGGRESSIVE: { text: '#fde68a', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
  BALANCED: { text: '#bfdbfe', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' },
  CONSERVATIVE: { text: '#a7f3d0', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
};

const TokenIcon = memo(({ symbol, src, address, size = 20 }: { symbol: string; src?: string | null; address?: string; size?: number }) => {
  const [uri, setUri] = useState(
    src?.startsWith('http') ? src :
    address ? `https://static.jup.ag/tokens/${address}.png` :
    `https://ui-avatars.com/api/?name=${symbol}&background=random&color=fff&size=64&bold=true`
  );
  const err = useRef(0);
  const onErr = () => {
    err.current++;
    if (err.current === 1 && address) setUri(`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${address}/logo.png`);
    else setUri(`https://ui-avatars.com/api/?name=${symbol}&background=random&color=fff&size=64&bold=true`);
  };
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#221509' }} onError={onErr} />;
});

const SwipeCardBody = memo(({ strategy }: { strategy: DiscoveredStrategy }) => {
  const maxLogos = 6;
  const sorted = [...strategy.tokens].sort((a, b) => b.weight - a.weight);
  const overflow = Math.max(0, sorted.length - maxLogos);
  const tc = typeColors[strategy.type] || typeColors.BALANCED;
  const isPos = strategy.roi >= 0;
  const maxW = Math.max(...sorted.map(t => t.weight), 1);

  return (
    <View style={{ flex: 1, backgroundColor: '#0e0e0e', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
      <View style={{ padding: 12, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20, borderWidth: 1, backgroundColor: tc.bg, borderColor: tc.border, marginBottom: 4 }}>
              <Text style={{ color: tc.text, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' }}>{strategy.type}</Text>
            </View>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
              ${strategy.ticker || strategy.name}
            </Text>
          </View>
          <Image
            source={{ uri: strategy.creatorPfpUrl || `https://api.dicebear.com/7.x/identicon/png?seed=${strategy.ownerPubkey}` }}
            style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(184,134,63,0.2)' }}
          />
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, lineHeight: 14 }} numberOfLines={1}>
          {strategy.description || 'No description provided.'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8, fontFamily: 'monospace' }}>{strategy.id.slice(0, 4)}...{strategy.id.slice(-4)}</Text>
            <Copy size={8} color="rgba(255,255,255,0.3)" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Clock size={8} color="rgba(255,255,255,0.4)" />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8 }}>{timeAgo(strategy.createdAt)}</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1, height: 68, borderRadius: 12, borderWidth: 1, backgroundColor: isPos ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', borderColor: isPos ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>24h</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            {isPos ? <TrendingUp size={14} color="#34D399" /> : <TrendingDown size={14} color="#F87171" />}
            <Text style={{ color: isPos ? '#34D399' : '#F87171', fontWeight: '800', fontSize: 16 }}>{Math.abs(strategy.roi).toFixed(2)}%</Text>
          </View>
        </View>
        <View style={{ flex: 1, height: 68, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(184,134,63,0.15)', backgroundColor: 'rgba(184,134,63,0.05)', justifyContent: 'center', paddingHorizontal: 10 }}>
          <View style={{ position: 'absolute', top: 6, right: 8 }}>
            <Wallet size={20} color="rgba(255,255,255,0.07)" />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>TVL</Text>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{formatTvl(strategy.tvl)}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8 }}>USDC</Text>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Assets</Text>
          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>{strategy.tokens.length}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {sorted.slice(0, maxLogos).map((token, i) => {
            const fill = (token.weight / maxW) * 100;
            return (
              <View key={i} style={{ width: '47%', height: 24, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: '#0a0a0a', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fill}%`, backgroundColor: 'rgba(255,255,255,0.07)' }} />
                <TokenIcon symbol={token.symbol} src={token.logoURI} address={token.address} size={14} />
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 8, fontWeight: '700', marginLeft: 4, flex: 1 }} numberOfLines={1}>{token.symbol}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>{token.weight}%</Text>
              </View>
            );
          })}
        </View>
        {overflow > 0 && (
          <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8, textAlign: 'center', marginTop: 4 }}>+{overflow} MORE</Text>
        )}
      </View>
    </View>
  );
});

const SkeletonCard = memo(({ delay, cardWidth }: { delay: number; cardWidth: number }) => {
  const shimmer = useRef(new RNAnimated.Value(-cardWidth)).current;
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(28)).current;
  const scale = useRef(new RNAnimated.Value(0.93)).current;
  useEffect(() => {
    // Entrance animation — mirrors web: opacity 0→1, y 28→0, scale 0.93→1 ease [0.22,1,0.36,1]
    RNAnimated.sequence([
      RNAnimated.delay(delay * 1000),
      RNAnimated.parallel([
        RNAnimated.timing(opacity, { toValue: 1, duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
        RNAnimated.timing(translateY, { toValue: 0, duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
        RNAnimated.timing(scale, { toValue: 1, duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
      ]),
    ]).start();
    // Shimmer loop — starts after entrance
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.delay(delay * 1000 + 350),
        RNAnimated.timing(shimmer, { toValue: cardWidth * 2, duration: 1100, useNativeDriver: true }),
        RNAnimated.timing(shimmer, { toValue: -cardWidth, duration: 0, useNativeDriver: true }),
        RNAnimated.delay(1400),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [cardWidth]);
  return (
    <RNAnimated.View style={{ width: cardWidth, height: 300, borderRadius: 20, overflow: 'hidden', backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', opacity, transform: [{ translateY }, { scale }] }}>
      <RNAnimated.View style={{ position: 'absolute', top: 0, bottom: 0, width: cardWidth * 0.5, backgroundColor: 'rgba(255,255,255,0.04)', transform: [{ translateX: shimmer }] }} />
      <View style={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ width: '28%', height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        </View>
        <View style={{ width: '65%', height: 18, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 6 }} />
        <View style={{ width: '45%', height: 12, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)' }} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 12 }}>
          <View style={{ flex: 1, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          <View style={{ flex: 1, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {[0, 1, 2, 3].map(k => (
            <View key={k} style={{ width: '47%', height: 24, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          ))}
        </View>
      </View>
    </RNAnimated.View>
  );
});

const ScrollRow = memo(({ strategies, pxPerSec, cardWidth, onSelect }: {
  strategies: DiscoveredStrategy[]; pxPerSec: number; cardWidth: number; onSelect: (s: DiscoveredStrategy) => void;
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const posRef = useRef(0);
  const pausedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const GAP = 8;

  const items = useMemo(() => {
    if (!strategies.length) return [];
    const arr = [...strategies];
    while (arr.length < 6) arr.push(...strategies);
    return arr;
  }, [strategies]);
  const doubled = useMemo(() => [...items, ...items], [items]);
  const halfW = items.length * (cardWidth + GAP);

  useEffect(() => {
    if (!items.length) return;
    posRef.current = 0;
    const TICK_MS = 16;
    const pxPerTick = (pxPerSec * TICK_MS) / 1000;
    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
      posRef.current += pxPerTick;
      if (posRef.current >= halfW) posRef.current -= halfW;
      scrollRef.current?.scrollTo({ x: posRef.current, animated: false });
    }, TICK_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [items.length, pxPerSec, halfW, cardWidth]);

  const pause = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    pausedRef.current = true;
  }, []);
  const resume = useCallback((delayMs = 0) => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    if (delayMs === 0) pausedRef.current = false;
    else resumeTimer.current = setTimeout(() => { pausedRef.current = false; }, delayMs);
  }, []);

  if (!items.length) return null;
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onScrollBeginDrag={pause}
      onScrollEndDrag={() => resume(2000)}
      onMomentumScrollEnd={() => resume(500)}
      contentContainerStyle={{ gap: GAP, paddingBottom: 8 }}
    >
      {doubled.map((strategy, i) => (
        <Pressable key={`${strategy.id}-${i}`} onPress={() => { pause(); onSelect(strategy); }} style={{ width: cardWidth, height: 300 }}>
          <SwipeCardBody strategy={strategy} />
        </Pressable>
      ))}
    </ScrollView>
  );
});

// Animated loading dot — mirrors web: opacity [0.2,1,0.2] delay i*0.25s duration 0.9s repeat
const AnimatedDot = memo(({ index }: { index: number }) => {
  const opacity = useRef(new RNAnimated.Value(0.2)).current;
  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.delay(index * 250),
        RNAnimated.timing(opacity, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 0.2, duration: 450, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <RNAnimated.Text style={{ color: '#D97706', fontSize: 16, opacity }}>·</RNAnimated.Text>;
});

const MobileLoader = ({ cardWidth }: { cardWidth: number }) => (
  <View style={{ gap: 20 }}>
    {[0, 1, 2].map(row => (
      <ScrollView key={row} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[0, 1, 2, 3].map(col => (
          <SkeletonCard key={col} delay={(row * 3 + col) * 0.08} cardWidth={cardWidth} />
        ))}
      </ScrollView>
    ))}
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 4 }}>
      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading strategies</Text>
      {[0, 1, 2].map(i => <AnimatedDot key={i} index={i} />)}
    </View>
  </View>
);

const EmptyState = () => (
  <View style={{ alignItems: 'center', paddingVertical: 80 }}>
    <Text style={{ fontSize: 48, marginBottom: 16 }}>🍕</Text>
    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>No Strategies Yet</Text>
    <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20, marginBottom: 24 }}>
      Be the first to create a strategy pizza! Your creation will appear here.
    </Text>
    <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Create → Discover → Grow 🚀</Text>
    </View>
  </View>
);

export function ListDiscoverView({ onStrategySelect, onOpenInSwipe }: Props) {
  const [rawStrategies, setRawStrategies] = useState<any[]>([]);
  const [tokenDataMap, setTokenDataMap] = useState<Record<string, { price: number; change24h: number; logoURI?: string; symbol: string }>>({});
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const cardWidth = Math.floor((W - 16) / 3);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        const [publicRes, tokensRes] = await Promise.all([
          api.discoverStrategies(100).catch(() => ({ strategies: [] })),
          api.getTokens().catch(() => ({ tokens: [] })),
        ]);
        if (cancelled) return;
        const tokenMap: Record<string, { price: number; change24h: number; logoURI?: string; symbol: string }> = {};
        (tokensRes.tokens || []).forEach((t: any) => {
          if (t.mint) tokenMap[t.mint] = { symbol: t.symbol?.toUpperCase() || 'UNKNOWN', price: t.price || 0, change24h: t.change24h || 0, logoURI: t.logoURI };
        });
        const list = publicRes.strategies || publicRes || [];
        list.forEach((s: any) => {
          let tokens = s.tokens || [];
          if (typeof tokens === 'string') { try { tokens = JSON.parse(tokens); } catch {} }
          tokens.forEach((t: any) => {
            if (t.mint && !tokenMap[t.mint]) tokenMap[t.mint] = { symbol: t.symbol?.toUpperCase() || 'UNKNOWN', price: 0, change24h: 0, logoURI: t.logoURI };
          });
        });
        setRawStrategies(list);
        setTokenDataMap({ ...tokenMap });
        setLoading(false);

        const missingMints = Object.entries(tokenMap).filter(([, v]) => v.price === 0).map(([m]) => m).slice(0, 30);
        if (!cancelled && missingMints.length > 0) {
          const [jup, dex] = await Promise.all([
            JupiterService.getPrices(missingMints).catch(() => ({}) as any),
            DexScreenerService.getMarketData(missingMints).catch(() => ({}) as any),
          ]);
          if (!cancelled) {
            setTokenDataMap(prev => {
              const next = { ...prev };
              missingMints.forEach(m => {
                if (!next[m]) return;
                next[m] = { ...next[m], price: jup[m] || dex[m]?.price || 0, change24h: dex[m]?.change24h || 0 };
              });
              return next;
            });
          }
        }

        const creators = new Set<string>();
        list.slice(0, 60).forEach((s: any) => { const p = s.ownerPubkey || s.creator; if (p) creators.add(p); });
        const top20 = Array.from(creators).slice(0, 20);
        if (!cancelled && top20.length > 0) {
          const results = await Promise.all(top20.map((pk: string) => api.getUser(pk).then((r: any) => r.success ? r.user : null).catch(() => null)));
          if (!cancelled) {
            const m: Record<string, any> = {};
            results.forEach((u: any) => { if (u?.pubkey) m[u.pubkey] = u; });
            setUserMap(m);
          }
        }
      } catch { if (!cancelled) setLoading(false); }
    };
    loadData();
    return () => { cancelled = true; };
  }, []);

  const strategies = useMemo<DiscoveredStrategy[]>(() => rawStrategies.map(s => {
    let tokens = s.tokens || [];
    if (typeof tokens === 'string') { try { tokens = JSON.parse(tokens); } catch {} }
    const enriched: DiscoveredToken[] = tokens.map((t: any) => {
      const d = t.mint ? tokenDataMap[t.mint] : null;
      return { symbol: t.symbol?.toUpperCase() || 'UNKNOWN', weight: Number(t.weight) || 0, address: t.mint, logoURI: t.logoURI || d?.logoURI || null, currentPrice: d?.price ?? 0, change24h: d?.change24h ?? 0 };
    });
    let wSum = 0, tSum = 0;
    enriched.forEach(t => { const w = t.weight || 0; wSum += (t.change24h || 0) * w; tSum += w; });
    const ownerPubkey = s.ownerPubkey || s.creator || 'Unknown';
    const profile = userMap[ownerPubkey];
    return {
      id: s.id || s.address || `tmp-${Math.random()}`,
      name: s.name || 'Untitled', ticker: s.ticker,
      description: s.description || profile?.bio || '',
      type: (s.type || 'BALANCED') as DiscoveredStrategy['type'],
      tokens: enriched, ownerPubkey,
      tvl: Number(s.tvl || 0),
      createdAt: s.createdAt ? Number(s.createdAt) : Date.now() / 1000,
      roi: tSum > 0 ? wSum / tSum : 0,
      creatorPfpUrl: profile?.avatar_url ? api.getProxyUrl(profile.avatar_url) : null,
      mintAddress: s.mintAddress, vaultAddress: s.vaultAddress,
    };
  }), [rawStrategies, tokenDataMap, userMap]);

  const shuffledIds = useMemo(() => shuffleArray(rawStrategies.map(s => s.id || s.address || '')), [rawStrategies]);
  const shuffled = useMemo(() => {
    const byId = new Map(strategies.map(s => [s.id, s]));
    return shuffledIds.map(id => byId.get(id)).filter(Boolean) as DiscoveredStrategy[];
  }, [strategies, shuffledIds]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shuffled;
    return shuffled.filter(s =>
      s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) ||
      s.tokens.some(t => t.symbol.toLowerCase().includes(q))
    );
  }, [shuffled, searchQuery]);

  const [row1, row2, row3] = useMemo(() => {
    const r0: DiscoveredStrategy[] = [], r1: DiscoveredStrategy[] = [], r2: DiscoveredStrategy[] = [];
    filtered.forEach((s, i) => { if (i % 3 === 0) r0.push(s); else if (i % 3 === 1) r1.push(s); else r2.push(s); });
    return [r0, r1, r2];
  }, [filtered]);

  const handleSelect = useCallback((strategy: DiscoveredStrategy) => {
    if (onOpenInSwipe) onOpenInSwipe(strategy.id);
    else onStrategySelect(strategy as any);
  }, [onOpenInSwipe, onStrategySelect]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingTop: 16, paddingHorizontal: 16 }}>
        {!loading && strategies.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 }}>
              <Search size={16} color="rgba(255,255,255,0.25)" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name or token symbol..."
                placeholderTextColor="rgba(255,255,255,0.2)"
                style={{ flex: 1, color: '#fff', fontSize: 14, marginLeft: 8 }}
              />
              {!!searchQuery && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>✕</Text>
                </Pressable>
              )}
            </View>
            {!!searchQuery && (
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 8, paddingLeft: 4 }}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for <Text style={{ color: gold[400] }}>"{searchQuery}"</Text>
              </Text>
            )}
          </View>
        )}
        {loading ? (
          <MobileLoader cardWidth={cardWidth} />
        ) : strategies.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Search size={32} color="rgba(255,255,255,0.1)" />
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, marginTop: 12, marginBottom: 12 }}>No strategies matched</Text>
            <Pressable onPress={() => setSearchQuery('')}>
              <Text style={{ color: gold[400], fontSize: 13 }}>Clear search</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            <ScrollRow strategies={row1} pxPerSec={35} cardWidth={cardWidth} onSelect={handleSelect} />
            <ScrollRow strategies={row2} pxPerSec={25} cardWidth={cardWidth} onSelect={handleSelect} />
            <ScrollRow strategies={row3} pxPerSec={45} cardWidth={cardWidth} onSelect={handleSelect} />
            <Text style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11, textAlign: 'right', paddingRight: 4 }}>
              {filtered.length} strategies
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
