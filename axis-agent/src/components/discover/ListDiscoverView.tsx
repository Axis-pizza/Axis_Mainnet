import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '../../hooks/useWallet';
import { Search, X as XIcon, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { JupiterService } from '../../services/jupiter';
import { DexScreenerService } from '../../services/dexscreener';
import { SwipeCardBody, TokenIcon, formatTvl, type StrategyCardData } from './SwipeCard';

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

// ─────────────────────────────────────────────────────────────────────────────
// Type badge pill
// ─────────────────────────────────────────────────────────────────────────────
const TypePill = ({ type }: { type: string }) => {
  const styles: Record<string, string> = {
    AGGRESSIVE: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    BALANCED: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    CONSERVATIVE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  };
  return (
    <span
      className={`inline-flex items-center text-[8px] font-bold uppercase px-1.5 py-px rounded-full border shrink-0 ${
        styles[type] || styles.BALANCED
      }`}
    >
      {type[0]}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mobile table row skeleton
// ─────────────────────────────────────────────────────────────────────────────
const TableRowSkeleton = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay, duration: 0.3 }}
    className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05]"
  >
    <div className="w-5 h-2.5 bg-white/[0.05] rounded shrink-0" />
    <div className="w-8 h-8 rounded-full bg-white/[0.07] shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-3.5 bg-white/[0.06] rounded w-2/5" />
        <div className="h-3 bg-white/[0.04] rounded w-10" />
      </div>
      <div className="h-3 bg-white/[0.04] rounded w-3/5" />
    </div>
    <div className="space-y-1 text-right shrink-0">
      <div className="h-3 bg-white/[0.06] rounded w-10" />
      <div className="h-2.5 bg-white/[0.03] rounded w-8 ml-auto" />
    </div>
    <div className="w-3.5 h-3.5 bg-white/[0.04] rounded shrink-0" />
  </motion.div>
);

