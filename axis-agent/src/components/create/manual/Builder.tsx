import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ArrowLeft,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  Percent,
  X,
  Sparkles,
  Plus,
  Star,
  ClipboardPaste,
  Minus,
} from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TokenImage } from '../../common/TokenImage';
import { WeightControl } from './WeightControl';
import { TabSelector } from './TabSelector';
import { PredictionEventCard } from './PredictionEventCard';
import { StockTokenCard } from './StockTokenCard';
import { formatCompactUSD, abbreviateAddress } from '../../../utils/formatNumber';
import type { JupiterToken } from '../../../services/jupiter';
import type { AssetItem, BuilderProps } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

const STEP_AMOUNT = 1;

// ─── Mobile: Weight Control ───────────────────────────────────────────────────
const MobileWeightControl = memo(
  ({
    value,
    onChange,
    totalWeight,
  }: {
    value: number;
    onChange: (v: number) => void;
    totalWeight: number;
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value.toString());
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (!isEditing) setInputValue(value.toString());
    }, [value, isEditing]);

    const handleChange = (newValue: number) => {
      onChange(Math.max(0, Math.min(100, newValue)));
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    };

    const handleInputBlur = () => {
      setIsEditing(false);
      const parsed = parseInt(inputValue);
      if (!isNaN(parsed)) handleChange(parsed);
      else setInputValue(value.toString());
    };

    const isOverLimit = totalWeight > 100;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative h-12 flex items-center">
            <div className="absolute inset-x-0 h-3 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${isOverLimit ? 'bg-red-500' : 'bg-gradient-to-r from-amber-500 to-amber-300'}`}
                animate={{ width: `${Math.min(100, value)}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={value}
              onChange={(e) => handleChange(parseInt(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
              animate={{ left: `calc(${Math.min(100, value)}% - 14px)` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div
                className={`w-7 h-7 rounded-full border-2 shadow-lg ${isOverLimit ? 'bg-red-500 border-red-400' : 'bg-amber-400 border-amber-300'}`}
              />
            </motion.div>
          </div>

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={handleInputBlur}
              onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
              className={`w-20 h-12 bg-black/50 border-2 rounded-xl text-center text-xl font-bold outline-none ${isOverLimit ? 'border-red-500 text-red-400' : 'border-amber-400 text-white'}`}
              style={{ fontFamily: '"Times New Roman", serif' }}
              maxLength={3}
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                setIsEditing(true);
                setInputValue(value.toString());
              }}
              className={`w-20 h-12 rounded-xl font-bold text-xl transition-all active:scale-95 ${isOverLimit ? 'bg-red-500/20 text-red-400' : 'bg-amber-900/30 text-amber-400'}`}
              style={{ fontFamily: '"Times New Roman", serif' }}
            >
              {value}%
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {[10, 25, 50].map((qv) => (
            <button
              key={qv}
              onClick={() => handleChange(qv)}
              className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all active:scale-95 ${value === qv ? 'btn-glass-gold' : 'btn-glass text-white/50'}`}
            >
              {qv}%
            </button>
          ))}
          <div className="w-2" />
          <button
            onClick={() => handleChange(value - STEP_AMOUNT)}
            disabled={value <= 0}
            className="w-12 h-11 rounded-xl bg-white/5 flex items-center justify-center text-white/50 active:bg-red-500/20 active:text-red-400 disabled:opacity-30 transition-all active:scale-95"
          >
            <Minus size={20} />
          </button>
          <button
            onClick={() => handleChange(value + STEP_AMOUNT)}
            disabled={value >= 100}
            className="w-12 h-11 rounded-xl bg-white/5 flex items-center justify-center text-white/50 active:bg-green-500/20 active:text-green-400 disabled:opacity-30 transition-all active:scale-95"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    );
  }
);

