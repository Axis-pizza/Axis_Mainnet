import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '../../hooks/useWallet';
import {
  Search,
  X as XIcon,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  BarChart2,
  Layers,
} from 'lucide-react';
import { api } from '../../services/api';
import { JupiterService } from '../../services/jupiter';
import { DexScreenerService } from '../../services/dexscreener';
import { TokenIcon, formatTvl, timeAgo } from './SwipeCard';

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
}

interface DiscoveredStrategy {
  id: string;
  name: string;
  ticker?: string;
  type: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  tokens: DiscoveredToken[];
  description?: string;
  ownerPubkey: string;
  tvl: number;
  createdAt: number;
  creatorPfpUrl?: string | null;
  mintAddress?: string;
  vaultAddress?: string;
}

interface ListDiscoverViewProps {
  onToggleView?: () => void;
  onStrategySelect: (strategy: Strategy) => void;
  onOpenInSwipe?: (strategyId: string) => void;
}

type SortKey = 'tvl' | 'createdAt' | 'assets' | 'name';
type SortDir = 'asc' | 'desc';

const TYPE_COLORS: Record<string, { dot: string; label: string }> = {
  AGGRESSIVE: { dot: 'bg-amber-400', label: 'text-amber-400' },
  BALANCED:   { dot: 'bg-blue-400',  label: 'text-blue-400'  },
  CONSERVATIVE: { dot: 'bg-emerald-400', label: 'text-emerald-400' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sort indicator icon
// ─────────────────────────────────────────────────────────────────────────────
const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
  if (!active) return <ChevronsUpDown className="w-3 h-3 text-white/20 ml-0.5" />;
  return dir === 'desc'
    ? <ChevronDown className="w-3 h-3 text-amber-400 ml-0.5" />
    : <ChevronUp className="w-3 h-3 text-amber-400 ml-0.5" />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton row
// ─────────────────────────────────────────────────────────────────────────────
const SkeletonRow = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay, duration: 0.3 }}
    className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]"
  >
    <div className="w-6 h-2 bg-white/[0.05] rounded shrink-0" />
    <div className="w-9 h-9 rounded-full bg-white/[0.07] shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 bg-white/[0.06] rounded w-2/5" />
      <div className="h-2.5 bg-white/[0.04] rounded w-3/5" />
    </div>
    <div className="w-16 h-3 bg-white/[0.05] rounded shrink-0" />
    <div className="w-10 h-2.5 bg-white/[0.03] rounded shrink-0" />
    <div className="w-8 h-2.5 bg-white/[0.03] rounded shrink-0" />
  </motion.div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Table row
