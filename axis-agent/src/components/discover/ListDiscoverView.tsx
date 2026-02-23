import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '../../hooks/useWallet';
import { Loader2, Search, X as XIcon } from 'lucide-react';
import { api } from '../../services/api';
import { JupiterService } from '../../services/jupiter';
import { DexScreenerService } from '../../services/dexscreener';
import { SwipeCardBody, type StrategyCardData } from './SwipeCard';

export interface Strategy {
  id: string;
  name: string;
  type: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  tokens: { symbol: string; weight: number }[];
  description?: string;
}

interface DiscoveredToken {
  symbol: string;
  weight: number;
  address?: string;
  logoURI?: string | null;
  currentPrice?: number;
  change24h?: number;
}

interface DiscoveredStrategy {
  id: string;
  name: string;
  type: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  tokens: DiscoveredToken[];
  description?: string;
  ownerPubkey: string;
  tvl: number;
  createdAt: number;
  roi: number;
  creatorPfpUrl?: string | null;
  mintAddress?: string;
  vaultAddress?: string;
}

interface ListDiscoverViewProps {
  onToggleView?: () => void;
  onStrategySelect: (strategy: Strategy) => void;
  onOpenInSwipe?: (strategyId: string) => void;
}

const toCardData = (s: DiscoveredStrategy): StrategyCardData => ({
  id: s.id,
  name: s.name,
  ticker: undefined,
  type: s.type,
  tokens: s.tokens.map((t) => ({
    symbol: t.symbol,
    weight: t.weight,
    address: t.address,
    logoURI: t.logoURI ?? null,
    currentPrice: t.currentPrice ?? 0,
    change24h: t.change24h ?? 0,
  })),
  roi: s.roi,
  tvl: s.tvl,
  creatorAddress: s.ownerPubkey,
  creatorPfpUrl: s.creatorPfpUrl ?? null,
  description: s.description,
  createdAt: s.createdAt,
  mintAddress: s.mintAddress,
  vaultAddress: s.vaultAddress,
});

