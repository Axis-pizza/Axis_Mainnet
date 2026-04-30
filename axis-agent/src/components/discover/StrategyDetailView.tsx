import { useEffect, useState, useMemo, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useMotionValue,
  useAnimation,
  animate,
} from 'framer-motion';
import {
  ArrowLeft,
  Copy,
  Star,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  PieChart,
  Wallet,
  ArrowRight,
  X,
  Check,
  ArrowDown,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useConnection, useWallet } from '../../hooks/useWallet';
import { useAxisVaultWallet } from '../../hooks/useAxisVaultWallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { TradingChart } from '../common/TradingChart';
import { api } from '../../services/api';
import type { Strategy } from '../../types';
import { useToast } from '../../context/ToastContext';
import { RedeemModal } from '../profile/RedeemModal';
import { getUserPosition, lamportsToSol } from '../../protocol/kagemusha';
import {
  buildJupiterSolSeedPlan,
  buildJupiterBasketSellPlan,
  sendVersionedTx,
  SOL_MINT,
} from '../../protocol/axis-vault';

// --- Types ---
interface StrategyDetailViewProps {
  initialData: Strategy;
  onBack: () => void;
}
type TransactionStatus = 'IDLE' | 'SIGNING' | 'CONFIRMING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

// --- Icons ---
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
  </svg>
);

