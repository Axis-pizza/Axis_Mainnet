import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useWallet, useConnection, useLoginModal } from './useWallet';
import { JupiterService, type JupiterToken } from '../services/jupiter';
import { fetchMarketCapMap } from '../services/coingecko';
import { WHITELISTED_ASSETS, WHITELIST_ADDRESS_SET } from '../config/whitelist';
import { toast } from 'sonner';
import type {
  StrategyConfig,
  AssetItem,
  ManualDashboardProps,
  TabType,
} from '../components/create/manual/types';

// ETF / fund alternative search keywords (ticker → common search terms not in name/symbol)
const ETF_ALIASES: Record<string, string[]> = {
  QQQ:  ['nasdaq', 'invesco qqq', 'tech index'],
  SPY:  ['s&p 500', 'sp500', 's&p500', 'standard poor'],
  VOO:  ['vanguard s&p', 'vanguard 500'],
  VTI:  ['vanguard total', 'total market'],
  VGT:  ['vanguard tech', 'information technology'],
  IWM:  ['russell 2000', 'small cap'],
  GLD:  ['gold etf', 'gold fund', 'precious metal'],
  SLV:  ['silver etf', 'silver fund'],
  XLF:  ['financials', 'banking sector'],
  XLK:  ['tech sector', 'technology sector'],
  XLE:  ['energy sector'],
  XLV:  ['healthcare sector', 'health sector'],
  XLI:  ['industrials'],
  XLP:  ['consumer staples'],
  XLY:  ['consumer discretionary'],
  XLU:  ['utilities'],
  XLRE: ['real estate', 'reit'],
  TLT:  ['long bond', 'treasury bond', '20 year'],
  HYG:  ['high yield', 'junk bond', 'credit'],
  BTC:  ['bitcoin'],
  ETH:  ['ethereum'],
  SOL:  ['solana'],
};

// Score a token against a query — higher = better match
function scoreTokenMatch(token: JupiterToken, q: string): number {
  const sym  = token.symbol.toLowerCase();
  const name = token.name.toLowerCase();
  let score  = 0;

  // Symbol matches (highest priority)
  if (sym === q)             score += 120;
  else if (sym.startsWith(q)) score += 80;
  else if (sym.includes(q))   score += 45;

  // Name matches
  if (name === q)              score += 100;
  else if (name.startsWith(q)) score += 65;
  else if (name.includes(q))   score += 28;

  // ETF alias dictionary
  const aliases = ETF_ALIASES[token.symbol.toUpperCase()];
  if (aliases?.some((a) => a.includes(q) || q.includes(a))) score += 55;

  // Boost verified / stock tokens
  if (token.isVerified)           score += 6;
  if (token.source === 'stock')   score += 4;

  // Boost by liquidity (log scale so it doesn't overwhelm text matches)
  if (token.marketCap && score > 0)
    score += Math.min(8, Math.log10(token.marketCap + 1));

  return score;
}

const POPULAR_SYMBOLS = [
  'SOL',
  'USDC',
  'USDT',
  'JUP',
  'JLP',
  'BONK',
  'WIF',
  'TRUMP',
  'ETH',
  'JitoSOL',
];

