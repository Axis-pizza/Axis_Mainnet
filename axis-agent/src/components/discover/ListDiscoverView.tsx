import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '../../hooks/useWallet';
import { Search, X as XIcon } from 'lucide-react';
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

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
// Card-stack loading animation — 3×3 skeleton cards deal in one by one
=======
// Mobile loading: 3×3 skeleton cards that deal in with stagger
>>>>>>> 1ad7aab (Leaderbord update)
// ─────────────────────────────────────────────────────────────────────────────
const SkeletonCard = ({ delay }: { delay: number }) => (
  <motion.div
    className="flex-1 h-[300px] rounded-[20px] overflow-hidden relative"
    initial={{ opacity: 0, y: 28, scale: 0.93 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    style={{
      background: 'linear-gradient(145deg, #111111 0%, #0a0a0a 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}
  >
<<<<<<< HEAD
    {/* shimmer wave */}
=======
>>>>>>> 1ad7aab (Leaderbord update)
    <motion.div
      className="absolute inset-0"
      initial={{ x: '-100%' }}
      animate={{ x: '100%' }}
      transition={{ delay: delay + 0.35, duration: 1.1, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)',
      }}
    />
<<<<<<< HEAD
    {/* inner skeleton lines */}
=======
>>>>>>> 1ad7aab (Leaderbord update)
    <div className="p-3 flex flex-col gap-2 h-full">
      <div className="flex justify-between items-start">
        <div className="h-4 w-12 rounded-full bg-white/[0.06]" />
        <div className="h-7 w-7 rounded-full bg-white/[0.06]" />
      </div>
      <div className="h-4 w-3/4 rounded bg-white/[0.05] mt-1" />
      <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
      <div className="flex gap-1 mt-auto">
        <div className="flex-1 h-16 rounded-xl bg-white/[0.04]" />
        <div className="flex-1 h-16 rounded-xl bg-white/[0.04]" />
      </div>
      <div className="grid grid-cols-2 gap-1">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="h-6 rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    </div>
  </motion.div>
);

<<<<<<< HEAD
const CardStackLoader = () => (
=======
const MobileLoader = () => (
>>>>>>> 1ad7aab (Leaderbord update)
  <div className="flex flex-col gap-5">
    {[0, 1, 2].map((row) => (
      <div key={row} className="flex gap-2">
        {[0, 1, 2].map((col) => (
          <SkeletonCard key={col} delay={(row * 3 + col) * 0.08} />
        ))}
      </div>
    ))}
    <div className="flex items-center justify-center gap-1.5 text-white/30 text-sm mt-1">
      <span>Loading strategies</span>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ delay: i * 0.25, duration: 0.9, repeat: Infinity }}
          className="text-[#D97706]"
        >
          ·
        </motion.span>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
// ScrollRow
=======
// PC loading: grid skeleton that matches the desktop card grid
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
// ScrollRow (mobile only)
>>>>>>> 1ad7aab (Leaderbord update)
//   • Auto-scroll  : RAF drives el.scrollLeft via virtual position (s.pos)
//   • Manual scroll: overflow-x scroll — RAF does NOT touch scrollLeft while
//                    paused, so native touch inertia runs freely
//   • Seamless loop: halfW = N × (cardWidth + gap); when pos ≥ halfW, wrap
//   • Resume sync  : on unpause, normalizes pos from actual scrollLeft so
//                    auto-scroll continues from wherever the user left off
<<<<<<< HEAD
//                    without any visual jump (content at pos and pos+halfW
//                    is identical because items are doubled)
=======
>>>>>>> 1ad7aab (Leaderbord update)
// ─────────────────────────────────────────────────────────────────────────────
interface ScrollRowProps {
  strategies: DiscoveredStrategy[];
  pxPerSec: number;
  onSelect: (s: DiscoveredStrategy) => void;
}

const ScrollRow = ({ strategies, pxPerSec, onSelect }: ScrollRowProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number>(0);
  const resumeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // All mutable scroll state in one ref — never triggers re-renders
  const s = useRef({ pos: 0, paused: false, speed: pxPerSec, halfW: 0 });
<<<<<<< HEAD
  s.current.speed = pxPerSec; // keep in sync with prop each render
=======
  s.current.speed = pxPerSec;
>>>>>>> 1ad7aab (Leaderbord update)

  const [cardWidth, setCardWidth] = useState(() =>
    typeof window !== 'undefined' ? Math.floor((window.innerWidth - 16) / 3) : 120
  );
  const cardWidthRef = useRef(cardWidth);
<<<<<<< HEAD
  cardWidthRef.current = cardWidth; // always fresh inside RAF closure
=======
  cardWidthRef.current = cardWidth;
>>>>>>> 1ad7aab (Leaderbord update)

  // Measure container → exactly 3 cards per screen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setCardWidth(Math.floor((w - 16) / 3));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

<<<<<<< HEAD
  // Pad to ≥ 6 cards so the seamless loop always has enough content
=======
  // Pad to ≥ 6 cards for a smooth seamless loop
>>>>>>> 1ad7aab (Leaderbord update)
  const items = useMemo(() => {
    if (strategies.length === 0) return [];
    const arr = [...strategies];
    while (arr.length < 6) arr.push(...strategies);
    return arr;
  }, [strategies]);

  const doubled = useMemo(() => [...items, ...items], [items]);

<<<<<<< HEAD
  // RAF loop — starts fresh whenever items count changes (0→N on first load,
  // or on search filter change). Resets scroll to 0 for clean state.
=======
  // RAF loop — starts fresh when items count changes, runs until unmount
>>>>>>> 1ad7aab (Leaderbord update)
  useEffect(() => {
    if (items.length === 0) return;
    const N = items.length;

<<<<<<< HEAD
    // Reset position for clean start
=======
>>>>>>> 1ad7aab (Leaderbord update)
    s.current.pos = 0;
    s.current.halfW = 0;
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;

<<<<<<< HEAD
    // Short delay so React can paint the cards before we start measuring
=======
>>>>>>> 1ad7aab (Leaderbord update)
    const startTimer = setTimeout(() => {
      let lastMs = performance.now();

      const tick = (ms: number) => {
<<<<<<< HEAD
        const dt = Math.min((ms - lastMs) / 1000, 0.05); // cap at 50 ms
=======
        const dt = Math.min((ms - lastMs) / 1000, 0.05);
>>>>>>> 1ad7aab (Leaderbord update)
        lastMs = ms;

        const el = scrollRef.current;
        if (el) {
<<<<<<< HEAD
          // halfW = exact width of one copy: N cards + N gaps (gap after each card)
=======
          // halfW = exact width of one copy: N × (cardWidth + gap)
>>>>>>> 1ad7aab (Leaderbord update)
          const halfW = N * (cardWidthRef.current + 8);
          s.current.halfW = halfW;

          if (!s.current.paused && halfW > 0) {
            s.current.pos += s.current.speed * dt;
            if (s.current.pos >= halfW) s.current.pos -= halfW;
            el.scrollLeft = s.current.pos;
          }
<<<<<<< HEAD
          // When paused we do NOT touch el.scrollLeft.
          // The browser (inertia scroll / user drag) owns it.
=======
          // When paused: do NOT touch el.scrollLeft — browser owns it
>>>>>>> 1ad7aab (Leaderbord update)
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    }, 150);

    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [items.length]);

<<<<<<< HEAD
  // pause(): stop auto-scroll immediately
=======
>>>>>>> 1ad7aab (Leaderbord update)
  const pause = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    s.current.paused = true;
  }, []);

<<<<<<< HEAD
  // resume(delay): after delay ms, sync pos from current scrollLeft and
  // restart auto-scroll. Syncing prevents a visual jump.
=======
>>>>>>> 1ad7aab (Leaderbord update)
  const resume = useCallback((delayMs = 0) => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);

    const doResume = () => {
      const el = scrollRef.current;
      if (el && s.current.halfW > 0) {
        const cur = el.scrollLeft;
<<<<<<< HEAD
        // Normalize into [0, halfW) — content is identical at cur and cur-halfW
        const normalized = cur >= s.current.halfW ? cur - s.current.halfW : cur;
        s.current.pos = normalized;
        // One-time teleport to normalized position (visually seamless)
=======
        // Normalize into [0, halfW) — visually identical at cur and cur-halfW
        const normalized = cur >= s.current.halfW ? cur - s.current.halfW : cur;
        s.current.pos = normalized;
>>>>>>> 1ad7aab (Leaderbord update)
        if (Math.abs(cur - normalized) > 0.5) el.scrollLeft = normalized;
      }
      s.current.paused = false;
      resumeTimer.current = null;
    };

<<<<<<< HEAD
    if (delayMs === 0) {
      doResume();
    } else {
      resumeTimer.current = setTimeout(doResume, delayMs);
    }
=======
    if (delayMs === 0) doResume();
    else resumeTimer.current = setTimeout(doResume, delayMs);
>>>>>>> 1ad7aab (Leaderbord update)
  }, []);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
<<<<<<< HEAD
      {/* Edge fade — pointer-events-none so clicks pass through to cards */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-[#030303] to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-[#030303] to-transparent" />

=======
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-[#030303] to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-[#030303] to-transparent" />
>>>>>>> 1ad7aab (Leaderbord update)
      <div
        ref={scrollRef}
        className="flex gap-2 pb-2"
        style={{ overflowX: 'scroll', scrollbarWidth: 'none' }}
        onMouseEnter={pause}
        onMouseLeave={() => resume(0)}
        onTouchStart={pause}
        onTouchEnd={() => resume(2000)}
      >
        {doubled.map((strategy, i) => (
          <div
            key={`${strategy.id}-${i}`}
            style={{ width: cardWidth, height: 300, flexShrink: 0, cursor: 'pointer' }}
            onClick={() => onSelect(strategy)}
          >
            <SwipeCardBody strategy={toCardData(strategy)} compact={true} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
export const ListDiscoverView = ({
  onStrategySelect,
  onOpenInSwipe,
}: ListDiscoverViewProps) => {
=======
export const ListDiscoverView = ({ onStrategySelect, onOpenInSwipe }: ListDiscoverViewProps) => {
>>>>>>> 1ad7aab (Leaderbord update)
  const { publicKey } = useWallet();

  const [rawStrategies, setRawStrategies] = useState<any[]>([]);
  const [tokenDataMap, setTokenDataMap] = useState<
    Record<string, { price: number; change24h: number; logoURI?: string }>
  >({});
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Responsive layout: PC uses grid, mobile uses horizontal scroll rows
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  useEffect(() => {
<<<<<<< HEAD
    let cancelled = false;

=======
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

>>>>>>> 1ad7aab (Leaderbord update)
    const loadData = async () => {
      setLoading(true);

      try {
<<<<<<< HEAD
        // ── Phase 1: fast path — show cards immediately ──────────────────────
        // Limit to 100 strategies (enough for 3 looping rows).
        // Use backend token prices only; no external calls yet.
=======
        // Phase 1: fast — fetch strategies + backend token data, show UI
>>>>>>> 1ad7aab (Leaderbord update)
        const [publicRes, myRes, tokensRes] = await Promise.all([
          api.discoverStrategies(100).catch(() => ({ strategies: [] })),
          publicKey
            ? api.getUserStrategies(publicKey.toBase58()).catch(() => ({ strategies: [] }))
            : Promise.resolve({ strategies: [] }),
          api.getTokens().catch(() => ({ tokens: [] })),
        ]);

        if (cancelled) return;

<<<<<<< HEAD
        // Build token map from backend data (single fast call)
=======
>>>>>>> 1ad7aab (Leaderbord update)
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

<<<<<<< HEAD
        // Also seed token map with per-strategy token metadata
=======
>>>>>>> 1ad7aab (Leaderbord update)
        const myStrats = myRes.strategies || myRes || [];
        const combined = [
          ...(Array.isArray(myStrats) ? myStrats : []),
          ...(publicRes.strategies || []),
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

<<<<<<< HEAD
        // Render cards now — prices may be 0 but cards are visible
        setRawStrategies(uniqueStrategies);
        setTokenDataMap({ ...tokenMap });
        setLoading(false); // ← UI unblocked here

        // ── Phase 2 (background): live prices for mints missing data ────────
        // Only fetch mints where price === 0, cap at 30 to stay light.
=======
        setRawStrategies(uniqueStrategies);
        setTokenDataMap({ ...tokenMap });
        setLoading(false); // ← UI unblocked

        // Phase 2 (background): live prices for mints with no price yet
>>>>>>> 1ad7aab (Leaderbord update)
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

<<<<<<< HEAD
        // ── Phase 3 (background): creator profiles — first 20 only ──────────
=======
        // Phase 3 (background): creator profiles for first 20 creators
>>>>>>> 1ad7aab (Leaderbord update)
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

<<<<<<< HEAD
=======
  // Enrich strategies with token prices and creator profiles
>>>>>>> 1ad7aab (Leaderbord update)
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
        creatorPfpUrl: userProfile?.avatar_url
          ? api.getProxyUrl(userProfile.avatar_url)
          : null,
        mintAddress: s.mintAddress || undefined,
        vaultAddress: s.vaultAddress || undefined,
      };
    });
  }, [rawStrategies, tokenDataMap, userMap]);

<<<<<<< HEAD
  // Shuffle order is fixed when rawStrategies IDs change (not on every price update).
  // This prevents cards from reordering every time Phase 2/3 updates enrich the data.
=======
  // Shuffle order fixed on rawStrategies change — stable across price updates
>>>>>>> 1ad7aab (Leaderbord update)
  const shuffledIds = useMemo(
    () => shuffleArray(rawStrategies.map((s) => s.id || s.address || '')),
    [rawStrategies]
  );
  const shuffledStrategies = useMemo(() => {
    const byId = new Map(strategies.map((s) => [s.id, s]));
    return shuffledIds.map((id) => byId.get(id)).filter(Boolean) as DiscoveredStrategy[];
  }, [strategies, shuffledIds]);

  const filteredStrategies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shuffledStrategies;
    return shuffledStrategies.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true;
      if (s.type.toLowerCase().includes(q)) return true;
      if (s.tokens.some((t) => t.symbol.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [shuffledStrategies, searchQuery]);

<<<<<<< HEAD
  // Distribute round-robin into 3 rows
=======
  // Distribute round-robin into 3 rows for mobile ScrollRow
>>>>>>> 1ad7aab (Leaderbord update)
  const [row1, row2, row3] = useMemo(() => {
    const r0: DiscoveredStrategy[] = [];
    const r1: DiscoveredStrategy[] = [];
    const r2: DiscoveredStrategy[] = [];
    filteredStrategies.forEach((s, i) => {
      if (i % 3 === 0) r0.push(s);
      else if (i % 3 === 1) r1.push(s);
      else r2.push(s);
    });
    return [r0, r1, r2];
  }, [filteredStrategies]);

  const handleSelect = useCallback(
    (strategy: DiscoveredStrategy) => {
      if (onOpenInSwipe) onOpenInSwipe(strategy.id);
      else onStrategySelect(strategy as any);
    },
    [onOpenInSwipe, onStrategySelect]
  );

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
                {filteredStrategies.length} result
                {filteredStrategies.length !== 1 ? 's' : ''} for{' '}
                <span className="text-[#B8863F]">"{searchQuery}"</span>
              </p>
            )}
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {loading ? (
<<<<<<< HEAD
          <CardStackLoader />
=======
          isDesktop ? <DesktopLoader /> : <MobileLoader />
>>>>>>> 1ad7aab (Leaderbord update)
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
<<<<<<< HEAD
        ) : (
          /* 3 rows — each independent auto-scroll + manual scroll */
          <div className="flex flex-col gap-5">
            <ScrollRow strategies={row1} pxPerSec={35} onSelect={handleSelect} />
            <ScrollRow strategies={row2} pxPerSec={25} onSelect={handleSelect} />
            <ScrollRow strategies={row3} pxPerSec={45} onSelect={handleSelect} />
            <p className="text-right text-xs text-white/20">
              {filteredStrategies.length} strategies
            </p>
=======
        ) : isDesktop ? (
          /* ── PC: vertical grid, all strategies, no limit ───────────────── */
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
>>>>>>> 1ad7aab (Leaderbord update)
          </div>
        ) : (
          /* ── Mobile: 3 horizontal auto-scroll rows ─────────────────────── */
          <div className="flex flex-col gap-5">
            <ScrollRow strategies={row1} pxPerSec={35} onSelect={handleSelect} />
            <ScrollRow strategies={row2} pxPerSec={25} onSelect={handleSelect} />
            <ScrollRow strategies={row3} pxPerSec={45} onSelect={handleSelect} />
            <p className="text-right text-xs text-white/20 pr-2">
              {filteredStrategies.length} strategies
            </p>
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
      Be the first to create a strategy pizza! Your creation will appear here
      for the community to discover.
    </p>
    <div className="text-xs text-white/30 px-3 py-1 rounded-full border border-white/10">
      Create → Discover → Grow 🚀
    </div>
  </motion.div>
);
