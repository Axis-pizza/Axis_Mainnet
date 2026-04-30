import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform as useMotionTransform,
  animate,
} from 'framer-motion';
import {
  RefreshCw,
  Loader2,
  Sparkles,
  Rocket,
  X,
  Wallet,
  ArrowDown,
  ArrowLeft,
  ChevronRight,
  Check,
  ShoppingCart,
} from 'lucide-react';
import { SwipeCard } from './SwipeCard';
import { api } from '../../services/api';
import { useWallet, useConnection, useLoginModal } from '../../hooks/useWallet';
import { useAxisVaultWallet } from '../../hooks/useAxisVaultWallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { JupiterService } from '../../services/jupiter';
import {
  depositSol,
  withdrawSol,
  solToLamports,
  getUserPosition,
  lamportsToSol,
} from '../../protocol/kagemusha';
import {
  AXIS_VAULT_PROGRAM_ID,
  buildDepositSolPlan,
  buildJupiterSolSeedPlan,
  buildWithdrawSolPlan,
  fetchEtfState,
  findEtfState,
  sendVersionedTx,
  type EtfStateData,
} from '../../protocol/axis-vault';
import { DexScreenerService } from '../../services/dexscreener';
import { useToast } from '../../context/ToastContext';

type TransactionStatus = 'IDLE' | 'SIGNING' | 'CONFIRMING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

// --- Types ---
interface TokenData {
  symbol: string;
  price: number;
  change24h: number;
  logoURI?: string;
  address: string;
}

interface SwipeDiscoverViewProps {
  onToggleView: () => void;
  onStrategySelect: (strategy: any) => void;
  onOverlayChange?: (isActive: boolean) => void;
  focusedStrategyId?: string | null;
}

// --- Components ---

/**
 * ★追加: リアルなカード型のスケルトンローダー（ポーカーディール風アニメーション付き）
 */
const SwipeCardSkeleton = memo(({ index }: { index: number }) => {
  const finalScale = 1 - index * 0.05;
  const finalY = index * 10;
  // デッキ感のための微妙な回転（後ろのカードが少しずれる）
  const finalRotate = index === 1 ? -2 : index === 2 ? 3 : 0;
  // 後ろのカードから順に配られる（ポーカーディール順）
  const dealDelay = (2 - index) * 0.18;

  return (
    <motion.div
      className="absolute inset-0 w-full h-full bg-[#121212] border border-[rgba(184,134,63,0.15)] rounded-[32px] overflow-hidden shadow-2xl flex flex-col p-5 select-none pointer-events-none"
      initial={{
        x: '115%',
        rotate: 22,
        opacity: 0,
        scale: finalScale,
        y: finalY,
      }}
      animate={{
        x: 0,
        rotate: finalRotate,
        opacity: Math.max(0, 1 - index * 0.3),
        scale: finalScale,
        y: finalY,
      }}
      transition={{
        type: 'spring',
        damping: 22,
        stiffness: 160,
        delay: dealDelay,
      }}
      style={{
        zIndex: 100 - index,
        filter: 'grayscale(100%) brightness(0.8)',
      }}
    >
    {/* Header Skeleton */}
    <div className="flex justify-between items-start mb-4">
      <div className="space-y-2">
        <div className="w-16 h-5 bg-white/10 rounded-full animate-pulse" />
        <div className="w-40 h-8 bg-white/10 rounded-lg animate-pulse" />
      </div>
      <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse border border-[rgba(184,134,63,0.08)]" />
    </div>

    {/* Description Skeleton */}
    <div className="space-y-2 mb-6">
      <div className="w-full h-3 bg-white/5 rounded animate-pulse" />
      <div className="w-3/4 h-3 bg-white/5 rounded animate-pulse" />
    </div>

    {/* Stats Grid Skeleton */}
    <div className="grid grid-cols-2 gap-2 mb-4">
      <div className="h-24 bg-white/5 rounded-2xl animate-pulse border border-[rgba(184,134,63,0.08)]" />
      <div className="flex flex-col gap-2 h-24">
        <div className="flex-1 bg-white/5 rounded-xl animate-pulse border border-[rgba(184,134,63,0.08)]" />
        <div className="flex-1 bg-white/5 rounded-xl animate-pulse border border-[rgba(184,134,63,0.08)]" />
      </div>
    </div>

    {/* List Skeleton */}
    <div className="flex-1 space-y-2 mt-2 overflow-hidden">
      <div className="flex justify-between mb-2 px-1">
        <div className="w-24 h-3 bg-white/5 rounded animate-pulse" />
        <div className="w-12 h-3 bg-white/5 rounded animate-pulse" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 bg-white/5 rounded-xl h-14 animate-pulse border border-[rgba(184,134,63,0.08)]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/10" />
            <div className="space-y-1.5">
              <div className="w-12 h-3 bg-white/10 rounded" />
              <div className="w-8 h-2 bg-white/10 rounded" />
            </div>
          </div>
          <div className="w-10 h-4 bg-white/10 rounded" />
        </div>
      ))}
    </div>
    </motion.div>
  );
});

/**
 * CosmicLaunchEffect
 * (変更なし)
 */