export const useManualDashboard = ({
  onDeploySuccess,
  initialConfig,
  initialTokens,
  verifiedOnly = false,
}: Pick<ManualDashboardProps, 'onDeploySuccess' | 'initialConfig' | 'initialTokens'> & {
  verifiedOnly?: boolean;
}) => {
  // --- 1. State Definitions ---
  const [step, setStep] = useState<'builder' | 'identity'>('builder');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [allTokens, setAllTokens] = useState<JupiterToken[]>([]);
  const [portfolio, setPortfolio] = useState<AssetItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Prediction markets are always sorted by volume

  const [config, setConfig] = useState<StrategyConfig>({
    name: initialConfig?.name || '',
    ticker: initialConfig?.ticker || '',
    description: initialConfig?.description || '',
  });

  const [focusedField, setFocusedField] = useState<'ticker' | 'name' | 'desc' | null>('ticker');
  const [flyingToken, setFlyingToken] = useState<JupiterToken | null>(null);
  const [flyingCoords, setFlyingCoords] = useState<{ x: number; y: number } | null>(null);

  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useLoginModal();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- 2. Helper Handlers ---
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
  }, []);

  // --- 3. Computed Values ---

  // A. Whitelist-only token list, optionally filtered by search query
  const sortedVisibleTokens = useMemo(() => {
    const base = allTokens.filter((t) => WHITELIST_ADDRESS_SET.has(t.address));
    if (!searchQuery.trim()) return base;
    const q = searchQuery.trim().toLowerCase();
    return base.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    );
  }, [allTokens, searchQuery]);

  const displayTokens = sortedVisibleTokens;

  // Prediction markets not supported in MVP whitelist mode
  const groupedPredictions: any[] = [];

  // C. その他の計算
  const selectedIds = useMemo(() => new Set(portfolio.map((p) => p.token.address)), [portfolio]);
  const totalWeight = useMemo(() => portfolio.reduce((sum, i) => sum + i.weight, 0), [portfolio]);
  const hasSelection = portfolio.length > 0;
  const REQUIRED_TOKENS = 3;
  const isValidAllocation = totalWeight === 100 && portfolio.length === REQUIRED_TOKENS;

  const filterCounts = { crypto: allTokens.length, stock: 0, commodity: 0, prediction: 0 };

  // --- 4. Effects ---


  // Initial Load — whitelist only
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      setIsLoading(true);
      try {
        const [list, mcMaps] = await Promise.all([
          JupiterService.getLiteList(),
          fetchMarketCapMap().catch(() => ({ byAddress: new Map(), bySymbol: new Map() })),
        ]);
        if (!isMounted) return;

        // Build a lookup from Jupiter data for price/volume enrichment
        const jupiterByAddress = new Map(list.map((t) => [t.address, t]));

        // Compose final token list from whitelist, enriching with Jupiter + CoinGecko data
        const enriched: JupiterToken[] = WHITELISTED_ASSETS.map((asset) => {
          const jup = jupiterByAddress.get(asset.address);
          const mc =
            mcMaps.byAddress.get(asset.address) ??
            mcMaps.bySymbol.get(asset.symbol.toUpperCase());
          return {
            address: asset.address,
            chainId: 101, // Solana mainnet
            symbol: asset.symbol,
            name: asset.name,
            logoURI: jup?.logoURI ?? asset.logoURI,
            decimals: jup?.decimals ?? 9,
            tags: jup?.tags ?? [],
            dailyVolume: jup?.dailyVolume ?? 0,
            marketCap: mc ?? jup?.marketCap ?? 0,
            isVerified: true,
            source: 'jupiter' as const,
          };
        });

        setAllTokens(enriched);

        if (initialTokens && initialTokens.length > 0) {
          const initialAssets: AssetItem[] = [];
          initialTokens.forEach((p) => {
            const t = enriched.find(
              (x) => x.symbol === p.symbol || x.address === (p as any).address
            );
            if (t && !initialAssets.some((e) => e.token.address === t.address)) {
              initialAssets.push({ token: t, weight: p.weight, locked: true, id: t.address });
            }
          });
          setPortfolio(initialAssets);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    init();
    return () => { isMounted = false; };
  }, []);


  // --- 5. Action Handlers ---
  const addTokenDirect = useCallback((token: JupiterToken) => {
    setPortfolio((prev) => {
      if (prev.some((p) => p.token.address === token.address)) return prev;
      if (prev.length >= 3) return prev;
      const currentW = prev.reduce((s, i) => s + i.weight, 0);
      let nextW = 0;
      if (currentW < 100) {
        nextW = Math.max(1, Math.floor((100 - currentW) / 2));
        if (nextW === 0 && currentW < 100) nextW = 100 - currentW;
      }
      return [...prev, { token, weight: nextW, locked: false, id: token.address }];
    });
    setSearchQuery('');
  }, []);

  // One-click add function for prediction market cards
  const addTokenToComposition = useCallback((token: JupiterToken, side?: 'YES' | 'NO') => {
    triggerHaptic();

    // Check if already added
    if (portfolio.some((p) => p.token.address === token.address)) {
      toast.info('Already in ETF', {
        description: `${token.symbol} is already in your composition`
      });
      return;
    }

    if (portfolio.length >= 3) {
      toast.error('3 tokens maximum', {
        description: 'Remove a token before adding another',
      });
      return;
    }

    // Add token directly (skip modal)
    setPortfolio((prev) => {
      const currentW = prev.reduce((s, i) => s + i.weight, 0);
      let nextW = 0;
      if (currentW < 100) {
        nextW = Math.max(1, Math.floor((100 - currentW) / 2));
        if (nextW === 0 && currentW < 100) nextW = 100 - currentW;
      }
      return [...prev, { token, weight: nextW, locked: false, id: token.address }];
    });
    
    // Success toast
    toast.success('Added to ETF ✓', {
      description: `${token.symbol} ${side ? `(${side})` : ''} added successfully`
    });
    
    setSearchQuery('');
  }, [portfolio, triggerHaptic]);

  const removeToken = useCallback(
    (address: string) => {
      triggerHaptic();
      setPortfolio((prev) => prev.filter((p) => p.token.address !== address));
    },
    [triggerHaptic]
  );
  const updateWeight = useCallback((address: string, val: number) => {
    setPortfolio((prev) =>
      prev.map((p) => (p.token.address === address ? { ...p, weight: val } : p))
    );
  }, []);
  const distributeEvenly = useCallback(() => {
    triggerHaptic();
    if (portfolio.length === 0) return;
    const count = portfolio.length;
    const evenWeight = Math.floor(100 / count);
    const remainder = 100 - evenWeight * count;
    setPortfolio((prev) =>
      prev.map((p, i) => ({ ...p, weight: evenWeight + (i === 0 ? remainder : 0) }))
    );
  }, [portfolio.length, triggerHaptic]);

  const handleToIdentity = useCallback(() => {
    triggerHaptic();
    setStep('identity');
    setFocusedField('ticker');
  }, [triggerHaptic]);
  const handleBackToBuilder = useCallback(() => setStep('builder'), []);
  const handleDeploy = useCallback(async () => {
    triggerHaptic();
    if (!config.name || !config.ticker) {
      toast.error('Required Fields', { description: 'Enter Name and Ticker.' });
      return;
    }
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    const mappedTokens = portfolio.map((p) => ({
      symbol: p.token.symbol,
      weight: p.weight,
      mint: p.token.address,
      logoURI: p.token.logoURI,
    }));
    onDeploySuccess({ tokens: mappedTokens, config });
  }, [config, connected, publicKey, setVisible, onDeploySuccess, portfolio, triggerHaptic]);

  const generateRandomTicker = useCallback(() => {
    triggerHaptic();
    const prefixes = ['MOON', 'CHAD', 'PEPE', 'SOL', 'DEGEN', 'ALPHA'];
    const suffix = Math.floor(Math.random() * 100);
    setConfig((prev) => ({
      ...prev,
      ticker: `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffix}`,
    }));
  }, [triggerHaptic]);

  const triggerAddAnimation = useCallback(
    (token: JupiterToken, rect: DOMRect) => {
      triggerHaptic();
      if (portfolio.some((p) => p.token.address === token.address)) return;
      setFlyingToken(token);
      setFlyingCoords({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    },
    [portfolio, triggerHaptic]
  );

  const handleAnimationComplete = useCallback(() => {
    if (!flyingToken) return;
    addTokenDirect(flyingToken);
    triggerHaptic();
    setFlyingToken(null);
    setFlyingCoords(null);
    setSearchQuery('');
  }, [flyingToken, triggerHaptic, addTokenDirect]);

  return {
    step,
    setStep,
    allTokens,
    displayTokens,
    portfolio,
    searchQuery,
    setSearchQuery,
    isLoading,
    config,
    setConfig,
    focusedField,
    setFocusedField,
    flyingToken,
    flyingCoords,
    activeTab,
    setActiveTab,
    totalWeight,
    selectedIds,
    hasSelection,
    isValidAllocation,
    sortedVisibleTokens,
    filterCounts,
    connected,
    groupedPredictions,
    handleToIdentity,
    handleBackToBuilder,
    handleDeploy,
    generateRandomTicker,
    triggerAddAnimation,
    handleAnimationComplete,
    addTokenDirect,
    addTokenToComposition,
    removeToken,
    updateWeight,
    distributeEvenly,
    triggerHaptic,
  };
};

export type ManualDashboardHook = ReturnType<typeof useManualDashboard>;