// ─── Mobile: Token List Item ──────────────────────────────────────────────────
const MobileTokenListItem = memo(
  ({
    token,
    isSelected,
    hasSelection,
    onSelect,
    isFavorite,
    onToggleFavorite,
  }: {
    token: JupiterToken;
    isSelected: boolean;
    hasSelection: boolean;
    onSelect: () => void;
    isFavorite?: boolean;
    onToggleFavorite?: () => void;
  }) => (
    <motion.button
      disabled={isSelected}
      onClick={onSelect}
      initial={{ x: 0, opacity: 1 }}
      animate={{ x: 0, opacity: isSelected ? 1 : hasSelection ? 0.6 : 1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`w-full flex items-center gap-2.5 p-3 rounded-2xl transition-colors min-h-[64px] ${isSelected ? 'bg-gradient-to-r from-amber-950/60 to-amber-900/40 border border-amber-800/40' : 'bg-transparent active:bg-white/5'}`}
    >
      {onToggleFavorite && (
        <div
          role="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className="flex-none w-5 flex items-center justify-center"
        >
          <Star
            size={13}
            className={`transition-colors ${isFavorite ? 'text-amber-500 fill-amber-500' : 'text-white/15'}`}
          />
        </div>
      )}
      <div className="relative flex-none">
        <TokenImage src={token.logoURI} className="w-10 h-10 rounded-full bg-white/10" />
        {token.isVerified && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-[#0a0a0a]">
            <Check size={9} className="text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className={`font-bold text-sm ${isSelected ? 'text-amber-400' : 'text-white'}`}>
            {token.symbol}
          </span>
          {token.tags?.includes('meme') && <Sparkles size={10} className="text-pink-400" />}
          {token.tags?.includes('stable') && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">
              Stable
            </span>
          )}
        </div>
        <div className="text-[11px] text-white/30 truncate mt-0.5">
          {token.name}
          <span className="text-white/15 mx-1">·</span>
          <span className="font-mono text-white/20">{abbreviateAddress(token.address)}</span>
        </div>
      </div>
      {token.balance != null && token.balance > 0 ? (
        <div className="text-right flex-none min-w-[60px]">
          <div className="text-xs font-mono text-white/80">
            {token.balance < 0.001
              ? '<0.001'
              : token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </div>
          <div className="text-[10px] text-white/25">Balance</div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-none">
          <div className="text-right w-[52px]">
            <div className="text-[9px] text-white/25 uppercase leading-none mb-0.5">MC</div>
            <div className="text-[11px] text-white/50 font-mono leading-none">
              {formatCompactUSD(token.marketCap)}
            </div>
          </div>
          <div className="text-right w-[52px]">
            <div className="text-[9px] text-white/25 uppercase leading-none mb-0.5">VOL</div>
            <div className="text-[11px] text-white/50 font-mono leading-none">
              {formatCompactUSD(token.dailyVolume)}
            </div>
          </div>
        </div>
      )}
      <div
        className={`flex-none w-8 h-8 rounded-full flex items-center justify-center ${isSelected ? 'bg-gradient-to-br from-amber-400 to-amber-700' : 'bg-white/5 text-white/30'}`}
      >
        {isSelected ? <Check size={14} className="text-zinc-950" /> : <Plus size={14} />}
      </div>
    </motion.button>
  ),
  (prev, next) =>
    prev.token.address === next.token.address &&
    prev.isSelected === next.isSelected &&
    prev.hasSelection === next.hasSelection &&
    prev.isFavorite === next.isFavorite
);

// ─── Mobile: Asset Card ───────────────────────────────────────────────────────
const MobileAssetCard = memo(
  ({
    item,
    totalWeight,
    onUpdateWeight,
    onRemove,
  }: {
    item: AssetItem;
    totalWeight: number;
    onUpdateWeight: (address: string, value: number) => void;
    onRemove: (address: string) => void;
  }) => (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: -50 }}
      className="relative overflow-hidden rounded-3xl border border-amber-900/20"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#111] to-amber-950/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(180,83,9,0.1),transparent_50%)]" />
      <div className="relative p-5">
        <div className="flex items-center gap-4 mb-5">
          <TokenImage
            src={item.token.logoURI}
            className="w-14 h-14 rounded-full flex-none ring-2 ring-amber-900/30"
          />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white text-lg">{item.token.symbol}</div>
            <div className="text-sm text-white/40 truncate">{item.token.name}</div>
          </div>
          <button
            onClick={() => onRemove(item.token.address)}
            className="w-12 h-12 flex items-center justify-center text-white/30 active:text-red-400 active:bg-red-500/10 rounded-2xl transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <MobileWeightControl
          value={item.weight}
          onChange={(val) => onUpdateWeight(item.token.address, val)}
          totalWeight={totalWeight}
        />
      </div>
    </motion.div>
  )
);

// ─── Desktop: Token List Item ─────────────────────────────────────────────────
const DesktopTokenListItem = ({
  token,
  isSelected,
  onSelect,
  isFavorite,
  onToggleFavorite,
}: {
  token: JupiterToken;
  isSelected: boolean;
  onSelect: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) => (
  <button
    disabled={isSelected}
    onClick={onSelect}
    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all group ${
      isSelected ? 'bg-amber-950/40 border border-amber-800/30 cursor-default' : 'hover:bg-white/5'
    }`}
  >
    {onToggleFavorite && (
      <div
        role="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className="flex-none w-5 flex items-center justify-center"
      >
        <Star
          size={12}
          className={`transition-colors ${isFavorite ? 'text-amber-500 fill-amber-500' : 'text-white/15 group-hover:text-white/25'}`}
        />
      </div>
    )}
    <div className="relative flex-none">
      <TokenImage src={token.logoURI} className="w-9 h-9 rounded-full bg-white/10" />
      {token.isVerified && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-[#0a0a0a]">
          <Check size={8} className="text-white" />
        </div>
      )}
    </div>
    <div className="flex-1 min-w-0 text-left">
      <div className="flex items-center gap-1.5">
        <span className={`font-bold text-sm ${isSelected ? 'text-amber-400' : 'text-white'}`}>
          {token.symbol}
        </span>
        {token.tags?.includes('meme') && <Sparkles size={10} className="text-pink-400" />}
        {token.tags?.includes('stable') && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">
            Stable
          </span>
        )}
      </div>
      <div className="text-[11px] text-white/30 truncate">
        {token.name}
        <span className="text-white/15 mx-1">·</span>
        <span className="font-mono text-white/20">{abbreviateAddress(token.address)}</span>
      </div>
    </div>
    {token.balance != null && token.balance > 0 ? (
      <div className="text-right flex-none min-w-[60px]">
        <div className="text-xs font-mono text-white/80">
          {token.balance < 0.001
            ? '<0.001'
            : token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </div>
        <div className="text-[10px] text-white/25">Balance</div>
      </div>
    ) : (
      <div className="flex items-center gap-2 flex-none">
        <div className="text-right w-[50px]">
          <div className="text-[9px] text-white/25 uppercase leading-none mb-0.5">MC</div>
          <div className="text-[11px] text-white/50 font-mono leading-none">
            {formatCompactUSD(token.marketCap)}
          </div>
        </div>
        <div className="text-right w-[50px]">
          <div className="text-[9px] text-white/25 uppercase leading-none mb-0.5">VOL</div>
          <div className="text-[11px] text-white/50 font-mono leading-none">
            {formatCompactUSD(token.dailyVolume)}
          </div>
        </div>
      </div>
    )}
    <div
      className={`flex-none w-7 h-7 rounded-full flex items-center justify-center ${
        isSelected
          ? 'bg-gradient-to-br from-amber-400 to-amber-700'
          : 'bg-white/5 text-white/30 group-hover:text-white/50'
      }`}
    >
      {isSelected ? <Check size={12} className="text-zinc-950" /> : <Plus size={12} />}
    </div>
  </button>
);

// ─── Desktop: Asset Card ──────────────────────────────────────────────────────
const DesktopAssetCard = ({
  item,
  totalWeight,
  onUpdateWeight,
  onRemove,
}: {
  item: AssetItem;
  totalWeight: number;
  onUpdateWeight: (address: string, value: number) => void;
  onRemove: (address: string) => void;
}) => (
  <div className="relative overflow-hidden rounded-2xl border border-amber-900/20 bg-gradient-to-br from-[#0a0a0a] via-[#111] to-amber-950/10">
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <TokenImage
          src={item.token.logoURI}
          className="w-10 h-10 rounded-full flex-none ring-1 ring-amber-900/30"
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm">{item.token.symbol}</div>
          <div className="text-xs text-white/40 truncate">{item.token.name}</div>
        </div>
        <button
          onClick={() => onRemove(item.token.address)}
          className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <WeightControl
        value={item.weight}
        onChange={(val) => onUpdateWeight(item.token.address, val)}
        totalWeight={totalWeight}
      />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MobileBuilder
// ─────────────────────────────────────────────────────────────────────────────
export const MobileBuilder = ({ dashboard, preferences, onBack }: BuilderProps) => {
  const {
    portfolio,
    searchQuery,
    setSearchQuery,
    isLoading,
    totalWeight,
    selectedIds,
    hasSelection,
    isValidAllocation,
    sortedVisibleTokens,
    groupedPredictions,
    handleAnimationComplete,
    removeToken,
    updateWeight,
    distributeEvenly,
    triggerHaptic,
    handleToIdentity,
    activeTab,
    setActiveTab,
    flyingToken,
    flyingCoords,
  } = dashboard;

  const { publicKey } = useWallet();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const mobileScrollRef = useRef<HTMLDivElement>(null);

  const mobileVirtualizer = useVirtualizer({
    count: sortedVisibleTokens.length,
    getScrollElement: () => mobileScrollRef.current,
    estimateSize: () => 68,
    overscan: 5,
  });

  const handleToIdentityMobile = useCallback(() => {
    setIsSelectorOpen(false);
    handleToIdentity();
  }, [handleToIdentity]);

  const handleTokenSelect = useCallback(
    (token: JupiterToken) => {
      try {
        preferences.addToSearchHistory({
          address: token.address,
          symbol: token.symbol,
          logoURI: token.logoURI,
        });
        dashboard.addTokenDirect(token);
        triggerHaptic();
        setIsSelectorOpen(false);
        setSearchQuery('');
      } catch (e) {
        console.error('Selection Error:', e);
        setIsSelectorOpen(false);
      }
    },
    [dashboard, triggerHaptic, preferences, setSearchQuery]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchQuery) setSearchQuery('');
        else setIsSelectorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, setSearchQuery]);

  const handlePasteCA = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length >= 32) setSearchQuery(text.trim());
    } catch { /* clipboard denied */ }
  }, [setSearchQuery]);

  useEffect(() => {
    if (portfolio.length === 0 && !isSelectorOpen) setIsSelectorOpen(true);
  }, []);

  return (
    <div className="absolute inset-0 bg-[#030303] flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="absolute top-0 left-0 right-0 z-30 bg-[#030303]/90 backdrop-blur-md border-b border-white/5 safe-area-top"
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={onBack}
            className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center active:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <button
            onClick={() => setIsSelectorOpen(true)}
            className="btn-glass-gold w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          >
            <Plus size={20} />
          </button>
        </div>
      </motion.div>

      {/* Scrollable Content */}
      <div className="absolute inset-0 overflow-y-auto custom-scrollbar z-0">
        <div className="h-[64px] safe-area-top" />

        {/* Stats Header */}
        <div className="sticky top-0 z-20 bg-[#030303]/95 border-b border-white/5 backdrop-blur-sm shadow-lg shadow-black/20 px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div
              className={`relative w-16 h-16 rounded-2xl flex flex-col items-center justify-center overflow-hidden border ${
                totalWeight === 100
                  ? 'bg-emerald-900/20 border-emerald-500/30'
                  : totalWeight > 100
                    ? 'bg-red-900/20 border-red-500/30'
                    : 'bg-amber-900/10 border-amber-500/20'
              }`}
            >
              <span
                className={`text-2xl font-bold ${
                  totalWeight === 100 ? 'text-emerald-400' : totalWeight > 100 ? 'text-red-400' : 'text-amber-500'
                }`}
              >
                {totalWeight}
              </span>
              <span className="text-[10px] text-white/40 -mt-1">%</span>
            </div>
            <div>
              <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Allocation</div>
              <div className="text-sm font-medium mt-0.5">
                {totalWeight === 100 ? (
                  <span className="text-emerald-400 flex items-center gap-1"><Check size={14} /> Ready</span>
                ) : totalWeight > 100 ? (
                  <span className="text-red-400">Over limit</span>
                ) : (
                  <span className="text-amber-500/80">{100 - totalWeight}% remaining</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {portfolio.length >= 2 && (
              <button
                onClick={distributeEvenly}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-white/5 text-white/70 active:bg-white/10 transition-colors"
              >
                <Percent size={12} /> Equal
              </button>
            )}
            <div className="text-xs text-white/30 font-mono">
              {portfolio.length} Asset{portfolio.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Portfolio List */}
        <div className="p-4 space-y-3 pb-40">
          <AnimatePresence>
            {totalWeight > 100 && (
              <motion.div
                key="error-banner"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium mb-2"
              >
                <AlertCircle size={16} />
                <span>Allocation exceeds 100%</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout">
            {portfolio.map((item) => (
              <MobileAssetCard
                key={item.token.address}
                item={item}
                totalWeight={totalWeight}
                onUpdateWeight={updateWeight}
                onRemove={removeToken}
              />
            ))}
          </AnimatePresence>

          <motion.button
            layout
            onClick={() => setIsSelectorOpen(true)}
            className="w-full py-6 rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-white/30 active:bg-white/5 transition-colors bg-white/[0.02]"
          >
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center shadow-inner">
              <Plus size={24} />
            </div>
            <span className="text-sm font-medium">Tap to add asset</span>
          </motion.button>
        </div>
      </div>

      {/* FAB - Add Token */}
      {!isSelectorOpen && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="fixed bottom-6 right-6 z-40 safe-area-bottom">
          <button
            onClick={() => setIsSelectorOpen(true)}
            className="btn-gold w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform [background:var(--gold-button)] shadow-[var(--glow-sm)]"
          >
            <Plus size={28} />
          </button>
        </motion.div>
      )}

      {/* Next Step FAB */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] z-30 pointer-events-none">
        <AnimatePresence>
          {isValidAllocation && !isSelectorOpen && (
            <motion.button
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={handleToIdentityMobile}
              className="w-full h-14 btn-gold text-zinc-950 font-bold text-lg rounded-full flex items-center justify-center gap-2 pointer-events-auto active:scale-[0.98] transition-transform [background:var(--gold-button)] shadow-[0_4px_24px_rgba(0,0,0,0.6),var(--glow-sm)]"
            >
              Next Step <ChevronRight size={20} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Token Selector Modal */}
      {isSelectorOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsSelectorOpen(false)}
          />
          <div className="relative w-full max-w-sm px-4 sm:px-6 pointer-events-auto safe-area-bottom safe-area-top">
            <div className="w-full bg-[#121212] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[70vh]">
              <div className="shrink-0 bg-[#121212] border-b border-white/5 p-4 pb-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name or address"
                      className="w-full bg-white/5 border border-white/5 rounded-xl pl-10 pr-10 py-3 text-base text-white placeholder:text-white/30 focus:border-amber-400/40 focus:bg-white/10 outline-none transition-all"
                      autoFocus
                    />
                    {searchQuery ? (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-white/10 text-white/50"
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={handlePasteCA}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white/5 text-white/40 active:text-white"
                      >
                        <ClipboardPaste size={14} />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setIsSelectorOpen(false)}
                    className="p-3 rounded-full bg-white/5 text-white/70 active:bg-white/10 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <TabSelector activeTab={activeTab} setActiveTab={setActiveTab} isWalletConnected={!!publicKey} />
              </div>

              <div ref={mobileScrollRef} className="flex-1 overflow-y-auto bg-[#121212] custom-scrollbar">
                {!searchQuery && preferences.favorites.size > 0 && activeTab !== 'prediction' && (
                  <div className="px-4 py-3 border-b border-white/5">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider font-bold mb-2 block">Starred</span>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                      {dashboard.allTokens
                        .filter((t) => preferences.favorites.has(t.address))
                        .map((token) => (
                          <button
                            key={token.address}
                            onClick={() => handleTokenSelect(token)}
                            className="flex flex-col items-center gap-1.5 min-w-[64px]"
                          >
                            <div className="relative">
                              <TokenImage src={token.logoURI} className="w-12 h-12 rounded-full bg-white/10 border border-white/5" />
                              {selectedIds.has(token.address) && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-[#121212]">
                                  <Check size={10} className="text-white" />
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-white/70 font-medium truncate w-full text-center">{token.symbol}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3">
                    <Loader2 className="w-8 h-8 text-amber-300 animate-spin" />
                    <span className="text-sm text-white/30">Loading tokens...</span>
                  </div>
                ) : activeTab === 'prediction' ? (
                  <div className="px-3 pt-4 pb-10">
                    {groupedPredictions.map((group) => (
                      <PredictionEventCard
                        key={`pred-${group.marketId}`}
                        group={group}
                        isYesSelected={group.yesToken ? selectedIds.has(group.yesToken.address) : false}
                        isNoSelected={group.noToken ? selectedIds.has(group.noToken.address) : false}
                        onSelect={handleTokenSelect}
                      />
                    ))}
                    {groupedPredictions.length === 0 && (
                      <div className="text-center py-20 text-white/20 text-sm">No predictions found</div>
                    )}
                  </div>
                ) : activeTab === 'stock' ? (
                  <div className="px-3 pt-4 pb-10">
                    {sortedVisibleTokens.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 gap-3 text-white/20">
                        <Search size={32} />
                        <span className="text-sm">No stocks found</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {sortedVisibleTokens.map((token) => (
                          <StockTokenCard
                            key={token.address}
                            token={token}
                            isSelected={selectedIds.has(token.address)}
                            onSelect={() => handleTokenSelect(token)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : sortedVisibleTokens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3 text-white/20">
                    <Search size={32} />
                    <span className="text-sm">No tokens found</span>
                  </div>
                ) : (
                  <div style={{ height: `${mobileVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    {mobileVirtualizer.getVirtualItems().map((virtualRow) => {
                      const token = sortedVisibleTokens[virtualRow.index];
                      const isSelected = selectedIds.has(token.address);
                      return (
                        <div
                          key={token.address}
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                        >
                          <div className="px-2 py-1">
                            <MobileTokenListItem
                              token={token}
                              isSelected={isSelected}
                              hasSelection={hasSelection}
                              onSelect={() => handleTokenSelect(token)}
                              isFavorite={preferences.isFavorite(token.address)}
                              onToggleFavorite={() => preferences.toggleFavorite(token.address)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flying Particle */}
      <AnimatePresence>
        {flyingToken && (
          <motion.div
            key="flying-particle"
            initial={{ position: 'fixed', left: flyingCoords?.x, top: flyingCoords?.y, x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
            animate={{ left: '50%', top: '15%', scale: 0.2, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'circOut' }}
            onAnimationComplete={handleAnimationComplete}
            className="z-[100] pointer-events-none"
          >
            <TokenImage
              src={flyingToken.logoURI}
              className="w-12 h-12 rounded-full shadow-xl shadow-amber-400/40 ring-2 ring-amber-400/60"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DesktopBuilder
// ─────────────────────────────────────────────────────────────────────────────
export const DesktopBuilder = ({ dashboard, preferences, onBack }: BuilderProps) => {
  const {
    portfolio,
    searchQuery,
    setSearchQuery,
    isSearching,
    isLoading,
    totalWeight,
    selectedIds,
    hasSelection,
    isValidAllocation,
    sortedVisibleTokens,
    groupedPredictions,
    allTokens,
    activeTab,
    setActiveTab,
    handleToIdentity,
    addTokenDirect,
    removeToken,
    updateWeight,
    distributeEvenly,
  } = dashboard;

  const { publicKey } = useWallet();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sortedVisibleTokens.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchQuery) setSearchQuery('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, setSearchQuery]);

  const handlePasteCA = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length >= 32) setSearchQuery(text.trim());
    } catch { /* clipboard denied */ }
  }, [setSearchQuery]);

  const handleTokenSelect = useCallback(
    (token: JupiterToken) => {
      preferences.addToSearchHistory({ address: token.address, symbol: token.symbol, logoURI: token.logoURI });
      addTokenDirect(token);
    },
    [addTokenDirect, preferences]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-none px-6 py-4 flex items-center justify-between border-b border-white/5 bg-black">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl text-white" style={{ fontFamily: '"Times New Roman", serif' }}>
            Build Strategy
          </h1>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left Panel: Portfolio */}
        <div className="w-[55%] flex flex-col min-h-0 border-r border-white/5">
          <div className="px-6 py-4 flex justify-between items-center border-b border-amber-900/10 bg-gradient-to-r from-[#050505] to-amber-950/5">
            <div className="flex items-center gap-4">
              <div
                className={`relative w-16 h-16 rounded-2xl flex flex-col items-center justify-center overflow-hidden ${
                  totalWeight === 100
                    ? 'bg-gradient-to-br from-emerald-900/50 to-emerald-950/80 ring-1 ring-emerald-700/30'
                    : totalWeight > 100
                      ? 'bg-gradient-to-br from-red-900/50 to-red-950/80 ring-1 ring-red-700/30'
                      : 'bg-gradient-to-br from-amber-900/30 to-[#0a0a0a] ring-1 ring-amber-800/20'
                }`}
              >
                <span
                  className={`text-2xl ${totalWeight === 100 ? 'text-emerald-400' : totalWeight > 100 ? 'text-red-400' : 'text-amber-500'}`}
                  style={{ fontFamily: '"Times New Roman", serif' }}
                >
                  {totalWeight}
                </span>
                <span className="text-[10px] text-white/40 -mt-1">%</span>
              </div>
              <div>
                <div className="text-xs text-amber-700/70 font-medium uppercase tracking-wider">Total</div>
                <div className="text-sm mt-1">
                  {totalWeight === 100 ? (
                    <span className="text-emerald-400 flex items-center gap-1.5"><Check size={14} /> Complete</span>
                  ) : totalWeight > 100 ? (
                    <span className="text-red-400">+{totalWeight - 100}% over</span>
                  ) : (
                    <span className="text-white/50">{100 - totalWeight}% left</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {portfolio.length >= 2 && (
                <button
                  onClick={distributeEvenly}
                  className="btn-glass-gold flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
                >
                  <Percent size={14} /> Equal
                </button>
              )}
              <div className="text-sm text-amber-300/50" style={{ fontFamily: '"Times New Roman", serif' }}>
                {portfolio.length} asset{portfolio.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            <AnimatePresence>
              {totalWeight > 100 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/30 border border-red-900/30 text-red-400 text-sm">
                  <AlertCircle size={18} />
                  <span>Total exceeds 100%</span>
                </div>
              )}
            </AnimatePresence>

            {portfolio.map((item) => (
              <DesktopAssetCard
                key={item.token.address}
                item={item}
                totalWeight={totalWeight}
                onUpdateWeight={updateWeight}
                onRemove={removeToken}
              />
            ))}

            {portfolio.length === 0 && (
              <div className="h-48 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-amber-900/30 flex items-center justify-center bg-amber-950/10">
                  <Plus size={28} className="text-amber-800/50" />
                </div>
                <span className="text-sm text-amber-900/50">Select tokens from the right panel</span>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/5">
            <button
              onClick={handleToIdentity}
              disabled={!isValidAllocation}
              className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
                isValidAllocation
                  ? 'btn-gold text-zinc-950 [background:var(--gold-button)] shadow-[var(--glow-sm)] hover:brightness-110'
                  : 'btn-glass text-white/20 cursor-not-allowed opacity-40'
              }`}
            >
              Next <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Right Panel: Token Selector */}
        <div className="w-[45%] flex flex-col min-h-0 bg-[#0a0a0a]">
          <div className="px-4 py-4 border-b border-white/5">
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-800/50" size={18} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, symbol, or paste address..."
                className="w-full bg-white/[0.04] border border-white/8 rounded-xl pl-11 pr-24 py-3 text-sm focus:border-amber-400/40 focus:bg-white/[0.06] outline-none transition-all placeholder:text-white/20 text-white"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isSearching && <Loader2 className="text-amber-300 animate-spin" size={14} />}
                {searchQuery ? (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10"
                  >
                    <X size={14} className="text-white/40" />
                  </button>
                ) : (
                  <button
                    onClick={handlePasteCA}
                    className="btn-glass-gold flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                  >
                    <ClipboardPaste size={11} /> Paste
                  </button>
                )}
              </div>
            </div>

            {!searchQuery && preferences.searchHistory.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[10px] text-white/25 uppercase tracking-wider font-bold">Recent</span>
                  <button
                    onClick={preferences.clearSearchHistory}
                    className="text-[10px] text-white/30 hover:text-amber-300 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {preferences.searchHistory.map((item) => (
                    <button
                      key={item.address}
                      onClick={() => setSearchQuery(item.symbol !== '?' ? item.symbol : item.address)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 shrink-0 hover:bg-white/10 border border-white/5 transition-colors"
                    >
                      <TokenImage src={item.logoURI} className="w-3.5 h-3.5 rounded-full" />
                      <span className="text-[10px] text-white/60 font-medium">{item.symbol}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <TabSelector activeTab={activeTab} setActiveTab={setActiveTab} isWalletConnected={!!publicKey} />

            <div className="flex justify-between items-center mt-2 px-1">
              <span className="text-xs text-amber-800/40">{allTokens.length.toLocaleString()} tokens</span>
              {hasSelection && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Check size={12} /> {portfolio.length} selected
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0 ml-2">
                <span className="text-[10px] text-white/30 font-bold">Verified</span>
                <div
                  className={`relative w-7 h-4 rounded-full transition-colors ${preferences.verifiedOnly ? 'bg-amber-400' : 'bg-white/10'}`}
                  onClick={() => preferences.setVerifiedOnly(!preferences.verifiedOnly)}
                >
                  <motion.div
                    className="absolute top-[2px] w-3 h-3 rounded-full bg-white shadow-sm"
                    animate={{ left: preferences.verifiedOnly ? 13 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </div>
              </label>
            </div>
          </div>

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-2 pb-4 custom-scrollbar">
            {!searchQuery && preferences.favorites.size > 0 && activeTab !== 'prediction' && activeTab !== 'stock' && (
              <div className="px-2 py-2 mb-1 border-b border-white/5">
                <span className="text-[10px] text-white/25 uppercase tracking-wider font-bold mb-1.5 block px-1">Favorites</span>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {dashboard.allTokens
                    .filter((t) => preferences.favorites.has(t.address))
                    .map((token) => (
                      <button
                        key={token.address}
                        onClick={() => handleTokenSelect(token)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg shrink-0 border transition-colors ${
                          selectedIds.has(token.address)
                            ? 'bg-amber-900/30 border-amber-800/30 opacity-50'
                            : 'bg-white/[0.03] border-white/5 hover:bg-white/10'
                        }`}
                      >
                        <TokenImage src={token.logoURI} className="w-4 h-4 rounded-full" />
                        <span className="text-[10px] text-amber-400 font-bold">{token.symbol}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Loader2 className="w-8 h-8 text-amber-300 animate-spin" />
                <span className="text-sm text-white/30">Loading tokens...</span>
              </div>
            ) : activeTab === 'prediction' ? (
              <div className="px-2 pt-4">
                {groupedPredictions.map((group) => (
                  <PredictionEventCard
                    key={`pred-${group.marketId}`}
                    group={group}
                    isYesSelected={group.yesToken ? selectedIds.has(group.yesToken.address) : false}
                    isNoSelected={group.noToken ? selectedIds.has(group.noToken.address) : false}
                    onSelect={handleTokenSelect}
                  />
                ))}
                {groupedPredictions.length === 0 && (
                  <div className="text-center py-20 text-white/20 text-sm">No predictions found</div>
                )}
              </div>
            ) : activeTab === 'stock' ? (
              <div className="px-2 pt-4">
                {sortedVisibleTokens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-3 text-amber-800/30">
                    <Search size={32} strokeWidth={1.5} />
                    <span className="text-sm">No stocks found</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {sortedVisibleTokens.map((token) => (
                      <StockTokenCard
                        key={token.address}
                        token={token}
                        isSelected={selectedIds.has(token.address)}
                        onSelect={() => handleTokenSelect(token)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : sortedVisibleTokens.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-amber-800/30">
                <Search size={32} strokeWidth={1.5} />
                <span className="text-sm">No tokens found</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 px-3 py-1.5 text-[9px] text-white/20 uppercase tracking-wider">
                  <div className="w-5" />
                  <div className="w-9" />
                  <div className="flex-1">Token</div>
                  <div className="w-[50px] text-right">MC</div>
                  <div className="w-[50px] text-right">VOL</div>
                  <div className="w-7" />
                </div>
                <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const token = sortedVisibleTokens[virtualRow.index];
                    const isSelected = selectedIds.has(token.address);
                    return (
                      <div
                        key={token.address}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <DesktopTokenListItem
                          token={token}
                          isSelected={isSelected}
                          onSelect={() => handleTokenSelect(token)}
                          isFavorite={preferences.isFavorite(token.address)}
                          onToggleFavorite={() => preferences.toggleFavorite(token.address)}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