const CosmicLaunchEffect = memo(() => {
  const trailCount = 6;
  const particleCount = 18;
  const random = (min: number, max: number) => Math.random() * (max - min) + min;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {Array.from({ length: trailCount }).map((_, i) => {
        const delay = random(0, 0.3);
        const duration = random(0.6, 1.0);
        const startX = -10;
        const endX = 120;
        const startY = 110;
        const endY = -20;
        const width = random(2, 6);

        return (
          <motion.div
            key={`trail-${i}`}
            initial={{ opacity: 0, x: `${startX}vw`, y: `${startY}vh`, rotate: 45 }}
            animate={{
              opacity: [0, 0.8, 0],
              x: [`${startX}vw`, `${endX}vw`],
              y: [`${startY}vh`, `${endY}vh`],
            }}
            transition={{ duration, delay, ease: [0.1, 0, 0.3, 1] }}
            style={{
              position: 'absolute',
              width: `${width}px`,
              height: '30vh',
              background:
                'linear-gradient(to top, transparent, #D4A261, #f97316, #22d3ee, transparent)',
              willChange: 'transform, opacity',
            }}
          />
        );
      })}
      {Array.from({ length: particleCount }).map((_, i) => {
        const delay = random(0, 0.5);
        const duration = random(0.8, 1.6);
        const size = random(2, 5);
        const startX = random(-10, 40);
        const startY = random(80, 120);
        const moveX = random(50, 150);
        const moveY = random(-50, -150);
        const colors = ['#D4A261', '#f97316', '#22d3ee', '#ffffff'];
        const color = colors[Math.floor(random(0, colors.length))];

        return (
          <motion.div
            key={`particle-${i}`}
            initial={{ opacity: 0, x: `${startX}vw`, y: `${startY}vh`, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              x: `${startX + moveX}vw`,
              y: `${startY + moveY}vh`,
              scale: [0, random(1, 1.5), 0],
            }}
            transition={{ duration, delay, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              borderRadius: '50%',
              willChange: 'transform, opacity',
            }}
          />
        );
      })}
      {/* Ambient glow — static gradient, no blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.4, 0] }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full z-[-1]"
        style={{
          background:
            'radial-gradient(circle, rgba(249,115,22,0.3) 0%, rgba(34,211,238,0.15) 40%, transparent 70%)',
        }}
      />
    </div>
  );
});

// --- SwipeToConfirm (Reused from StrategyDetailView) ---
const SwipeToConfirm = memo(
  ({
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

    const textOpacity = useMotionTransform(x, [0, maxDrag * 0.5], [1, 0]);
    const progressWidth = useMotionTransform(
      x,
      [0, maxDrag],
      [HANDLE_SIZE + PADDING * 2, containerWidth]
    );

    // 金額が変更されたらスライダーをリセット
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
  }
);

// --- InvestSheet (SOL-native, Full Screen) ---
interface InvestSheetProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  strategy: any;
  onConfirm: (amount: string, mode: 'BUY' | 'SELL') => Promise<void>;
  status: TransactionStatus;
  /// When true the strategy resolves to an axis-vault ETF and SELL is treated
  /// as a percentage (0..100) of the user's ETF balance. When false the legacy
  /// kagemusha vaultBalance lamports path is used.
  useAxisVault: boolean;
  userEtfBalance: bigint;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const InvestSheet = ({ isOpen, onClose, strategy, onConfirm, status, useAxisVault, userEtfBalance }: InvestSheetProps) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('0');
  const [solBalance, setSolBalance] = useState(0);
  const [vaultBalance, setVaultBalance] = useState(0);

  useEffect(() => {
    if (!publicKey || !isOpen) return;
    const fetchBalances = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setSolBalance(lamports / LAMPORTS_PER_SOL);
      } catch {
        // non-fatal
      }
      try {
        const addr = strategy.address || strategy.vaultAddress;
        if (addr) {
          const pos = await getUserPosition(connection, new PublicKey(addr), publicKey);
          if (pos) setVaultBalance(lamportsToSol(pos.lpShares));
        }
      } catch {
        // no position
      }
    };
    fetchBalances();
  }, [isOpen, publicKey, connection, strategy]);

  useEffect(() => {
    if (isOpen) {
      setAmount('0');
      setMode('BUY');
    }
  }, [isOpen]);

  // axis-vault SELL is a percentage of the user's ETF balance (0..100); legacy
  // SELL is a SOL amount drawn from the user's kagemusha vault position.
  const isSellAxis = mode === 'SELL' && useAxisVault;
  const sellMaxPercent = isSellAxis && userEtfBalance > 0n ? 100 : 0;
  const currentBalance = mode === 'BUY'
    ? solBalance
    : isSellAxis
      ? sellMaxPercent
      : vaultBalance;
  const unitLabel = isSellAxis ? '%' : 'SOL';

  const estimatedOutput = useMemo(() => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return '0.0000';
    return val.toFixed(4);
  }, [amount]);

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
      showToast(isSellAxis ? 'Enter a percentage between 0 and 100' : 'Enter valid amount', 'error');
      return;
    }
    if (isSellAxis) {
      if (userEtfBalance === 0n) {
        showToast('No ETF position to withdraw', 'error');
        return;
      }
      if (val > 100) {
        showToast('Max 100%', 'error');
        return;
      }
    } else if (val > currentBalance) {
      showToast('Insufficient balance', 'error');
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
          <div className="flex items-center justify-between px-6 pt-12 pb-4 shrink-0">
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
              <span className="text-[#78716C] font-normal text-lg">{unitLabel}</span>
            </div>

            <div className="flex items-center gap-2 bg-[#1C1C1E] py-2 px-4 rounded-full border border-white/5 mb-8">
              <Wallet className="w-3.5 h-3.5 text-[#78716C]" />
              <span className="text-[#A8A29E] text-xs font-mono">
                {isSellAxis
                  ? userEtfBalance > 0n
                    ? '100% sellable'
                    : 'No ETF position'
                  : `Available: ${currentBalance.toFixed(4)} ${unitLabel}`}
              </span>
              <button
                onClick={() => {
                  if (isSellAxis) {
                    setAmount(userEtfBalance > 0n ? '100' : '0');
                    return;
                  }
                  const max = mode === 'BUY' ? Math.max(0, solBalance - 0.005) : vaultBalance;
                  setAmount(max.toFixed(4));
                }}
                className="text-[#B8863F] text-xs font-normal uppercase hover:text-white transition-colors"
              >
                Max
              </button>
            </div>

            {amount !== '0' && (
              <div className="absolute bottom-4 flex items-center gap-2 text-sm text-[#78716C]">
                <ArrowDown className="w-4 h-4" />
                <span>
                  {mode === 'BUY'
                    ? `Deposit ${estimatedOutput} SOL into ${strategy.name}`
                    : isSellAxis
                      ? `Burn ${estimatedOutput}% of your ETF position`
                      : `Withdraw ${estimatedOutput} SOL from vault`}
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
                  amount={amount}
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * SuccessOverlay — with Buy Now button
 */
const SuccessOverlay = ({
  strategy,
  onClose,
  onGoToStrategy,
  onBuy,
}: {
  strategy: any;
  onClose: () => void;
  onGoToStrategy: () => void;
  onBuy: () => void;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-black/[0.97] p-6 touch-none overflow-hidden"
    >
      <CosmicLaunchEffect />
      <div className="absolute inset-0 bg-gradient-to-tr from-orange-900/20 via-transparent to-blue-900/20 pointer-events-none" />

      <motion.div
        initial={{ scale: 0.8, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 100, delay: 0.1 }}
        className="relative mb-10 z-20 text-center"
      >
        <h1 className="text-5xl md:text-7xl font-normal text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-yellow-200 to-orange-500 drop-shadow-[0_0_30px_rgba(234,88,12,0.8)] transform -rotate-3 leading-none tracking-tight">
          READY FOR
          <br />
          TAKEOFF
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 50, rotateX: 20 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: 0.3, type: 'spring' }}
        className="w-full max-w-xs bg-[#140E08] rounded-3xl border border-[rgba(184,134,63,0.25)] p-5 mb-8 relative overflow-hidden shadow-2xl z-20"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-500 via-yellow-400 to-cyan-500" />
        <div className="flex items-center gap-4 mb-5 pt-2">
          <div className="relative">
            <img
              src={
                strategy.creatorPfpUrl ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${strategy.creatorAddress}`
              }
              alt="creator"
              className="w-16 h-16 rounded-full border-2 border-[rgba(184,134,63,0.15)] bg-black object-cover"
            />
            <div className="absolute -bottom-2 -right-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-[10px] font-normal px-2 py-0.5 rounded-full border border-[#140E08] shadow-lg flex items-center gap-1">
              ROI {(strategy.roi || 0).toFixed(0)}%
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="font-normal text-white text-xl leading-tight truncate">{strategy.name}</h3>
            <p className="text-xs text-white/40 font-mono mt-1 flex items-center gap-1">
              By {strategy.creatorAddress?.slice(0, 4)}...{strategy.creatorAddress?.slice(-4)}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-hidden pl-1 opacity-90">
          {(strategy.tokens || []).slice(0, 6).map((t: any, i: number) => (
            <div
              key={i}
              className="w-9 h-9 rounded-full bg-black flex items-center justify-center border border-[rgba(184,134,63,0.15)] shadow-lg relative -ml-2 first:ml-0 transition-transform hover:-translate-y-1"
            >
              {t.logoURI ? (
                <img
                  src={t.logoURI}
                  alt={t.symbol}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-[9px] text-white font-normal">{t.symbol?.[0]}</span>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      <div className="flex flex-col gap-3 w-full max-w-xs z-20 safe-area-bottom">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onClick={onBuy}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="group w-full py-4 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-normal text-lg rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center gap-2 relative overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> Buy Now
          </span>
          <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          onClick={onGoToStrategy}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="group w-full py-4 bg-gradient-to-r from-orange-600 to-yellow-600 text-white font-normal text-lg rounded-2xl shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all flex items-center justify-center gap-2 relative overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-2">
            <Rocket className="w-5 h-5 fill-white" /> LFG (View Detail)
          </span>
          <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          onClick={onClose}
          className="w-full py-4 bg-white/5 border border-[rgba(184,134,63,0.15)] text-white/60 font-normal text-lg rounded-2xl hover:bg-white/10 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          Keep Scouting
        </motion.button>
      </div>
    </motion.div>
  );
};

// Module-level: survives React unmount/remount within the same session
let _savedSwipeIndex = 0;

// --- Main View Component ---

export const SwipeDiscoverView = ({
  onToggleView,
  onStrategySelect,
  onOverlayChange,
  focusedStrategyId,
}: SwipeDiscoverViewProps) => {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const axisWallet = useAxisVaultWallet();
  const { connection } = useConnection();
  const { showToast } = useToast();
  const { setVisible: openWalletModal } = useLoginModal();

  const [strategies, setStrategies] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(_savedSwipeIndex);
  const [loading, setLoading] = useState(true);
  const [matchedStrategy, setMatchedStrategy] = useState<any | null>(null);
  const lastSwipeTime = useRef(0);

  const [tokenDataMap, setTokenDataMap] = useState<Record<string, TokenData>>({});
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [tickerMap, setTickerMap] = useState<Record<string, string>>({});

  // InvestSheet state
  const [isInvestOpen, setIsInvestOpen] = useState(false);
  const [investStatus, setInvestStatus] = useState<TransactionStatus>('IDLE');
  const [investTarget, setInvestTarget] = useState<any | null>(null);
  // axis-vault probe for the active investTarget. When non-null deposit/withdraw
  // routes through axis-vault (Deposit/Withdraw) instead of the legacy Jupiter/
  // kagemusha paths.
  const [investEtfState, setInvestEtfState] = useState<PublicKey | null>(null);
  const [investEtfData, setInvestEtfData] = useState<EtfStateData | null>(null);
  const [investUserEtfBalance, setInvestUserEtfBalance] = useState<bigint>(0n);

  useEffect(() => {
    if (!investTarget) {
      setInvestEtfState(null);
      setInvestEtfData(null);
      setInvestUserEtfBalance(0n);
      return;
    }
    const owner = investTarget.ownerPubkey ?? investTarget.owner;
    const name = investTarget.name;
    if (!owner || !name) return;
    let cancelled = false;
    (async () => {
      try {
        const ownerPk = new PublicKey(owner);
        const [pda] = findEtfState(AXIS_VAULT_PROGRAM_ID, ownerPk, name);
        if (cancelled) return;
        setInvestEtfState(pda);
        try {
          const data = await fetchEtfState(connection, pda);
          if (cancelled) return;
          setInvestEtfData(data);
          if (wallet.publicKey) {
            try {
              const ata = getAssociatedTokenAddressSync(data.etfMint, wallet.publicKey, false);
              const bal = await connection.getTokenAccountBalance(ata, 'confirmed');
              if (!cancelled) setInvestUserEtfBalance(BigInt(bal.value.amount));
            } catch {
              if (!cancelled) setInvestUserEtfBalance(0n);
            }
          }
        } catch {
          if (!cancelled) {
            setInvestEtfData(null);
            setInvestUserEtfBalance(0n);
          }
        }
      } catch {
        if (!cancelled) {
          setInvestEtfState(null);
          setInvestEtfData(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [investTarget, connection, wallet.publicKey, investStatus]);

  const dataFetched = useRef(false);
  const appliedFocusRef = useRef<string | null>(null);

  useEffect(() => {
    onOverlayChange?.(matchedStrategy !== null);
  }, [matchedStrategy, onOverlayChange]);

  useEffect(() => {
    if (dataFetched.current) return;
    dataFetched.current = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const [publicRes, myRes, tokensRes] = await Promise.all([
          // 変更点: 引数を50から1000に変更して上限を撤廃
          api.discoverStrategies(1000).catch(() => ({ strategies: [] })),
          publicKey
            ? api.getUserStrategies(publicKey.toBase58()).catch(() => ({ strategies: [] }))
            : Promise.resolve({ strategies: [] }),
          api.getTokens().catch(() => ({ tokens: [] })),
        ]);

        const initialMap: Record<string, TokenData> = {};
        const backendTokens = tokensRes.tokens || [];
        backendTokens.forEach((t: any) => {
          if (t.mint) {
            initialMap[t.mint] = {
              symbol: t.symbol?.toUpperCase() || 'UNKNOWN',
              price: t.price || 0,
              change24h: t.change24h || 0,
              logoURI: t.logoURI,
              address: t.mint,
            };
          }
        });

        const myApiStrats = myRes.strategies || myRes || [];
        const publicStrats = publicRes.strategies || [];
        console.log('[Discover] myApiStrats count:', myApiStrats.length, 'publicStrats count:', publicStrats.length);
        if (myApiStrats.length > 0) {
          console.log('[Discover] myApiStrats[0] fields:', JSON.stringify(Object.keys(myApiStrats[0])));
          console.log('[Discover] myApiStrats[0]:', JSON.stringify(myApiStrats[0]).slice(0, 200));
        }

        // Public strategies first — prevents user's own ETFs from always appearing at the top
        // ただし user version の ownerPubkey を保持するためにマージする
        const combined = [...publicStrats, ...myApiStrats];

        const uniqueMap = new Map<string, any>();
        combined.forEach((item) => {
          const key = item.id || item.address;
          if (!key) return;
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, { ...item });
          } else {
            // 公開版に ownerPubkey/creator がない場合、user版の値をマージ
            const existing = uniqueMap.get(key);
            const merged: any = { ...existing };
            if (!existing.ownerPubkey && item.ownerPubkey) merged.ownerPubkey = item.ownerPubkey;
            if (!existing.creator && item.creator) merged.creator = item.creator;
            uniqueMap.set(key, merged);
          }
        });
        const uniqueStrategies = Array.from(uniqueMap.values());
        setStrategies(uniqueStrategies);

        const allMints = new Set<string>();
        Object.keys(initialMap).forEach((m) => allMints.add(m));

        uniqueStrategies.forEach((s: any) => {
          let tokens = s.tokens || s.composition || [];
          if (typeof tokens === 'string') {
            try {
              tokens = JSON.parse(tokens);
            } catch {}
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
                  address: t.mint,
                };
              }
            }
          });
        });

        const mintArray = Array.from(allMints);
        if (mintArray.length > 0) {
          const [jupPrices, dexData] = await Promise.all([
            JupiterService.getPrices(mintArray).catch(() => ({})) as Promise<
              Record<string, number>
            >,
            DexScreenerService.getMarketData(mintArray).catch(() => ({})) as Promise<
              Record<string, { price: number; change24h: number }>
            >,
          ]);

          mintArray.forEach((mint) => {
            const current = initialMap[mint];
            if (!current) return;
            const price = jupPrices[mint] || dexData[mint]?.price || current.price;
            const change = dexData[mint]?.change24h || current.change24h;
            initialMap[mint] = { ...current, price, change24h: change };
          });
        }

        setTokenDataMap(initialMap);

        const creators = new Set<string>();
        uniqueStrategies.forEach((s: any) => {
          if (s.ownerPubkey) creators.add(s.ownerPubkey);
          if (s.creator) creators.add(s.creator);
        });

        if (creators.size > 0) {
          const creatorArray = Array.from(creators);
          const [users, creatorStrats] = await Promise.all([
            Promise.all(
              creatorArray.map((pubkey) =>
                api
                  .getUser(pubkey)
                  .then((res) => (res.success ? res.user : null))
                  .catch(() => null)
              )
            ),
            Promise.all(
              creatorArray.map((pubkey) =>
                api
                  .getUserStrategies(pubkey)
                  .then((res) => res.strategies || [])
                  .catch(() => [])
              )
            ),
          ]);

          const newUserMap: Record<string, any> = {};
          users.forEach((user) => {
            if (user && user.pubkey) newUserMap[user.pubkey] = user;
          });
          setUserMap(newUserMap);

          // /discover はtickerを返さないため、getUserStrategiesから補完
          const newTickerMap: Record<string, string> = {};
          creatorStrats.flat().forEach((s: any) => {
            if (s.id && s.ticker) newTickerMap[s.id] = s.ticker;
          });
          setTickerMap(newTickerMap);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [publicKey]);

  const enrichedStrategies = useMemo(() => {
    return strategies.map((s) => {
      let tokens = s.tokens || s.composition || [];
      if (typeof tokens === 'string') {
        try {
          tokens = JSON.parse(tokens);
        } catch (e) {
          tokens = [];
        }
      }

      const enrichedTokens = tokens.map((t: any) => {
        const tokenData = t.mint ? tokenDataMap[t.mint] : null;
        return {
          ...t,
          symbol: t.symbol?.toUpperCase(),
          currentPrice: tokenData?.price || 0,
          change24h: tokenData?.change24h || 0,
          logoURI: t.logoURI || tokenData?.logoURI || null,
          address: t.mint || null,
        };
      });

      let weightedSum = 0;
      let totalWeight = 0;
      enrichedTokens.forEach((t: any) => {
        const w = Number(t.weight) || 0;
        const change = Number(t.change24h) || 0;
        weightedSum += change * w;
        totalWeight += w;
      });
      const calculatedRoi = totalWeight > 0 ? weightedSum / totalWeight : 0;

      const ownerAddress = s.ownerPubkey || s.creator;
      const userProfile = userMap[ownerAddress];

      return {
        ...s,
        id: s.address || s.pubkey || s.id,
        name: s.name || 'Untitled Strategy',
        ticker: s.ticker || tickerMap[s.id] || '',
        type: s.type || 'BALANCED',
        tokens: enrichedTokens,
        roi: calculatedRoi,
        tvl: Number(s.tvl || 0),
        creatorAddress: ownerAddress || 'Unknown',
        creatorPfpUrl: userProfile?.avatar_url ? api.getProxyUrl(userProfile.avatar_url) : null,
        description: s.description || userProfile?.bio || '',
        createdAt: s.createdAt || Date.now() / 1000,
        mintAddress: s.mintAddress || null,
        vaultAddress: s.vaultAddress || null,
      };
    });
  }, [strategies, tokenDataMap, userMap, tickerMap]);

  // focusedStrategyId が指定されたら、enrichedStrategies 確定後に最前面へ移動
  useEffect(() => {
    if (!focusedStrategyId || focusedStrategyId === appliedFocusRef.current) return;
    if (enrichedStrategies.length === 0) return;

    console.log('[Focus] focusedStrategyId:', focusedStrategyId);
    console.log('[Focus] enrichedStrategies count:', enrichedStrategies.length);
    console.log('[Focus] publicKey:', publicKey?.toBase58());
    console.log('[Focus] sample ids:', enrichedStrategies.slice(0, 3).map(s => ({
      id: s.id, address: s.address, ownerPubkey: s.ownerPubkey, creator: s.creator, creatorAddress: s.creatorAddress
    })));

    // 複数フィールドで一致を試みる（IDフォーマットの揺れに対応）
    let idx = enrichedStrategies.findIndex((s) =>
      s.id === focusedStrategyId ||
      s.address === focusedStrategyId ||
      s.mintAddress === focusedStrategyId ||
      s.pubkey === focusedStrategyId
    );
    console.log('[Focus] exact match idx:', idx);

    // フォールバック: 現在のユーザーが作成した最新のストラテジーを先頭へ
    if (idx < 0 && publicKey) {
      const ownerStr = publicKey.toBase58();
      const mine = enrichedStrategies
        .map((s, i) => ({ s, i }))
        .filter(({ s }) =>
          s.ownerPubkey === ownerStr ||
          s.creator === ownerStr ||
          s.creatorAddress === ownerStr
        );
      console.log('[Focus] fallback mine count:', mine.length);
      if (mine.length > 0) {
        mine.sort((a, b) => (b.s.createdAt || 0) - (a.s.createdAt || 0));
        idx = mine[0].i;
        console.log('[Focus] fallback idx:', idx, 'strategy:', mine[0].s.name);
      }
    }

    if (idx >= 0) {
      _savedSwipeIndex = idx;
      setCurrentIndex(idx);
      appliedFocusRef.current = focusedStrategyId;
      console.log('[Focus] setCurrentIndex:', idx);
    } else {
      console.log('[Focus] no match found — strategy not in list yet?');
    }
  }, [focusedStrategyId, enrichedStrategies, publicKey]);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right', strategy: any) => {
      if (matchedStrategy) return;
      // Ref-based debounce to prevent same-frame double triggers
      const now = Date.now();
      if (now - lastSwipeTime.current < 50) return;
      lastSwipeTime.current = now;
      setCurrentIndex((prev) => {
        const next = prev + 1;
        _savedSwipeIndex = next;
        return next;
      });
      if (direction === 'right') {
        setMatchedStrategy(strategy);
      }
    },
    [matchedStrategy]
  );

  const handleGoToStrategy = () => {
    if (matchedStrategy) {
      onStrategySelect(matchedStrategy);
      setMatchedStrategy(null);
    }
  };

  const handleCloseMatch = () => {
    setMatchedStrategy(null);
  };

  const handleBuyFromOverlay = () => {
    if (!matchedStrategy) return;
    if (!publicKey) {
      showToast('Connect your wallet first', 'info');
      openWalletModal(true);
      return;
    }
    setInvestTarget(matchedStrategy);
    setIsInvestOpen(true);
  };

  const handleDeposit = async (amountStr: string, mode: 'BUY' | 'SELL' = 'BUY') => {
    if (!wallet.publicKey || !investTarget) {
      showToast('Connect your wallet first', 'info');
      openWalletModal(true);
      return;
    }

    const targetAddressStr =
      investTarget.address || investTarget.vaultAddress || investTarget.ownerPubkey || null;
    if (!targetAddressStr) {
      showToast('Strategy address not found', 'error');
      return;
    }

    // Routing precedence:
    // 1. axis-vault ETF (real per-strategy mint + program-owned vaults) — preferred
    //    once the strategy has an etfState account on-chain.
    // 2. PFMM (legacy "ETF" deploys that are really just a PFMM pool) — Jupiter
    //    SOL→basket on BUY; SELL bounces to detail page (the swipe sheet has no
    //    %-of-basket UI).
    // 3. Kagemusha legacy `depositSol`/`withdrawSol` — last resort.
    const useAxisVault = investEtfState !== null && investEtfData !== null;
    const isPfmm = investTarget?.config?.protocol === 'pfda-amm-3';
    if (!useAxisVault && isPfmm && mode === 'SELL') {
      showToast('Open the strategy page to manage your PFMM position', 'info');
      return;
    }

    setInvestStatus('SIGNING');
    try {
      const parsedAmount = parseFloat(amountStr);
      if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Invalid amount');

      if (useAxisVault) {
        if (!axisWallet) throw new Error('Wallet not ready');
        if (investEtfData!.paused) throw new Error('ETF is paused by the creator');
        if (mode === 'BUY') {
          const solIn = BigInt(Math.floor(parsedAmount * LAMPORTS_PER_SOL));
          const treasuryEtfAta = getAssociatedTokenAddressSync(
            investEtfData!.etfMint,
            investEtfData!.treasury,
            true,
          );
          const plan = await buildDepositSolPlan({
            conn: connection,
            user: wallet.publicKey,
            programId: AXIS_VAULT_PROGRAM_ID,
            etfName: investEtfData!.name,
            etfState: investEtfState!,
            etfMint: investEtfData!.etfMint,
            treasury: investEtfData!.treasury,
            treasuryEtfAta,
            basketMints: investEtfData!.tokenMints,
            weights: investEtfData!.weightsBps,
            vaults: investEtfData!.tokenVaults,
            solIn,
            minEtfOut: 0n,
            existingEtfTotalSupply: investEtfData!.totalSupply,
            maxAccounts: 14,
          });
          setInvestStatus('CONFIRMING');
          let sig = await sendVersionedTx(connection, axisWallet, plan.versionedTx);
          if (plan.mode === 'split' && plan.depositTx) {
            setInvestStatus('PROCESSING');
            sig = await sendVersionedTx(connection, axisWallet, plan.depositTx);
          }
          fetch('https://axis-api-mainnet.yusukekikuta-05.workers.dev/trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userPubkey: wallet.publicKey.toBase58(),
              amount: parsedAmount,
              mode,
              strategyId: investTarget.id,
              txSig: sig,
            }),
          }).catch(() => {});
        } else {
          // SELL: parsedAmount is treated as a percentage 0..100 here, mirroring
          // StrategyDetailView. The swipe sheet currently passes a raw number, so
          // we clamp to 100 max and refuse zero.
          const pct = Math.max(0, Math.min(100, parsedAmount));
          if (pct === 0) throw new Error('Enter a percentage between 0 and 100');
          if (investUserEtfBalance === 0n) throw new Error('No ETF position to withdraw');
          const burnAmount = (investUserEtfBalance * BigInt(Math.floor(pct * 100))) / 10_000n;
          if (burnAmount === 0n) throw new Error('Withdraw amount rounds to zero');
          const plan = await buildWithdrawSolPlan({
            conn: connection,
            user: wallet.publicKey,
            programId: AXIS_VAULT_PROGRAM_ID,
            etfState: investEtfState!,
            etfStateData: investEtfData!,
            burnAmount,
            maxAccounts: 14,
          });
          setInvestStatus('CONFIRMING');
          let sig = await sendVersionedTx(connection, axisWallet, plan.versionedTx);
          if (plan.mode === 'split' && plan.swapTx) {
            setInvestStatus('PROCESSING');
            sig = await sendVersionedTx(connection, axisWallet, plan.swapTx);
          }
          fetch('https://axis-api-mainnet.yusukekikuta-05.workers.dev/trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userPubkey: wallet.publicKey.toBase58(),
              amount: Number(plan.expectedSolOut) / LAMPORTS_PER_SOL,
              mode,
              strategyId: investTarget.id,
              txSig: sig,
            }),
          }).catch(() => {});
        }
      } else if (isPfmm) {
        if (!axisWallet) throw new Error('Wallet not ready');
        const tokens = (investTarget.tokens || []) as Array<{
          mint?: string;
          address?: string;
          weight?: number;
        }>;
        if (tokens.length === 0) throw new Error('Strategy basket not loaded');
        const basketMints = tokens.map(
          (t) => new PublicKey((t.mint || t.address) as string)
        );
        const weights = tokens.map((t) => Math.max(0, Math.round((t.weight ?? 0) * 100)));
        const sum = weights.reduce((a, b) => a + b, 0);
        if (sum === 0) {
          const even = Math.floor(10_000 / Math.max(1, weights.length));
          for (let i = 0; i < weights.length; i++) weights[i] = even;
          weights[weights.length - 1] += 10_000 - even * weights.length;
        } else if (sum !== 10_000) {
          weights[weights.length - 1] += 10_000 - sum;
        }
        const solIn = BigInt(Math.floor(parsedAmount * LAMPORTS_PER_SOL));
        const plan = await buildJupiterSolSeedPlan({
          conn: connection,
          user: wallet.publicKey,
          outputMints: basketMints,
          weights,
          solIn,
          slippageBps: 50,
          maxAccounts: 14,
          closeWsolAtEnd: true,
        });
        setInvestStatus('CONFIRMING');
        const sig = await sendVersionedTx(connection, axisWallet, plan.versionedTx);
        setInvestStatus('PROCESSING');
        fetch('https://axis-api-mainnet.yusukekikuta-05.workers.dev/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPubkey: wallet.publicKey.toBase58(),
            amount: parsedAmount,
            mode,
            strategyId: investTarget.id,
            txSig: sig,
          }),
        }).catch(() => {});
      } else {
        const strategyPubkey = new PublicKey(targetAddressStr.trim());
        const amountLamports = solToLamports(parsedAmount);
        if (mode === 'BUY') {
          await depositSol(connection, wallet, strategyPubkey, amountLamports);
        } else {
          await withdrawSol(connection, wallet, strategyPubkey, amountLamports);
        }
        setInvestStatus('PROCESSING');
        void api
          .syncUserStats(wallet.publicKey!.toBase58(), 0, parsedAmount, investTarget.id)
          .catch(() => {});
      }

      setTimeout(() => {
        setInvestStatus('SUCCESS');
        const targetName = investTarget?.name ? ` ${investTarget.name}` : ' vault';
        showToast(
          mode === 'BUY'
            ? `Deposited ${parsedAmount} SOL into${targetName}`
            : `Withdrew ${parsedAmount} SOL from vault`,
          'success'
        );
        setTimeout(() => {
          setIsInvestOpen(false);
          setMatchedStrategy(null);
          setTimeout(() => {
            setInvestStatus('IDLE');
            setInvestTarget(null);
          }, 500);
        }, 2000);
      }, 1500);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Transaction Failed', 'error');
      setInvestStatus('ERROR');
      setTimeout(() => setInvestStatus('IDLE'), 2000);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentStrategy = enrichedStrategies[currentIndex];
      if (!currentStrategy || matchedStrategy) return;
      if (e.key === 'ArrowLeft') handleSwipe('left', currentStrategy);
      else if (e.key === 'ArrowRight') handleSwipe('right', currentStrategy);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, enrichedStrategies, handleSwipe, matchedStrategy]);

  // ★修正: ローディング画面をスケルトンカードに変更
  if (loading) {
    return (
      <div className="relative w-full h-[100dvh] bg-[#030303] overflow-hidden flex flex-col">
        <div className="flex-1 w-full flex items-center justify-center px-4 pb-36 pt-12 md:pb-24 relative">
          <div className="relative w-full max-w-sm h-full max-h-[78vh] md:max-h-[600px] z-10">
            {/* スケルトンを3枚スタック表示 */}
            {[0, 1, 2].map((i) => (
              <SwipeCardSkeleton key={i} index={i} />
            ))}

            {/* 中央のローディングインジケーター */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-50">
              <div className="bg-[#080503]/80 backdrop-blur-xl p-6 rounded-3xl border border-[rgba(184,134,63,0.15)] shadow-2xl flex flex-col items-center">
                <Loader2 className="w-8 h-8 text-[#B8863F] animate-spin mb-3" />
                <p className="text-xs font-normal text-white/50 tracking-widest animate-pulse">
                  SCOUTING GEMS...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentStrategy = enrichedStrategies[currentIndex];

  if (enrichedStrategies.length === 0) {
    return (
      <div className="relative w-full h-[100dvh] bg-[#030303] flex flex-col items-center justify-center p-4">
        <h3 className="text-xl font-normal text-white mb-2">No Strategies Found</h3>
        <p className="text-white/50 text-sm">Create one to get started.</p>
      </div>
    );
  }

  if (currentIndex >= enrichedStrategies.length) {
    return (
      <div className="relative w-full h-[100dvh] bg-[#030303] flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-[#140E08] rounded-full flex items-center justify-center mx-auto mb-6 border border-[rgba(184,134,63,0.15)]">
            <Sparkles className="w-8 h-8 text-[#B8863F]" />
          </div>
          <h3 className="text-xl font-normal text-white mb-2">That's all for now!</h3>
          <button
            onClick={() => { _savedSwipeIndex = 0; setCurrentIndex(0); }}
            className="px-6 py-3 bg-[#B8863F] text-white font-normal rounded-xl flex items-center gap-2 mx-auto mt-4"
          >
            <RefreshCw className="w-4 h-4" /> Start Over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-[#030303] overflow-hidden flex flex-col">
      <AnimatePresence>
        {matchedStrategy && (
          <SuccessOverlay
            strategy={matchedStrategy}
            onClose={handleCloseMatch}
            onGoToStrategy={handleGoToStrategy}
            onBuy={handleBuyFromOverlay}
          />
        )}
      </AnimatePresence>

      <div className="flex-1 w-full flex items-center justify-center px-4 pb-36 pt-12 md:pb-24 relative">
        {/* Left Button (Pass) */}
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
          whileTap={{ scale: 0.9 }}
          onClick={() => currentStrategy && handleSwipe('left', currentStrategy)}
          disabled={!!matchedStrategy}
          className="hidden md:flex absolute left-8 lg:left-20 xl:left-32 z-30 w-16 h-16 rounded-full border border-[rgba(184,134,63,0.15)] bg-[#140E08]/50 backdrop-blur-md text-white/40 hover:text-red-500 hover:border-red-500/50 transition-colors items-center justify-center shadow-lg"
        >
          <X className="w-8 h-8" />
        </motion.button>

        {/* Card Stack */}
        <div className="relative w-full max-w-sm h-full max-h-[78vh] md:max-h-[600px] z-10">
          <AnimatePresence>
            {enrichedStrategies
              .slice(currentIndex, currentIndex + 3)
              .reverse()
              .map((strategy, i) => {
                const stackIndex =
                  enrichedStrategies.slice(currentIndex, currentIndex + 3).length - 1 - i;
                return (
                  <SwipeCard
                    key={strategy.id}
                    index={stackIndex}
                    isTop={stackIndex === 0}
                    strategy={strategy}
                    onSwipeLeft={() => handleSwipe('left', strategy)}
                    onSwipeRight={() => handleSwipe('right', strategy)}
                    onTap={() => onStrategySelect(strategy)}
                    onSwipeDown={onToggleView}
                  />
                );
              })}
          </AnimatePresence>
        </div>

        {/* Right Button (Like) */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
          whileTap={{ scale: 0.9 }}
          onClick={() => currentStrategy && handleSwipe('right', currentStrategy)}
          disabled={!!matchedStrategy}
          className="hidden md:flex absolute right-8 lg:right-20 xl:right-32 z-30 w-16 h-16 rounded-full border border-[rgba(184,134,63,0.15)] bg-[#140E08]/50 backdrop-blur-md text-white/40 hover:text-emerald-400 hover:border-emerald-400/50 transition-colors items-center justify-center shadow-lg"
        >
          <Rocket className="w-8 h-8" />
        </motion.button>
      </div>

      {investTarget && (
        <InvestSheet
          isOpen={isInvestOpen}
          onClose={() => {
            setIsInvestOpen(false);
            setTimeout(() => {
              setInvestStatus('IDLE');
              setInvestTarget(null);
            }, 300);
          }}
          strategy={investTarget}
          onConfirm={handleDeposit}
          status={investStatus}
          useAxisVault={investEtfState !== null && investEtfData !== null}
          userEtfBalance={investUserEtfBalance}
        />
      )}
    </div>
  );
};