const MobileTableLoader = () => (
  <div className="border-t border-white/[0.05]">
    {Array.from({ length: 10 }).map((_, i) => (
      <TableRowSkeleton key={i} delay={i * 0.04} />
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PC loading: grid skeleton
// ─────────────────────────────────────────────────────────────────────────────
const DesktopSkeletonCard = ({ delay }: { delay: number }) => (
  <motion.div
    className="h-[480px] rounded-[20px] overflow-hidden relative"
    initial={{ opacity: 0, y: 20, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    style={{
      background: 'linear-gradient(145deg, #111111 0%, #0a0a0a 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}
  >
    <motion.div
      className="absolute inset-0"
      initial={{ x: '-100%' }}
      animate={{ x: '100%' }}
      transition={{ delay: delay + 0.35, duration: 1.2, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)',
      }}
    />
    <div className="p-4 flex flex-col gap-3 h-full">
      <div className="flex justify-between items-start">
        <div className="h-5 w-16 rounded-full bg-white/[0.06]" />
        <div className="h-8 w-8 rounded-full bg-white/[0.06]" />
      </div>
      <div className="h-5 w-4/5 rounded bg-white/[0.05] mt-1" />
      <div className="h-4 w-2/3 rounded bg-white/[0.04]" />
      <div className="flex-1 rounded-xl bg-white/[0.03] mt-2" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="h-8 rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    </div>
  </motion.div>
);

const DesktopLoader = () => (
  <div className="grid grid-cols-3 gap-6">
    {Array.from({ length: 9 }).map((_, i) => (
      <DesktopSkeletonCard key={i} delay={i * 0.06} />
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Mobile table row
// ─────────────────────────────────────────────────────────────────────────────
const TableRow = memo(
  ({
    strategy,
    index,
    onSelect,
  }: {
    strategy: DiscoveredStrategy;
    index: number;
    onSelect: (s: DiscoveredStrategy) => void;
  }) => {
    const sortedTokens = useMemo(
      () => [...strategy.tokens].sort((a, b) => b.weight - a.weight),
      [strategy.tokens]
    );
    const visible = sortedTokens.slice(0, 5);
    const overflow = Math.max(0, sortedTokens.length - 5);

    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: Math.min(index * 0.025, 0.35), duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05] active:bg-white/[0.04] cursor-pointer transition-colors select-none"
        onClick={() => onSelect(strategy)}
      >
        {/* Rank */}
        <span className="w-5 text-center text-[11px] font-mono text-white/20 shrink-0">
          {index + 1}
        </span>

        {/* Creator Avatar */}
        <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden shrink-0 bg-black/50">
          <img
            src={
              strategy.creatorPfpUrl ||
              `https://api.dicebear.com/7.x/identicon/svg?seed=${strategy.ownerPubkey}`
            }
            alt="Creator"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Name + tokens */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            <span className="font-bold text-[13px] text-white truncate min-w-0">{strategy.name}</span>
            <TypePill type={strategy.type} />
          </div>
          <div className="flex items-center gap-1.5">
            {/* Token icon stack */}
            <div className="flex items-center shrink-0">
              {visible.map((t, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-full border border-[#050505] overflow-hidden bg-black/50"
                  style={{ marginLeft: i === 0 ? 0 : -4, zIndex: 10 - i, position: 'relative' }}
                >
                  <TokenIcon
                    symbol={t.symbol}
                    src={t.logoURI}
                    address={t.address}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
            <span className="text-[10px] text-white/30 truncate">
              {sortedTokens
                .slice(0, 4)
                .map((t) => t.symbol)
                .join(' · ')}
              {overflow > 0 ? ` +${overflow}` : ''}
            </span>
          </div>
        </div>

        {/* TVL */}
        <div className="text-right shrink-0">
          <div className="text-[12px] font-bold font-mono text-white/80">{formatTvl(strategy.tvl)}</div>
          <div className="text-[8px] text-white/25 uppercase tracking-wide">USDC</div>
        </div>

        {/* Chevron */}
        <ChevronRight className="w-3.5 h-3.5 text-white/15 shrink-0" />
      </motion.div>
    );
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export const ListDiscoverView = ({ onStrategySelect, onOpenInSwipe }: ListDiscoverViewProps) => {
  const { publicKey } = useWallet();

  const [rawStrategies, setRawStrategies] = useState<any[]>([]);
  const [tokenDataMap, setTokenDataMap] = useState<
    Record<string, { price: number; change24h: number; logoURI?: string }>
  >({});
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Responsive layout: PC uses grid, mobile uses table rows
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);

      try {
        // Phase 1: fast — fetch strategies + backend token data, show UI
        const [publicRes, myRes, tokensRes] = await Promise.all([
          api.discoverStrategies(100).catch(() => ({ strategies: [] })),
          publicKey
            ? api.getUserStrategies(publicKey.toBase58()).catch(() => ({ strategies: [] }))
            : Promise.resolve({ strategies: [] }),
          api.getTokens().catch(() => ({ tokens: [] })),
        ]);

        if (cancelled) return;

        const tokenMap: Record<
          string,
          { price: number; change24h: number; logoURI?: string; symbol: string }
        > = {};
        (tokensRes.tokens || []).forEach((t: any) => {
          if (t.mint) {
            tokenMap[t.mint] = {
              symbol: t.symbol?.toUpperCase() || 'UNKNOWN',
              price: t.price || 0,
              change24h: t.change24h || 0,
              logoURI: t.logoURI,
            };
          }
        });

        const myStrats = myRes.strategies || myRes || [];
        // Public strategies first, own strategies fill in any gaps
        const combined = [
          ...(publicRes.strategies || []),
          ...(Array.isArray(myStrats) ? myStrats : []),
        ];
        const uniqueMap = new Map<string, any>();
        combined.forEach((item: any) => {
          const key = item.id || item.address;
          if (key && !uniqueMap.has(key)) uniqueMap.set(key, item);
        });
        const uniqueStrategies = Array.from(uniqueMap.values());

        uniqueStrategies.forEach((s: any) => {
          let tokens = s.tokens || s.composition || [];
          if (typeof tokens === 'string') {
            try { tokens = JSON.parse(tokens); } catch { tokens = []; }
          }
          tokens.forEach((t: any) => {
            if (t.mint && !tokenMap[t.mint]) {
              tokenMap[t.mint] = {
                symbol: t.symbol?.toUpperCase() || 'UNKNOWN',
                price: 0,
                change24h: 0,
                logoURI: t.logoURI,
              };
            }
          });
        });

        setRawStrategies(uniqueStrategies);
        setTokenDataMap({ ...tokenMap });
        setLoading(false); // ← UI unblocked

        // Phase 2 (background): live prices for mints with no price yet
        const missingMints = Object.entries(tokenMap)
          .filter(([, v]) => v.price === 0)
          .map(([mint]) => mint)
          .slice(0, 30);

        if (!cancelled && missingMints.length > 0) {
          const [jupPrices, dexData] = await Promise.all([
            JupiterService.getPrices(missingMints).catch(() => ({})) as Promise<Record<string, number>>,
            DexScreenerService.getMarketData(missingMints).catch(() => ({})) as Promise<
              Record<string, { price: number; change24h: number }>
            >,
          ]);
          if (!cancelled) {
            setTokenDataMap((prev) => {
              const next = { ...prev };
              missingMints.forEach((mint) => {
                if (!next[mint]) return;
                next[mint] = {
                  ...next[mint],
                  price: jupPrices[mint] || dexData[mint]?.price || next[mint].price,
                  change24h: dexData[mint]?.change24h || next[mint].change24h,
                };
              });
              return next;
            });
          }
        }

        // Phase 3 (background): creator profiles for first 20 creators
        const creatorSet = new Set<string>();
        uniqueStrategies.slice(0, 60).forEach((s: any) => {
          const p = s.ownerPubkey || s.creator;
          if (p) creatorSet.add(p);
        });
        const topCreators = Array.from(creatorSet).slice(0, 20);

        if (!cancelled && topCreators.length > 0) {
          const results = await Promise.all(
            topCreators.map((pubkey) =>
              api.getUser(pubkey)
                .then((res) => (res.success ? res.user : null))
                .catch(() => null)
            )
          );
          if (!cancelled) {
            const map: Record<string, any> = {};
            results.forEach((u) => { if (u?.pubkey) map[u.pubkey] = u; });
            setUserMap(map);
          }
        }
      } catch {
        if (!cancelled) {
          setRawStrategies([]);
          setLoading(false);
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [publicKey]);

  // Enrich strategies with token prices and creator profiles
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
        roi: 0,
        creatorPfpUrl: userProfile?.avatar_url
          ? api.getProxyUrl(userProfile.avatar_url)
          : null,
        mintAddress: s.mintAddress || undefined,
        vaultAddress: s.vaultAddress || undefined,
      };
    });
  }, [rawStrategies, tokenDataMap, userMap]);

  // Sort by TVL desc then createdAt desc — stable, no self-first bias
  const filteredStrategies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = [...strategies];
    if (q) {
      result = result.filter((s) => {
        if (s.name.toLowerCase().includes(q)) return true;
        if (s.type.toLowerCase().includes(q)) return true;
        if (s.tokens.some((t) => t.symbol.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    result.sort((a, b) => {
      const tvlDiff = (b.tvl || 0) - (a.tvl || 0);
      if (tvlDiff !== 0) return tvlDiff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return result;
  }, [strategies, searchQuery]);

  const handleSelect = useCallback(
    (strategy: DiscoveredStrategy) => {
      if (onOpenInSwipe) onOpenInSwipe(strategy.id);
      else onStrategySelect(strategy as any);
    },
    [onOpenInSwipe, onStrategySelect]
  );

  return (
    <div className="min-h-screen bg-[#030303] text-white pb-24">
      <div className="max-w-7xl mx-auto">
        <div className="pt-12 md:pt-20" />

        {/* Search Bar */}
        {!loading && strategies.length > 0 && (
          <div className="mb-4 px-4 md:px-8 lg:px-12">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or token..."
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
                {filteredStrategies.length} result
                {filteredStrategies.length !== 1 ? 's' : ''} for{' '}
                <span className="text-[#B8863F]">"{searchQuery}"</span>
              </p>
            )}
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {loading ? (
          isDesktop ? (
            <div className="px-8 lg:px-12"><DesktopLoader /></div>
          ) : (
            <MobileTableLoader />
          )
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
        ) : isDesktop ? (
          /* ── PC: vertical grid ──────────────────────────────────────────── */
          <div className="px-8 lg:px-12">
            <div className="grid grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {filteredStrategies.map((strategy, i) => (
                  <motion.div
                    key={strategy.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: searchQuery ? 0 : Math.min(i * 0.04, 0.4) }}
                    className="h-[480px] cursor-pointer"
                    onClick={() => handleSelect(strategy)}
                  >
                    <SwipeCardBody strategy={toCardData(strategy)} compact={false} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* ── Mobile: DEX Screener-style table ───────────────────────────── */
          <div>
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-2 border-y border-white/[0.07] bg-[#030303]/95 backdrop-blur-sm sticky top-0 z-10">
              <span className="w-5 shrink-0" />
              <span className="w-8 shrink-0 text-[9px] font-bold uppercase tracking-widest text-white/20">
                Creator
              </span>
              <span className="flex-1 text-[9px] font-bold uppercase tracking-widest text-white/20">
                Strategy
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/20 pr-6">
                TVL
              </span>
            </div>

            <AnimatePresence mode="popLayout">
              {filteredStrategies.map((strategy, i) => (
                <TableRow key={strategy.id} strategy={strategy} index={i} onSelect={handleSelect} />
              ))}
            </AnimatePresence>

            <div className="py-6 text-center text-xs text-white/15">
              {filteredStrategies.length} strategies
            </div>
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
    className="flex flex-col items-center justify-center py-20 text-center px-4"
  >
    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
      <span className="text-4xl">🍕</span>
    </div>
    <h3 className="text-xl font-bold mb-2">No Strategies Yet</h3>
    <p className="text-white/50 text-sm max-w-xs mb-8 leading-relaxed">
      Be the first to create a strategy pizza! Your creation will appear here
      for the community to discover.
    </p>
    <div className="text-xs text-white/30 px-3 py-1 rounded-full border border-white/10">
      Create → Discover → Grow 🚀
    </div>
  </motion.div>
);