export const ListDiscoverView = ({ onStrategySelect, onOpenInSwipe }: ListDiscoverViewProps) => {
  const { publicKey } = useWallet();

  const [rawStrategies, setRawStrategies] = useState<any[]>([]);
  const [tokenDataMap, setTokenDataMap] = useState<
    Record<string, { price: number; change24h: number; logoURI?: string }>
  >({});
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [filter] = useState<'all' | 'trending' | 'new' | 'top'>('top');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [publicRes, myRes, tokensRes] = await Promise.all([
          api.discoverStrategies(50).catch(() => ({ strategies: [] })),
          publicKey
            ? api.getUserStrategies(publicKey.toBase58()).catch(() => ({ strategies: [] }))
            : Promise.resolve({ strategies: [] }),
          api.getTokens().catch(() => ({ tokens: [] })),
        ]);

        // バックエンドトークン情報を初期マップに
        const initialMap: Record<
          string,
          { price: number; change24h: number; logoURI?: string; symbol: string }
        > = {};
        (tokensRes.tokens || []).forEach((t: any) => {
          if (t.mint) {
            initialMap[t.mint] = {
              symbol: t.symbol?.toUpperCase() || 'UNKNOWN',
              price: t.price || 0,
              change24h: t.change24h || 0,
              logoURI: t.logoURI,
            };
          }
        });

        // ストラテジーをマージ・重複除去
        const myStrats = myRes.strategies || myRes || [];
        const combined = [...(Array.isArray(myStrats) ? myStrats : []), ...(publicRes.strategies || [])];
        const uniqueMap = new Map<string, any>();
        combined.forEach((item: any) => {
          const key = item.id || item.address;
          if (key && !uniqueMap.has(key)) uniqueMap.set(key, item);
        });
        const uniqueStrategies = Array.from(uniqueMap.values());
        setRawStrategies(uniqueStrategies);

        // 全 mint を収集
        const allMints = new Set<string>(Object.keys(initialMap));
        uniqueStrategies.forEach((s: any) => {
          let tokens = s.tokens || s.composition || [];
          if (typeof tokens === 'string') {
            try { tokens = JSON.parse(tokens); } catch { tokens = []; }
          }
          tokens.forEach((t: any) => {
            if (t.mint) {
              allMints.add(t.mint);
              if (!initialMap[t.mint]) {
                initialMap[t.mint] = {
                  symbol: t.symbol?.toUpperCase() || 'UNKNOWN',
                  price: 0,
                  change24h: 0,
                  logoURI: t.logoURI,
                };
              }
            }
          });
        });

        // Jupiter + DexScreener で価格を補完
        const mintArray = Array.from(allMints);
        if (mintArray.length > 0) {
          const [jupPrices, dexData] = await Promise.all([
            JupiterService.getPrices(mintArray).catch(() => ({})) as Promise<Record<string, number>>,
            DexScreenerService.getMarketData(mintArray).catch(() => ({})) as Promise<
              Record<string, { price: number; change24h: number }>
            >,
          ]);
          mintArray.forEach((mint) => {
            const cur = initialMap[mint];
            if (!cur) return;
            initialMap[mint] = {
              ...cur,
              price: jupPrices[mint] || dexData[mint]?.price || cur.price,
              change24h: dexData[mint]?.change24h || cur.change24h,
            };
          });
        }
        setTokenDataMap(initialMap);

        // クリエイタープロフィールを取得
        const creators = new Set<string>();
        uniqueStrategies.forEach((s: any) => {
          if (s.ownerPubkey) creators.add(s.ownerPubkey);
          if (s.creator) creators.add(s.creator);
        });
        if (creators.size > 0) {
          const userResults = await Promise.all(
            Array.from(creators).map((pubkey) =>
              api
                .getUser(pubkey)
                .then((res) => (res.success ? res.user : null))
                .catch(() => null)
            )
          );
          const newUserMap: Record<string, any> = {};
          userResults.forEach((user) => {
            if (user?.pubkey) newUserMap[user.pubkey] = user;
          });
          setUserMap(newUserMap);
        }
      } catch {
        setRawStrategies([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [publicKey]);

  // rawStrategies + tokenDataMap + userMap からエンリッチされたストラテジーを生成
  const strategies = useMemo<DiscoveredStrategy[]>(() => {
    return rawStrategies.map((s: any) => {
      let tokens = s.tokens || s.composition || [];
      if (typeof tokens === 'string') {
        try { tokens = JSON.parse(tokens); } catch { tokens = []; }
      }

      const enrichedTokens: DiscoveredToken[] = tokens.map((t: any) => {
        const td = t.mint ? tokenDataMap[t.mint] : null;
        return {
          symbol: t.symbol?.toUpperCase() || 'UNKNOWN',
          weight: Number(t.weight) || 0,
          address: t.mint || undefined,
          logoURI: t.logoURI || td?.logoURI || null,
          currentPrice: td?.price ?? 0,
          change24h: td?.change24h ?? 0,
        };
      });

      let weightedSum = 0;
      let totalWeight = 0;
      enrichedTokens.forEach((t) => {
        const w = t.weight || 0;
        weightedSum += (t.change24h || 0) * w;
        totalWeight += w;
      });

      const ownerPubkey = s.ownerPubkey || s.creator || 'Unknown';
      const userProfile = userMap[ownerPubkey];

      return {
        id: s.id || s.address || `temp-${Math.random()}`,
        name: s.name || 'Untitled Strategy',
        description: s.description || userProfile?.bio || '',
        type: (s.type || 'BALANCED') as DiscoveredStrategy['type'],
        tokens: enrichedTokens,
        ownerPubkey,
        tvl: Number(s.tvl || 0),
        createdAt: s.createdAt ? Number(s.createdAt) : Date.now() / 1000,
        roi: totalWeight > 0 ? weightedSum / totalWeight : 0,
        creatorPfpUrl: userProfile?.avatar_url ? api.getProxyUrl(userProfile.avatar_url) : null,
        mintAddress: s.mintAddress || undefined,
        vaultAddress: s.vaultAddress || undefined,
      };
    });
  }, [rawStrategies, tokenDataMap, userMap]);

  const filteredStrategies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return strategies
      .slice()
      .sort((a, b) => {
        if (publicKey) {
          const isMineA = a.ownerPubkey === publicKey.toBase58();
          const isMineB = b.ownerPubkey === publicKey.toBase58();
          if (isMineA && !isMineB) return -1;
          if (!isMineA && isMineB) return 1;
        }
        if (filter === 'new') return b.createdAt - a.createdAt;
        if (filter === 'top') return (b.tvl || 0) - (a.tvl || 0);
        return 0;
      })
      .filter((s) => {
        if (!q) return true;
        if (s.name.toLowerCase().includes(q)) return true;
        if (s.type.toLowerCase().includes(q)) return true;
        if (s.tokens.some((t) => t.symbol.toLowerCase().includes(q))) return true;
        return false;
      });
  }, [strategies, searchQuery, filter, publicKey]);

  return (
    <div className="min-h-screen bg-[#030303] text-white px-4 md:px-8 lg:px-12 py-6 pb-24">
      <div className="max-w-7xl mx-auto">
        <div className="pt-12 md:pt-20" />

        {/* Search Bar */}
        {!loading && strategies.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or token symbol..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#B8863F]/50 focus:bg-white/[0.07] transition-all"
              />
              <AnimatePresence>
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.1 }}
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                  >
                    <XIcon className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            {searchQuery && (
              <p className="mt-2 px-1 text-xs text-white/30">
                {filteredStrategies.length} result{filteredStrategies.length !== 1 ? 's' : ''} for{' '}
                <span className="text-[#B8863F]">"{searchQuery}"</span>
              </p>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-4" />
            <p className="text-white/50 text-sm">Loading strategies...</p>
          </div>
        ) : strategies.length === 0 ? (
          <EmptyState />
        ) : filteredStrategies.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/10">
              <Search className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/40 text-sm mb-3">No strategies matched</p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-[#B8863F] hover:text-[#D4A261] transition-colors"
            >
              Clear search
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            <AnimatePresence mode="popLayout">
              {filteredStrategies.map((strategy, i) => (
                <motion.div
                  key={strategy.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: searchQuery ? 0 : i * 0.04 }}
                  className={`cursor-pointer ${isDesktop ? 'h-[520px]' : 'h-[360px]'}`}
                  onClick={() =>
                    onOpenInSwipe ? onOpenInSwipe(strategy.id) : onStrategySelect(strategy)
                  }
                >
                  <SwipeCardBody strategy={toCardData(strategy)} compact={!isDesktop} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-20 text-center"
  >
    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
      <span className="text-4xl">🍕</span>
    </div>
    <h3 className="text-xl font-bold mb-2">No Strategies Yet</h3>
    <p className="text-white/50 text-sm max-w-xs mb-8 leading-relaxed">
      Be the first to create a strategy pizza! Your creation will appear here for the community to
      discover.
    </p>
    <div className="text-xs text-white/30 px-3 py-1 rounded-full border border-white/10">
      Create → Discover → Grow 🚀
    </div>
  </motion.div>
);