// ─────────────────────────────────────────────────────────────────────────────
const TableRow = memo(({
  strategy,
  rank,
  onSelect,
}: {
  strategy: DiscoveredStrategy;
  rank: number;
  onSelect: (s: DiscoveredStrategy) => void;
}) => {
  const sorted = useMemo(
    () => [...strategy.tokens].sort((a, b) => b.weight - a.weight),
    [strategy.tokens]
  );
  const visible = sorted.slice(0, 5);
  const overflow = Math.max(0, sorted.length - 5);
  const tc = TYPE_COLORS[strategy.type] || TYPE_COLORS.BALANCED;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(rank * 0.02, 0.3), duration: 0.2 }}
      className="group flex items-center gap-0 border-b border-white/[0.04] hover:bg-white/[0.03] active:bg-white/[0.05] cursor-pointer transition-colors select-none"
      onClick={() => onSelect(strategy)}
    >
      {/* Rank */}
      <div className="w-10 px-3 py-3.5 text-[11px] font-mono text-white/20 shrink-0 text-right">
        {rank}
      </div>

      {/* Creator avatar */}
      <div className="w-10 px-1 py-3.5 shrink-0">
        <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden bg-black/40">
          <img
            src={
              strategy.creatorPfpUrl ||
              `https://api.dicebear.com/7.x/identicon/svg?seed=${strategy.ownerPubkey}`
            }
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Name + token stack */}
      <div className="flex-1 min-w-0 px-2 py-3.5">
        <div className="flex items-center gap-2 mb-1">
          {/* Type dot */}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tc.dot}`} />
          <span className="text-[13px] text-white/90 truncate">{strategy.name}</span>
          {strategy.ticker && (
            <span className={`text-[10px] shrink-0 ${tc.label}`}>${strategy.ticker}</span>
          )}
        </div>
        {/* Token icon stack + symbols */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center">
            {visible.map((t, i) => (
              <div
                key={i}
                className="w-[18px] h-[18px] rounded-full border border-[#030303] overflow-hidden bg-black/50"
                style={{ marginLeft: i === 0 ? 0 : -5, zIndex: 10 - i, position: 'relative' }}
              >
                <TokenIcon symbol={t.symbol} src={t.logoURI} address={t.address} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <span className="text-[10px] text-white/30 truncate">
            {sorted.slice(0, 4).map((t) => t.symbol).join(' · ')}
            {overflow > 0 ? ` +${overflow}` : ''}
          </span>
        </div>
      </div>

      {/* TVL */}
      <div className="w-24 px-3 py-3.5 text-right shrink-0">
        <div className="text-[13px] font-mono text-white/80">{formatTvl(strategy.tvl)}</div>
        <div className="text-[9px] text-white/20 uppercase tracking-wide">USDC</div>
      </div>

      {/* Assets */}
      <div className="w-16 px-3 py-3.5 text-right shrink-0 hidden sm:block">
        <div className="text-[13px] font-mono text-white/60">{strategy.tokens.length}</div>
        <div className="text-[9px] text-white/20 uppercase tracking-wide">assets</div>
      </div>

      {/* Age */}
      <div className="w-20 px-3 py-3.5 text-right shrink-0 hidden sm:block">
        <div className="text-[11px] text-white/40 font-mono">{timeAgo(strategy.createdAt)}</div>
      </div>
    </motion.div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Sort header cell
// ─────────────────────────────────────────────────────────────────────────────
const SortHeader = ({
  label,
  sortKey,
  icon,
  current,
  dir,
  align = 'right',
  className = '',
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  icon?: React.ReactNode;
  current: SortKey;
  dir: SortDir;
  align?: 'left' | 'right';
  className?: string;
  onSort: (k: SortKey) => void;
}) => {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-0.5 text-[9px] uppercase tracking-widest transition-colors ${
        active ? 'text-amber-400' : 'text-white/25 hover:text-white/50'
      } ${align === 'right' ? 'flex-row-reverse' : ''} ${className}`}
    >
      {icon && <span className="mr-0.5">{icon}</span>}
      {label}
      <SortIcon active={active} dir={dir} />
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Enrich a raw strategy object
// ─────────────────────────────────────────────────────────────────────────────
function enrichStrategy(
  s: any,
  tokenDataMap: Record<string, { logoURI?: string }>,
  userMap: Record<string, any>
): DiscoveredStrategy {
  let tokens = s.tokens || s.composition || [];
  if (typeof tokens === 'string') {
    try { tokens = JSON.parse(tokens); } catch { tokens = []; }
  }
  const enrichedTokens: DiscoveredToken[] = tokens.map((t: any) => ({
    symbol: t.symbol?.toUpperCase() || 'UNKNOWN',
    weight: Number(t.weight) || 0,
    address: t.mint || undefined,
    logoURI: t.logoURI || tokenDataMap[t.mint]?.logoURI || null,
  }));
  const ownerPubkey = s.ownerPubkey || s.creator || 'Unknown';
  const userProfile = userMap[ownerPubkey];
  return {
    id: s.id || s.address || `temp-${Math.random()}`,
    name: s.name || 'Untitled Strategy',
    ticker: s.ticker,
    description: s.description || '',
    type: (s.type || 'BALANCED') as DiscoveredStrategy['type'],
    tokens: enrichedTokens,
    ownerPubkey,
    tvl: Number(s.tvl || 0),
    createdAt: s.createdAt ? Number(s.createdAt) : Date.now() / 1000,
    creatorPfpUrl: userProfile?.avatar_url ? api.getProxyUrl(userProfile.avatar_url) : null,
    mintAddress: s.mintAddress || undefined,
    vaultAddress: s.vaultAddress || undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export const ListDiscoverView = ({ onStrategySelect, onOpenInSwipe }: ListDiscoverViewProps) => {
  const { publicKey } = useWallet();

  // Accumulated raw strategies (Map preserves insertion order & dedupes)
  const rawMapRef = useRef<Map<string, any>>(new Map());
  const [rawStrategies, setRawStrategies] = useState<any[]>([]);
  const [tokenDataMap, setTokenDataMap] = useState<Record<string, { logoURI?: string }>>({});
  const [userMap, setUserMap] = useState<Record<string, any>>({});

  const [loading, setLoading] = useState(true);       // initial load
  const [loadingMore, setLoadingMore] = useState(false); // subsequent pages
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const fetchingRef = useRef(false); // guard against duplicate fetches

  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('tvl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Merge raw items into the shared Map, return updated array ─────────────
  const mergeRaw = useCallback((items: any[]) => {
    items.forEach((item: any) => {
      const key = item.id || item.address;
      if (key && !rawMapRef.current.has(key)) rawMapRef.current.set(key, item);
    });
    return Array.from(rawMapRef.current.values());
  }, []);

  // ── Fetch one page of public strategies ──────────────────────────────────
  const fetchPage = useCallback(async (offset: number, cancelled: { v: boolean }) => {
    if (fetchingRef.current || cancelled.v) return;
    fetchingRef.current = true;

    try {
      const res = await api.discoverStrategies(PAGE_SIZE, offset).catch(() => ({ strategies: [] }));
      if (cancelled.v) return;

      const incoming: any[] = res.strategies || [];
      const updated = mergeRaw(incoming);
      setRawStrategies(updated);

      // If fewer items than PAGE_SIZE came back, we've hit the end
      if (incoming.length < PAGE_SIZE) setHasMore(false);

      offsetRef.current = offset + incoming.length;
    } finally {
      fetchingRef.current = false;
    }
  }, [mergeRaw]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = { v: false };
    rawMapRef.current = new Map(); // reset on wallet change
    offsetRef.current = 0;
    setHasMore(true);
    setLoading(true);

    const init = async () => {
      try {
        // Parallel: first page + my strategies + token metadata
        const [, myRes, tokensRes] = await Promise.all([
          fetchPage(0, cancelled),
          publicKey
            ? api.getUserStrategies(publicKey.toBase58()).catch(() => ({ strategies: [] }))
            : Promise.resolve({ strategies: [] }),
          api.getTokens().catch(() => ({ tokens: [] })),
        ]);
        if (cancelled.v) return;

        // Token logo map
        const tokenMap: Record<string, { logoURI?: string }> = {};
        (tokensRes.tokens || []).forEach((t: any) => {
          if (t.mint) tokenMap[t.mint] = { logoURI: t.logoURI };
        });

        // Merge own strategies
        const myStrats: any[] = myRes.strategies || myRes || [];
        if (Array.isArray(myStrats) && myStrats.length > 0) {
          const updated = mergeRaw(myStrats);
          setRawStrategies(updated);
        }

        setTokenDataMap(tokenMap);
        setLoading(false);

        // Background: creator profiles for first batch
        const topCreators = Array.from(
          new Set(
            Array.from(rawMapRef.current.values())
              .slice(0, 60)
              .map((s: any) => s.ownerPubkey || s.creator)
              .filter(Boolean)
          )
        ).slice(0, 20) as string[];

        if (!cancelled.v && topCreators.length > 0) {
          const results = await Promise.all(
            topCreators.map((pubkey) =>
              api.getUser(pubkey).then((r) => (r.success ? r.user : null)).catch(() => null)
            )
          );
          if (!cancelled.v) {
            const map: Record<string, any> = {};
            results.forEach((u) => { if (u?.pubkey) map[u.pubkey] = u; });
            setUserMap(map);
          }
        }
      } catch {
        if (!cancelled.v) setLoading(false);
      }
    };

    init();
    return () => { cancelled.v = true; };
  }, [publicKey, fetchPage, mergeRaw]);

  // ── Infinite scroll via IntersectionObserver ──────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          setLoadingMore(true);
          const cancelled = { v: false };
          fetchPage(offsetRef.current, cancelled).finally(() => {
            if (!cancelled.v) setLoadingMore(false);
          });
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, fetchPage]);

  // ── Enrich strategies (memoised, recalcs when raw/token/user data updates) ─
  const strategies = useMemo<DiscoveredStrategy[]>(
    () => rawStrategies.map((s) => enrichStrategy(s, tokenDataMap, userMap)),
    [rawStrategies, tokenDataMap, userMap]
  );

  // ── Sort handler ──────────────────────────────────────────────────────────
  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        return key;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  // ── Filter + sort (client-side across all fetched strategies) ─────────────
  const displayed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = [...strategies];
    if (q) {
      result = result.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        (s.ticker || '').toLowerCase().includes(q) ||
        s.tokens.some((t) => t.symbol.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) => {
      let diff = 0;
      if (sortKey === 'tvl')       diff = (b.tvl       || 0) - (a.tvl       || 0);
      if (sortKey === 'createdAt') diff = (b.createdAt || 0) - (a.createdAt || 0);
      if (sortKey === 'assets')    diff = b.tokens.length   - a.tokens.length;
      if (sortKey === 'name')      diff = a.name.localeCompare(b.name);
      return sortDir === 'desc' ? diff : -diff;
    });
    return result;
  }, [strategies, searchQuery, sortKey, sortDir]);

  const handleSelect = useCallback(
    (strategy: DiscoveredStrategy) => {
      if (onOpenInSwipe) onOpenInSwipe(strategy.id);
      else onStrategySelect(strategy as any);
    },
    [onOpenInSwipe, onStrategySelect]
  );

  return (
    <div className="min-h-screen bg-[#030303] text-white pb-24">
      <div className="pt-12 md:pt-16" />

      {/* ── Search + Stats bar ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#030303]/95 backdrop-blur-md border-b border-white/[0.06]">
        {/* Search */}
        <div className="px-4 py-2.5">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ETF, token, type..."
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-all"
            />
            <AnimatePresence>
              {searchQuery && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.1 }}
                  onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center border-t border-white/[0.04]">
          {/* Rank */}
          <div className="w-10 px-3 py-2 shrink-0" />
          {/* Avatar */}
          <div className="w-10 px-1 py-2 shrink-0" />
          {/* Name */}
          <div className="flex-1 px-2 py-2">
            <SortHeader label="ETF" sortKey="name" current={sortKey} dir={sortDir} align="left" onSort={handleSort} />
          </div>
          {/* TVL */}
          <div className="w-24 px-3 py-2 flex justify-end shrink-0">
            <SortHeader label="TVL" sortKey="tvl" icon={<BarChart2 className="w-3 h-3" />} current={sortKey} dir={sortDir} onSort={handleSort} />
          </div>
          {/* Assets */}
          <div className="w-16 px-3 py-2 hidden sm:flex justify-end shrink-0">
            <SortHeader label="Assets" sortKey="assets" icon={<Layers className="w-3 h-3" />} current={sortKey} dir={sortDir} onSort={handleSort} />
          </div>
          {/* Age */}
          <div className="w-20 px-3 py-2 hidden sm:flex justify-end shrink-0">
            <SortHeader label="Age" sortKey="createdAt" icon={<Clock className="w-3 h-3" />} current={sortKey} dir={sortDir} onSort={handleSort} />
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div>
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonRow key={i} delay={i * 0.03} />
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <EmptyState />
      ) : displayed.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <Search className="w-8 h-8 text-white/10 mb-4" />
          <p className="text-white/30 text-sm mb-3">No results for "{searchQuery}"</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
          >
            Clear search
          </button>
        </motion.div>
      ) : (
        <div>
          <AnimatePresence mode="popLayout">
            {displayed.map((strategy, i) => (
              <TableRow
                key={strategy.id}
                strategy={strategy}
                rank={i + 1}
                onSelect={handleSelect}
              />
            ))}
          </AnimatePresence>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonRow key={i} delay={i * 0.05} />
              ))}
            </div>
          )}

          {/* End of list */}
          {!hasMore && !searchQuery && (
            <div className="py-8 text-center text-[11px] text-white/15 font-mono">
              {displayed.length} ETFs total
            </div>
          )}
          {searchQuery && (
            <div className="py-6 text-center text-[11px] text-white/15 font-mono">
              {displayed.length} matched "{searchQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-24 text-center px-4"
  >
    <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-6">
      <Layers className="w-7 h-7 text-white/20" />
    </div>
    <h3 className="text-base text-white/60 mb-2">No ETFs yet</h3>
    <p className="text-white/25 text-sm max-w-xs leading-relaxed">
      Be the first to create an ETF. It will appear here for the community to discover.
    </p>
  </motion.div>
);