// --- SwipeToConfirm ---
const SwipeToConfirm = ({
  onConfirm,
  isLoading,
  isSuccess,
  label,
  amount,
}: {
  onConfirm: () => void;
  isLoading: boolean;
  isSuccess?: boolean;
  label: string;
  amount?: string;
}) => {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [containerWidth, setContainerWidth] = useState(280);

  const HANDLE_SIZE = 56;
  const PADDING = 4;
  const maxDrag = Math.max(0, containerWidth - HANDLE_SIZE - PADDING * 2);

  const textOpacity = useTransform(x, [0, maxDrag * 0.5], [1, 0]);
  const progressWidth = useTransform(x, [0, maxDrag], [HANDLE_SIZE + PADDING * 2, containerWidth]);

  useEffect(() => {
    if (!isLoading && !isSuccess) {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [amount, isLoading, isSuccess, x]);

  useEffect(() => {
    if (!constraintsRef.current) return;
    const el = constraintsRef.current;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (isLoading || isSuccess) {
      x.set(maxDrag);
    } else if (x.get() === maxDrag && !isLoading && !isSuccess) {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [isLoading, isSuccess, maxDrag, x]);

  const handleDragEnd = () => {
    if (x.get() > maxDrag * 0.6) {
      animate(x, maxDrag, { type: 'spring', stiffness: 500, damping: 40 });
      if (!isLoading && !isSuccess) onConfirm();
    } else {
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
    }
  };

  return (
    <div
      ref={constraintsRef}
      className={`relative h-16 w-full rounded-full overflow-hidden border select-none transition-all duration-300 ${
        isSuccess
          ? 'bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
          : 'bg-[#1C1C1E] border-[rgba(255,255,255,0.1)]'
      }`}
    >
      <motion.div
        className={`absolute inset-y-0 left-0 rounded-full z-0 ${
          isSuccess ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#B8863F] to-[#D4A261]'
        }`}
        style={{ width: progressWidth }}
      />

      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
        style={{ opacity: textOpacity }}
      >
        <span className="font-normal text-xs tracking-[0.2em] text-white/50 animate-pulse">
          {isLoading ? 'PROCESSING...' : label}
        </span>
      </motion.div>

      {isSuccess && (
        <div className="absolute inset-0 flex items-center justify-center z-20 text-white font-normal tracking-widest text-sm">
          SUCCESS
        </div>
      )}

      <motion.div
        drag={!isLoading && !isSuccess ? 'x' : false}
        dragConstraints={{ left: 0, right: maxDrag }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x, touchAction: 'pan-x' }}
        className="relative top-1 left-1 w-14 h-14 bg-white rounded-full shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing z-30"
      >
        {isLoading ? (
          <Loader2 className="w-6 h-6 text-[#B8863F] animate-spin" />
        ) : isSuccess ? (
          <Check className="w-6 h-6 text-emerald-600" />
        ) : (
          <ChevronRight className="w-6 h-6 text-[#B8863F]" />
        )}
      </motion.div>
    </div>
  );
};

// --- InvestSheet (Jupiter-direct: BUY = SOL → basket, SELL = % of basket → SOL) ---
interface InvestSheetProps {
  isOpen: boolean;
  onClose: () => void;
  strategy: Strategy;
  onConfirm: (amount: string, mode: 'BUY' | 'SELL') => Promise<void>;
  status: TransactionStatus;
  hasBasketPosition: boolean;
}

const InvestSheet = ({
  isOpen,
  onClose,
  strategy,
  onConfirm,
  status,
  hasBasketPosition,
}: InvestSheetProps) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('0');
  const [solBalance, setSolBalance] = useState(0);

  useEffect(() => {
    if (!publicKey || !isOpen) return;
    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setSolBalance(lamports / LAMPORTS_PER_SOL);
      } catch {
        // non-fatal
      }
    };
    fetchBalance();
  }, [isOpen, publicKey, connection]);

  useEffect(() => {
    if (isOpen) {
      setAmount('0');
      setMode('BUY');
    }
  }, [isOpen]);

  // BUY caps the input at wallet SOL (minus a tiny fee buffer); SELL is a
  // percent of the user's existing basket holdings (1..100).
  const isSell = mode === 'SELL';
  const maxValue = isSell ? 100 : Math.max(0, solBalance - 0.005);
  const unit = isSell ? '%' : 'SOL';
  const balanceLabel = isSell
    ? hasBasketPosition
      ? '100% sellable'
      : 'No basket position'
    : `Available: ${solBalance.toFixed(4)} SOL`;

  const handleNum = (num: string) => {
    if (status !== 'IDLE' && status !== 'ERROR') return;
    if (amount === '0' && num !== '.') setAmount(num);
    else if (amount.includes('.') && num === '.') return;
    else if (amount.length < 9) setAmount((prev) => prev + num);
  };

  const handleBackspace = () => {
    if (status !== 'IDLE' && status !== 'ERROR') return;
    setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleExecute = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      showToast(`Enter valid ${isSell ? 'percentage' : 'amount'}`, 'error');
      return;
    }
    if (val > maxValue) {
      showToast(isSell ? 'Max 100%' : 'Insufficient balance', 'error');
      return;
    }
    if (isSell && !hasBasketPosition) {
      showToast('You have no basket position to sell', 'error');
      return;
    }
    onConfirm(amount, mode);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-0 z-[99999] bg-[#0C0C0C] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-12 pb-4 shrink-0 safe-area-top">
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#1C1C1E] text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex bg-[#1C1C1E] p-1 rounded-full border border-white/5">
              <button
                onClick={() => setMode('BUY')}
                className={`px-5 py-1.5 rounded-full text-xs font-normal transition-all ${
                  mode === 'BUY' ? 'bg-[#B8863F] text-black' : 'text-[#78716C]'
                }`}
              >
                Deposit
              </button>
              <button
                onClick={() => setMode('SELL')}
                className={`px-5 py-1.5 rounded-full text-xs font-normal transition-all ${
                  mode === 'SELL' ? 'bg-[#B8863F] text-black' : 'text-[#78716C]'
                }`}
              >
                Withdraw
              </button>
            </div>
            <div className="w-10 h-10" />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center items-center relative w-full px-6">
            <div className="flex flex-col items-center gap-2 mb-8">
              <div className="flex items-baseline justify-center gap-1">
                <span
                  className={`font-sans font-normal text-6xl tracking-tight ${amount === '0' ? 'text-[#57534E]' : 'text-white'}`}
                >
                  {amount}
                </span>
              </div>
              <span className="text-[#78716C] font-normal text-lg">{unit}</span>
            </div>

            <div className="flex items-center gap-2 bg-[#1C1C1E] py-2 px-4 rounded-full border border-white/5 mb-8">
              <Wallet className="w-3.5 h-3.5 text-[#78716C]" />
              <span className="text-[#A8A29E] text-xs font-mono">{balanceLabel}</span>
              <button
                onClick={() => setAmount(isSell ? '100' : maxValue.toFixed(4))}
                className="text-[#B8863F] text-xs font-normal uppercase hover:text-white transition-colors"
              >
                Max
              </button>
            </div>

            {amount !== '0' && (
              <div className="absolute bottom-4 flex items-center gap-2 text-sm text-[#78716C]">
                <ArrowDown className="w-4 h-4" />
                <span>
                  {isSell
                    ? `Sell ${amount}% of basket → SOL via Jupiter`
                    : `Buy ${strategy.name} basket with ${amount} SOL via Jupiter`}
                </span>
              </div>
            )}
          </div>

          {/* Keypad & Action */}
          <div className="shrink-0 w-full px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] bg-[#0C0C0C]">
            {(status === 'IDLE' || status === 'ERROR') && (
              <div className="grid grid-cols-3 gap-y-4 gap-x-6 mb-8 max-w-[320px] mx-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map((key) => (
                  <button
                    key={key}
                    onClick={() => handleNum(key.toString())}
                    className="h-14 text-2xl font-normal text-white hover:bg-white/5 active:bg-white/10 rounded-full transition-all flex items-center justify-center select-none"
                  >
                    {key}
                  </button>
                ))}
                <button
                  onClick={handleBackspace}
                  className="h-14 flex items-center justify-center text-white hover:bg-white/5 rounded-full active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
              </div>
            )}

            <div className="max-w-[340px] mx-auto w-full">
              {status === 'SIGNING' || status === 'CONFIRMING' || status === 'PROCESSING' ? (
                <div className="w-full h-16 bg-[#1C1C1E] rounded-full flex items-center justify-center gap-3 border border-white/5">
                  <Loader2 className="w-5 h-5 text-[#B8863F] animate-spin" />
                  <span className="text-white font-normal tracking-wide text-sm">PROCESSING...</span>
                </div>
              ) : (
                <SwipeToConfirm
                  onConfirm={handleExecute}
                  isLoading={false}
                  isSuccess={status === 'SUCCESS'}
                  label={`SLIDE TO ${mode === 'BUY' ? 'DEPOSIT' : 'WITHDRAW'}`}
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Main View ---
export const StrategyDetailView = ({ initialData, onBack }: StrategyDetailViewProps) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const axisWallet = useAxisVaultWallet();
  const { showToast } = useToast();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scrollContainerRef });
  const headerOpacity = useTransform(scrollY, [0, 60], [0, 1]);
  const headerY = useTransform(scrollY, [0, 60], [-10, 0]);

  const [strategy] = useState(initialData);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tokensInfo, setTokensInfo] = useState<any[]>([]);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isInvestOpen, setIsInvestOpen] = useState(false);
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);
  const [investStatus, setInvestStatus] = useState<TransactionStatus>('IDLE');
  const [userSolPosition, setUserSolPosition] = useState(0);
  const [basketBalances, setBasketBalances] = useState<bigint[]>([]);

  const controls = useAnimation();

  const basketMints = useMemo<PublicKey[] | null>(() => {
    const tokens = strategy.tokens ?? [];
    if (tokens.length === 0) return null;
    try {
      return tokens.map((t) => new PublicKey((t.mint || t.address) as string));
    } catch {
      return null;
    }
  }, [strategy.tokens]);

  const basketWeightsBps = useMemo<number[]>(() => {
    const tokens = strategy.tokens ?? [];
    if (tokens.length === 0) return [];
    const raw = tokens.map((t) => Math.max(0, Math.round((t.weight ?? 0) * 100)));
    const sum = raw.reduce((a, b) => a + b, 0);
    if (sum === 0) return raw.map(() => Math.floor(10_000 / Math.max(1, raw.length)));
    if (sum !== 10_000) raw[raw.length - 1] += 10_000 - sum;
    return raw;
  }, [strategy.tokens]);

  // Basket holdings (per-mint ATA balances) drive SELL preview + insufficient-balance guard.
  useEffect(() => {
    if (!wallet.publicKey || !basketMints) return;
    let cancelled = false;
    const fetchBalances = async () => {
      const out = await Promise.all(
        basketMints.map(async (mint) => {
          try {
            const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey!, false);
            const bal = await connection.getTokenAccountBalance(ata, 'confirmed');
            return BigInt(bal.value.amount);
          } catch {
            return 0n;
          }
        })
      );
      if (!cancelled) setBasketBalances(out);
    };
    fetchBalances();
    return () => {
      cancelled = true;
    };
  }, [wallet.publicKey, connection, basketMints, investStatus]);

  // --- On-chain SOL Position ---
  const strategyAddress = strategy.address;
  useEffect(() => {
    if (!wallet.publicKey || !strategyAddress) return;
    const fetchSolPosition = async () => {
      try {
        const strategyPubkey = new PublicKey(strategyAddress);
        const pos = await getUserPosition(connection, strategyPubkey, wallet.publicKey!);
        if (pos) setUserSolPosition(lamportsToSol(pos.lpShares));
      } catch {
        // no position on-chain
      }
    };
    fetchSolPosition();
  }, [wallet.publicKey, connection, strategyAddress, investStatus, isRedeemOpen]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestValue = (strategy as any).price || 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changePct = (strategy as any).roi || 0;
  const isPositive = changePct >= 0;

  useEffect(() => {
    const init = async () => {
      if (wallet.publicKey) {
        try {
          const wRes = await api.checkWatchlist(strategy.id, wallet.publicKey.toBase58());
          setIsWatchlisted(wRes.isWatchlisted);
        } catch {
          // non-fatal
        }
      }
      try {
        const tokenRes = await api.getTokens();
        if (tokenRes.success) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const enriched = (strategy.tokens || []).map((t: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const meta = (tokenRes.tokens || []).find((m: any) => m.symbol === t.symbol?.toUpperCase());
            return { ...t, logoURI: meta?.logoURI, name: meta?.name || t.symbol };
          });
          setTokensInfo(enriched);
        } else {
          setTokensInfo(strategy.tokens || []);
        }
      } catch {
        setTokensInfo(strategy.tokens || []);
      }
    };
    init();
  }, [strategy.id, wallet.publicKey, strategy.tokens]);

  useEffect(() => {
    const fetchTxHistory = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || 'https://axis-api-mainnet.yusukekikuta-05.workers.dev';
        const res = await fetch(`${API_BASE}/strategies/${strategy.id}/transactions?limit=20`);
        const json = await res.json() as { success: boolean; data: any[] };
        if (json.success) setTxHistory(json.data);
      } catch {
        // non-fatal
      }
    };
    fetchTxHistory();
  }, [strategy.id]);

  const handleToggleWatchlist = async () => {
    if (!wallet.publicKey) {
      showToast('Connect wallet required', 'info');
      return;
    }
    controls.set({ rotate: 0, scale: 1 });
    controls.start({
      rotate: 360,
      scale: [1, 1.4, 1],
      transition: { duration: 0.5, type: 'spring', stiffness: 260, damping: 20 },
    });
    const nextState = !isWatchlisted;
    setIsWatchlisted(nextState);
    try {
      await api.toggleWatchlist(strategy.id, wallet.publicKey.toBase58());
    } catch {
      setIsWatchlisted(!nextState);
      showToast('Failed to update', 'error');
    }
  };

  const handleShareToX = () => {
    const text = `Check out ${strategy.name} ($${strategy.ticker}) on Axis! 🚀`;
    const shareUrl = `${window.location.origin}/strategy/${strategy.id}`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank'
    );
  };

  // Why: PFMM program has no per-user LP accounting and no LP→SOL ix, so
  // user "deposits" can't go into the pool — basket tokens stay in the
  // user's wallet and we transact via Jupiter directly. Sells just hit
  // those same wallet ATAs. Pool interactions remain a creator-only flow.
  const handleTransaction = async (amountStr: string, mode: 'BUY' | 'SELL') => {
    if (!wallet.publicKey || !axisWallet) return showToast('Connect Wallet', 'error');
    if (!basketMints) return showToast('Strategy basket not loaded', 'error');

    setInvestStatus('SIGNING');
    try {
      if (mode === 'BUY') {
        const amountSol = parseFloat(amountStr);
        if (!isFinite(amountSol) || amountSol <= 0) {
          throw new Error('Enter a SOL amount greater than zero');
        }
        const solIn = BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL));
        const plan = await buildJupiterSolSeedPlan({
          conn: connection,
          user: wallet.publicKey,
          outputMints: basketMints,
          weights: basketWeightsBps,
          solIn,
          slippageBps: 50,
          maxAccounts: 14,
          closeWsolAtEnd: true,
        });
        setInvestStatus('CONFIRMING');
        const sig = await sendVersionedTx(connection, axisWallet, plan.versionedTx);
        setInvestStatus('PROCESSING');
        // Backend record (non-fatal).
        fetch('https://axis-api-mainnet.yusukekikuta-05.workers.dev/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPubkey: wallet.publicKey.toBase58(),
            amount: amountSol,
            mode,
            strategyId: strategy.id,
            txSig: sig,
          }),
        }).catch(() => {});
        setInvestStatus('SUCCESS');
        showToast(`Bought basket for ${amountSol} SOL`, 'success');
      } else {
        const pct = parseFloat(amountStr);
        if (!isFinite(pct) || pct <= 0 || pct > 100) {
          throw new Error('Enter a percentage between 0 and 100');
        }
        const inputs = basketMints
          .map((mint, i) => {
            const balance = basketBalances[i] ?? 0n;
            const amount = (balance * BigInt(Math.floor(pct * 100))) / 10_000n;
            return { mint, amount };
          })
          .filter((leg) => leg.amount > 0n);
        if (inputs.length === 0) {
          throw new Error('No basket tokens to sell — buy first or check balances');
        }
        const plan = await buildJupiterBasketSellPlan({
          conn: connection,
          user: wallet.publicKey,
          inputs,
          slippageBps: 50,
          maxAccounts: 14,
          closeWsolAtEnd: true,
        });
        setInvestStatus('CONFIRMING');
        const sig = await sendVersionedTx(connection, axisWallet, plan.versionedTx);
        setInvestStatus('PROCESSING');
        const expectedSol = Number(plan.totalExpectedSolOut) / LAMPORTS_PER_SOL;
        fetch('https://axis-api-mainnet.yusukekikuta-05.workers.dev/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPubkey: wallet.publicKey.toBase58(),
            amount: expectedSol,
            mode,
            strategyId: strategy.id,
            txSig: sig,
          }),
        }).catch(() => {});
        setInvestStatus('SUCCESS');
        showToast(`Sold ${pct.toFixed(0)}% — ~${expectedSol.toFixed(4)} SOL out`, 'success');
      }

      setTimeout(() => {
        setIsInvestOpen(false);
        setInvestStatus('IDLE');
      }, 1500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transaction Failed';
      showToast(msg.slice(0, 160), 'error');
      setInvestStatus('ERROR');
      setTimeout(() => setInvestStatus('IDLE'), 2000);
    }
  };

  return (
    <div className="h-screen bg-black text-[#E7E5E4] font-sans selection:bg-[#B8863F]/30 flex flex-col overflow-hidden">
      {/* Header */}
      <motion.div className="absolute top-0 inset-x-0 z-[9999] flex items-center justify-between px-4 py-3 safe-area-top pointer-events-none">
        <motion.div
          className="absolute inset-0 bg-black/80 backdrop-blur-md border-b border-[rgba(184,134,63,0.08)] pointer-events-auto"
          style={{ opacity: headerOpacity }}
        />
        <button
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          className="relative z-50 w-10 h-10 flex items-center justify-center text-white/90 hover:text-white bg-black/40 rounded-full backdrop-blur-md transition-all active:scale-90 pointer-events-auto shadow-sm border border-[rgba(184,134,63,0.08)] cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <motion.div
          style={{ opacity: headerOpacity, y: headerY }}
          className="relative z-10 font-normal text-sm tracking-wide pointer-events-none"
        >
          {strategy?.ticker}
        </motion.div>
        <div className="relative z-10 flex gap-2 pointer-events-auto">
          <button
            onClick={handleToggleWatchlist}
            className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-yellow-400 bg-black/40 rounded-full backdrop-blur-md border border-[rgba(184,134,63,0.08)] active:scale-90 transition-all"
          >
            <motion.div animate={controls}>
              <Star className={`w-5 h-5 transition-colors duration-300 ${isWatchlisted ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            </motion.div>
          </button>
          <button
            onClick={handleShareToX}
            className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white bg-black/40 rounded-full backdrop-blur-md border border-[rgba(184,134,63,0.08)] active:scale-90 transition-all"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Scrollable Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-32 no-scrollbar">
        <div className="px-4 md:px-24 pt-24 space-y-6">
          {/* Hero */}
          <div className="flex flex-col items-start">
            <h1 className="text-xl font-normal text-[#78716C] mb-1">{strategy?.name}</h1>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-serif font-normal tracking-tighter text-white">
                ${latestValue?.toFixed(2)}
              </span>
            </div>
            <div className={`flex items-center gap-1 mt-2 text-sm font-normal ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {Math.abs(changePct).toFixed(2)}%{' '}
              <span className="text-[#57534E] font-normal ml-1">Today</span>
            </div>
          </div>

          <TradingChart
            label={strategy?.ticker || strategy?.name}
            seed={strategy?.id ? strategy.id.charCodeAt(0) + strategy.id.charCodeAt(strategy.id.length - 1) : 42}
            height={320}
            endpoint={strategy?.id ? `${import.meta.env.VITE_API_URL || 'https://axis-api-mainnet.yusukekikuta-05.workers.dev'}/strategies/${strategy.id}/candles` : undefined}
          />

          {/* Stats Strip */}
          <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 md:-mx-6 px-4 md:px-6 pb-2">
            <div className="flex-shrink-0 min-w-[140px] p-4 bg-[#140E08] rounded-2xl border border-[rgba(184,134,63,0.08)] flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[#78716C]">
                <Layers className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase font-normal tracking-wider">TVL</span>
              </div>
              <p className="text-lg font-normal text-white">
                {typeof strategy?.tvl === 'number'
                  ? strategy.tvl >= 1000
                    ? `${(strategy.tvl / 1000).toFixed(1)}k`
                    : strategy.tvl.toFixed(0)
                  : '0'}{' '}
                <span className="text-xs font-normal text-[#57534E]">SOL</span>
              </p>
            </div>

            <div className="flex-shrink-0 min-w-[140px] p-4 bg-[#140E08] rounded-2xl border border-[rgba(184,134,63,0.08)] flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[#78716C]">
                <Activity className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase font-normal tracking-wider">ROI (All)</span>
              </div>
              <p className={`text-lg font-normal ${changePct >= 0 ? 'text-[#B8863F]' : 'text-red-500'}`}>
                {changePct > 0 ? '+' : ''}{changePct?.toFixed(2)}%
              </p>
            </div>

            {strategy.address && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(strategy.address!);
                  showToast('Strategy Address Copied', 'success');
                }}
                className="flex-shrink-0 min-w-[140px] p-4 bg-[#140E08] rounded-2xl border border-[rgba(184,134,63,0.08)] flex flex-col gap-1 hover:bg-[#292524] transition-colors text-left group"
              >
                <div className="flex items-center gap-1.5 text-[#78716C]">
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase font-normal tracking-wider">Vault</span>
                </div>
                <p className="text-sm font-mono text-[#A8A29E] truncate w-full group-hover:text-white">
                  {strategy.address.slice(0, 4)}...{strategy.address.slice(-4)}
                </p>
              </button>
            )}
          </div>

          {/* Composition */}
          <div>
            <h3 className="text-sm font-normal text-[#78716C] uppercase tracking-widest mb-4 flex items-center gap-2">
              <PieChart className="w-4 h-4" /> Composition
            </h3>
            <div className="bg-[#140E08]/50 rounded-3xl border border-[rgba(184,134,63,0.08)] overflow-hidden">
              {(tokensInfo?.length ?? 0) > 0 ? (
                tokensInfo.map((token, i) => (
                  <div
                    key={i}
                    className={`relative p-4 ${i !== tokensInfo.length - 1 ? 'border-b border-[rgba(184,134,63,0.08)]' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          {token.logoURI ? (
                            <img src={token.logoURI} alt={token.symbol} className="w-10 h-10 rounded-full bg-black object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[#292524] flex items-center justify-center font-normal text-xs text-[#B8863F]">
                              {token.symbol?.[0] || '?'}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-normal text-white text-sm">{token.symbol || 'UNK'}</h4>
                          <p className="text-[10px] text-[#78716C] truncate">{token.name || 'Token'}</p>
                        </div>
                      </div>
                      <span className="font-normal text-white text-sm shrink-0 ml-2">{token.weight}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${token.weight}%` }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        className="h-full bg-[#B8863F] rounded-full"
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-[#57534E] text-sm">Loading composition...</div>
              )}
            </div>
          </div>

          {/* Transactions */}
          <div>
            <h3 className="text-sm font-normal text-[#78716C] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Transactions
            </h3>
            <div className="bg-[#140E08]/50 rounded-3xl border border-[rgba(184,134,63,0.08)] overflow-hidden">
              {txHistory.length > 0 ? txHistory.map((tx, i) => {
                const isDeposit = tx.type === 'deposit';
                const ago = (() => {
                  const diff = Math.floor(Date.now() / 1000) - tx.blockTime;
                  if (diff < 60) return `${diff}s ago`;
                  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                  return `${Math.floor(diff / 86400)}d ago`;
                })();
                return (
                  <div
                    key={tx.signature}
                    className={`flex items-center justify-between px-4 py-3 ${i !== txHistory.length - 1 ? 'border-b border-[rgba(184,134,63,0.06)]' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isDeposit ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                        {isDeposit
                          ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                          : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-normal text-white">{isDeposit ? 'Deposit' : 'Withdraw'}</p>
                        <p className="text-[10px] text-[#78716C] font-mono truncate">
                          {tx.account.slice(0, 4)}...{tx.account.slice(-4)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-2 gap-0.5">
                      <span className={`text-xs font-normal ${isDeposit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isDeposit ? '+' : '-'}{tx.amountSol.toFixed(4)} SOL
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[#57534E]">{ago}</span>
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#B8863F] hover:underline font-mono"
                          onClick={e => e.stopPropagation()}
                        >
                          Txn
                        </a>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center py-8 text-[#57534E] text-sm">No transactions yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="absolute bottom-0 inset-x-0 bg-[#080503]/95 backdrop-blur-md border-t border-[rgba(184,134,63,0.15)] z-40 pt-3 px-6 pb-[calc(env(safe-area-inset-bottom,8px)+8px)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-[#78716C] uppercase tracking-wider">In Vault</span>
            <span className="text-lg font-serif font-normal text-white">
              {userSolPosition.toFixed(4)} <span className="text-xs text-[#78716C]">SOL</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {userSolPosition > 0 && (
              <button
                onClick={() => setIsRedeemOpen(true)}
                className="bg-white/10 text-white/70 font-normal px-4 py-3 rounded-full border border-white/10 active:scale-95 transition-all flex items-center gap-1.5 text-sm"
              >
                <ArrowDown className="w-4 h-4" /> Redeem
              </button>
            )}
            <button
              onClick={() => setIsInvestOpen(true)}
              className="bg-[#B8863F] text-black font-normal px-8 py-3 rounded-full shadow-[0_4px_20px_rgba(184,134,63,0.3)] active:scale-95 transition-all flex items-center gap-2"
            >
              Trade <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <InvestSheet
        isOpen={isInvestOpen}
        onClose={() => setIsInvestOpen(false)}
        strategy={strategy}
        onConfirm={handleTransaction}
        status={investStatus}
        hasBasketPosition={basketBalances.some((b) => b > 0n)}
      />

      <RedeemModal
        isOpen={isRedeemOpen}
        onClose={() => setIsRedeemOpen(false)}
        strategyAddress={strategy.address || ''}
        strategyName={strategy.name}
        onSuccess={() => {
          setIsRedeemOpen(false);
          setUserSolPosition(0);
        }}
      />
    </div>
  );
};
