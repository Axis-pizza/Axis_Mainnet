import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  Search,
  ArrowLeft,
  ChevronRight,
  Check,

  AlertCircle,
  Percent,
  X,
  Sparkles,
  Plus,
  ClipboardPaste,
  Minus,
  Copy,
  Star,
} from 'lucide-react';
import { useWallet } from '../../../hooks/useWallet';
import { TokenImage } from '../../common/TokenImage';
import { WeightControl } from './WeightControl';
import { TabSelector } from './TabSelector';
import { StockTokenCard } from './StockTokenCard';
import { formatCompactUSD, abbreviateAddress } from '../../../utils/formatNumber';
import type { JupiterToken } from '../../../services/jupiter';
import type { AssetItem, BuilderProps } from './types';
import { PredictionListModal } from './PredictionListModal';
import type { PredictionGroup } from './PredictionEventCard';

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

const STEP_AMOUNT = 1;

// ─── SVG Spinner (replaces Loader2 for all loading states) ───────────────────
const AxisSpinner = ({ size = 32, className = '' }: { size?: number; className?: string }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    className={className}
    animate={{ rotate: 360 }}
    transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
    style={{ display: 'inline-block' }}
  >
    {/* Track */}
    <circle cx="16" cy="16" r="12" stroke="rgba(201,168,76,0.12)" strokeWidth="2.5" />
    {/* Arc */}
    <circle
      cx="16"
      cy="16"
      r="12"
      stroke="url(#axisSpinnerGrad)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="28 48"
    />
    <defs>
      <linearGradient id="axisSpinnerGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#e8ca80" />
        <stop offset="100%" stopColor="#c9a84c" stopOpacity="0.3" />
      </linearGradient>
    </defs>
  </motion.svg>
);

// ─── Brand copper-gold scale (Axis amber palette) ────────────────────────────
// Core: #C77D36 = 18K Rose-Bronze. Light → #F4DFBE. Shadow → #1A0A04.
const AXIS_GOLD = '#C77D36';           // amber-400 — primary accent
const AXIS_GOLD_DIM = '#6B3716';       // amber-700 — shadow / border
const AXIS_GOLD_GLOW = 'rgba(199, 125, 54, ';  // base for rgba glow

// Legend dot colors — amber scale only (unified family)
const PORTFOLIO_COLORS = [
  '#C77D36', // amber-400 — core
  '#D9A05B', // amber-300 — satin copper
  '#E8C28A', // amber-200 — bright lit face
  '#B0652B', // amber-500 — heavy bronze
  '#F4DFBE', // amber-100 — champagne specular
  '#8E4D1F', // amber-600 — deep pressed
  '#6B3716', // amber-700 — shadow edge
  '#4A230F', // amber-800 — reddish void
];

// ─── Mobile: Weight Control ───────────────────────────────────────────────────
const MobileWeightControl = memo(
  ({
    value,
    onChange,
    totalWeight,
    accentColor = '#c9a84c',
    hidePercentage = false,
  }: {
    value: number;
    onChange: (v: number) => void;
    totalWeight: number;
    accentColor?: string;
    hidePercentage?: boolean;
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
    const fillColor = isOverLimit ? '#ef4444' : accentColor;

    return (
      <div className="space-y-2.5">
        {/* Slider */}
        <div className="relative h-10 flex items-center">
          <div className="absolute inset-x-0 h-1.5 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: fillColor, opacity: 0.85 }}
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
            animate={{ left: `calc(${Math.min(100, value)}% - 11px)` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div
              className="w-[22px] h-[22px] rounded-full border-2 shadow-md"
              style={{ backgroundColor: fillColor, borderColor: `${fillColor}bb` }}
            />
          </motion.div>
        </div>

        {/* Quick buttons + stepper + (optional) percentage */}
        <div className="flex items-center gap-1.5">
          {[10, 25, 50].map((qv) => (
            <button
              key={qv}
              onClick={() => handleChange(qv)}
              className="flex-1 h-8 rounded-lg text-xs font-normal transition-all active:scale-95 bg-white/5 text-white/35"
              style={value === qv ? { backgroundColor: `${accentColor}22`, color: accentColor } : {}}
            >
              {qv}%
            </button>
          ))}
          <div className="w-1" />
          <button
            onClick={() => handleChange(value - STEP_AMOUNT)}
            disabled={value <= 0}
            className="w-9 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/35 active:bg-red-500/15 active:text-red-400 disabled:opacity-20 transition-all active:scale-95"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => handleChange(value + STEP_AMOUNT)}
            disabled={value >= 100}
            className="w-9 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/35 active:bg-emerald-500/15 active:text-emerald-400 disabled:opacity-20 transition-all active:scale-95"
          >
            <Plus size={14} />
          </button>

          {/* Percentage input — hidden when card header handles it */}
          {!hidePercentage && (
            <>
              <div className="w-1" />
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={handleInputBlur}
                  onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
                  className="w-14 h-8 bg-black/50 border rounded-lg text-center text-sm font-normal outline-none text-white"
                  style={{ borderColor: fillColor }}
                  maxLength={3}
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => { setIsEditing(true); setInputValue(value.toString()); }}
                  className="w-14 h-8 rounded-lg text-sm font-normal transition-all active:scale-95 bg-white/5"
                  style={{ color: fillColor }}
                >
                  {value}%
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
);

// ─── Mobile: Token Detail Modal ───────────────────────────────────────────────
const TokenDetailModal = ({
  token,
  isSelected,
  onAdd,
  onClose,
}: {
  token: JupiterToken;
  isSelected: boolean;
  onAdd: () => void;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(token.address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [token.address]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
        className="relative w-full bg-[#111] border-t border-white/8 rounded-t-3xl px-5 pt-5 pb-8 safe-area-bottom"
      >
        {/* drag handle */}
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />

        {/* header */}
        <div className="flex items-center gap-3 mb-5">
          <TokenImage src={token.logoURI} className="w-14 h-14 rounded-full bg-white/10 flex-none" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl font-normal text-white">{token.symbol}</span>
              {token.isVerified && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-normal">Verified</span>
              )}
              {token.tags?.includes('meme') && <Sparkles size={13} className="text-pink-400" />}
            </div>
            <div className="text-sm text-white/40 truncate">{token.name}</div>
          </div>
          {isSelected && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-normal flex-none">
              <Check size={12} />Added
            </div>
          )}
        </div>

        {/* CA row */}
        <button
          onClick={handleCopy}
          className="w-full flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 mb-3 active:bg-white/8 transition-colors"
        >
          <div className="flex-1 min-w-0 text-left">
            <div className="text-[10px] text-white/30 uppercase tracking-wide mb-0.5">Contract Address</div>
            <div className="font-mono text-xs text-white/60 truncate">{token.address}</div>
          </div>
          {copied
            ? <Check size={14} className="text-emerald-400 flex-none" />
            : <Copy size={14} className="text-white/25 flex-none" />}
        </button>

        {/* stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { label: 'Market Cap', value: formatCompactUSD(token.marketCap) },
            { label: '24h Volume', value: formatCompactUSD(token.dailyVolume) },
            ...(token.price != null ? [{ label: 'Price', value: `$${token.price < 0.01 ? token.price.toFixed(6) : token.price.toLocaleString()}` }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3">
              <div className="text-[9px] text-white/30 uppercase tracking-wide mb-1">{label}</div>
              <div className="text-sm font-normal text-white">{value ?? '—'}</div>
            </div>
          ))}
        </div>

        {/* add button */}
        {!isSelected && (
          <button
            onClick={() => { onAdd(); onClose(); }}
            className="w-full btn-glass-gold rounded-2xl py-4 font-normal text-base"
          >
            Add to Basket
          </button>
        )}
      </motion.div>
    </div>
  );
};

// ─── FavoriteStar: 星ボタン（タップでくるっと回転）────────────────────────────
const FavoriteStar = memo(function FavoriteStar({
  isFav,
  onToggle,
}: {
  isFav: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const [spinning, setSpinning] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpinning(true);
    onToggle(e);
    setTimeout(() => setSpinning(false), 480);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-9 h-9 flex items-center justify-center rounded-xl flex-none transition-colors ${
        isFav ? 'text-amber-400' : 'text-white/20 active:text-amber-400'
      }`}
    >
      <motion.div
        animate={spinning ? { rotate: 360, scale: [1, 1.5, 1] } : { rotate: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <Star size={15} fill={isFav ? 'currentColor' : 'none'} strokeWidth={2} />
      </motion.div>
    </button>
  );
});

// ─── Mobile: Token List Item (tap = detail, swipe right = add, swipe left = remove) ───
const MobileTokenListItem = memo(
  function MobileTokenListItem({
    token,
    isSelected,
    isFav,
    onAdd,
    onRemove,
    onDetail,
    onToggleFav,
  }: {
    token: JupiterToken;
    isSelected: boolean;
    isFav: boolean;
    onAdd: () => void;
    onRemove?: () => void;
    onDetail: () => void;
    onToggleFav: (e: React.MouseEvent) => void;
  }) {
    const x = useMotionValue(0);
    const THRESHOLD = 64;
    const hasDragged = useRef(false);

    // Hint backgrounds revealed as user drags
    const addOpacity = useTransform(x, [0, THRESHOLD], [0, 1]);
    const removeOpacity = useTransform(x, [-THRESHOLD, 0], [1, 0]);

    const handleDragEnd = (_: PointerEvent, info: { offset: { x: number } }) => {
      const dx = info.offset.x;
      if (dx > THRESHOLD && !isSelected) {
        onAdd();
      } else if (dx < -THRESHOLD && isSelected) {
        onRemove?.();
      }
      // Snap back
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 35 });
    };

    return (
      <div className="relative overflow-hidden rounded-xl">
        {/* Add hint — revealed on right swipe */}
        {!isSelected && (
          <motion.div
            className="absolute inset-0 flex items-center pl-5 rounded-xl pointer-events-none"
            style={{ background: 'rgba(48,164,108,0.18)', opacity: addOpacity }}
          >
            <Plus size={22} className="text-emerald-400" strokeWidth={2.5} />
            <span className="ml-2 text-sm text-emerald-400 font-normal">Add</span>
          </motion.div>
        )}
        {/* Remove hint — revealed on left swipe */}
        {isSelected && (
          <motion.div
            className="absolute inset-0 flex items-center justify-end pr-5 rounded-xl pointer-events-none"
            style={{ background: 'rgba(229,77,46,0.18)', opacity: removeOpacity }}
          >
            <span className="mr-2 text-sm text-red-400 font-normal">Remove</span>
            <Minus size={22} className="text-red-400" strokeWidth={2.5} />
          </motion.div>
        )}

        {/* Draggable row — onTap fires only when not dragging */}
        <motion.div
          drag="x"
          dragConstraints={{
            left: isSelected ? -THRESHOLD * 1.6 : 0,
            right: isSelected ? 0 : THRESHOLD * 1.6,
          }}
          dragElastic={0.12}
          dragMomentum={false}
          dragDirectionLock
          style={{ x, touchAction: 'pan-y' }}
          onPointerDown={() => { hasDragged.current = false; }}
          onDragStart={() => { hasDragged.current = true; }}
          onTap={() => { if (!hasDragged.current) onDetail(); }}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[64px] ${
            isSelected
              ? 'bg-gradient-to-r from-amber-950/60 to-amber-900/30 border border-amber-800/35'
              : 'bg-[#181818]'
          }`}
        >
          {/* Logo */}
          <div className="w-10 h-10 rounded-full bg-amber-900/25 flex items-center justify-center relative overflow-hidden flex-none">
            <span className="absolute text-[14px] font-normal text-amber-400/40 select-none">
              {token.symbol.charAt(0)}
            </span>
            <TokenImage src={token.logoURI} disableLazyLoad className="w-full h-full rounded-full object-cover absolute inset-0 z-10" />
            {token.isVerified && (
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 z-20 rounded-full bg-emerald-500 flex items-center justify-center ring-1 ring-[#181818]">
                <Check size={7} className="text-white" />
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`font-normal text-base leading-none ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                {token.symbol}
              </span>
              {token.tags?.includes('meme') && <Sparkles size={11} className="text-pink-400" />}
            </div>
            <div className="text-[11px] text-white/40 truncate mt-1 font-mono">{formatCompactUSD(token.marketCap)}</div>
          </div>

          {/* Status badge */}
          <div className="flex-none w-8 flex justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {isSelected ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600"
                >
                  <Check size={14} className="text-zinc-950" />
                </motion.div>
              ) : (
                <motion.div
                  key="plus"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  className="w-7 h-7 rounded-full border-2 border-white/15 flex items-center justify-center"
                >
                  <Plus size={14} className="text-white/40" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    );
  },

  (prev, next) =>
    prev.token.address === next.token.address &&
    prev.isSelected === next.isSelected &&
    prev.isFav === next.isFav,
);

// ─── Mobile: Asset Card ───────────────────────────────────────────────────────
const MobileAssetCard = memo(
  ({
    item,
    colorIndex,
    totalWeight,
    onUpdateWeight,
    onRemove,
  }: {
    item: AssetItem;
    colorIndex: number;
    totalWeight: number;
    onUpdateWeight: (address: string, value: number) => void;
    onRemove: (address: string) => void;
  }) => {
    const [isEditingWeight, setIsEditingWeight] = useState(false);
    const [inputValue, setInputValue] = useState(item.weight.toString());
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (!isEditingWeight) setInputValue(item.weight.toString());
    }, [item.weight, isEditingWeight]);

    const isOverLimit = totalWeight > 100;
    const displayColor = isOverLimit ? '#ef4444' : AXIS_GOLD;

    const handleWeightCommit = () => {
      setIsEditingWeight(false);
      const v = parseInt(inputValue);
      if (!isNaN(v)) onUpdateWeight(item.token.address, Math.min(100, Math.max(0, v)));
      else setInputValue(item.weight.toString());
    };

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -30, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: '#0e0906',
          boxShadow: `0 2px 16px rgba(0,0,0,0.6), 0 0 0 1px ${AXIS_GOLD_GLOW}0.10)`,
        }}
      >
        {/* Left accent stripe — brand copper gold */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: `linear-gradient(180deg, ${AXIS_GOLD_DIM}, ${AXIS_GOLD}, ${AXIS_GOLD_DIM})` }}
        />
        {/* Ambient copper glow from left */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at -5% 50%, ${AXIS_GOLD_GLOW}0.10), transparent 50%)` }}
        />

        <div className="pl-5 pr-4 pt-4 pb-3">
          {/* Header: logo + name + BIG weight + remove */}
          <div className="flex items-center gap-3 mb-3">
            {/* Logo with copper halo */}
            <div className="relative flex-none">
              <div
                className="absolute inset-0 rounded-full blur-lg"
                style={{ backgroundColor: AXIS_GOLD, opacity: 0.20, transform: 'scale(1.5)' }}
              />
              <TokenImage
                src={item.token.logoURI}
                className="relative w-11 h-11 rounded-full"
              />
            </div>

            {/* Symbol + name */}
            <div className="flex-1 min-w-0">
              <div className="font-normal text-white text-[15px] tracking-wide leading-tight">
                {item.token.symbol}
              </div>
              <div className="text-[11px] truncate mt-0.5" style={{ color: `${AXIS_GOLD_GLOW}0.45)` }}>
                {item.token.name}
              </div>
            </div>

            {/* Tappable weight — sole percentage display */}
            {isEditingWeight ? (
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={handleWeightCommit}
                onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
                className="w-[72px] h-11 border-2 rounded-xl text-center text-2xl font-normal outline-none tabular-nums"
                style={{
                  background: 'rgba(10,5,2,0.7)',
                  borderColor: AXIS_GOLD,
                  color: AXIS_GOLD,
                  fontFamily: "'Lora', 'Times New Roman', serif",
                }}
                maxLength={3}
                autoFocus
              />
            ) : (
              <button
                onClick={() => { setIsEditingWeight(true); setInputValue(item.weight.toString()); }}
                className="flex items-baseline gap-0.5 active:opacity-60 transition-opacity"
              >
                <span
                  className="text-[32px] font-normal tabular-nums leading-none"
                  style={{
                    color: isOverLimit ? '#ef4444' : AXIS_GOLD,
                    fontFamily: "'Lora', 'Times New Roman', serif",
                  }}
                >
                  {item.weight}
                </span>
                <span className="text-base font-normal" style={{ color: displayColor }}>%</span>
              </button>
            )}

            {/* Remove */}
            <button
              onClick={() => onRemove(item.token.address)}
              className="w-8 h-8 flex items-center justify-center text-white/15 active:text-red-400 active:bg-red-500/10 rounded-xl transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Slider — no duplicate percentage */}
          <MobileWeightControl
            value={item.weight}
            onChange={(val) => onUpdateWeight(item.token.address, val)}
            totalWeight={totalWeight}
            accentColor={displayColor}
            hidePercentage
          />
        </div>
      </motion.div>
    );
  }
);

// ─── Desktop: Token List Item ─────────────────────────────────────────────────
const DesktopTokenListItem = ({
  token,
  isSelected,
  onSelect,
}: {
  token: JupiterToken;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <button
    disabled={isSelected}
    onClick={onSelect}
    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all group ${
      isSelected ? 'bg-amber-950/40 border border-amber-800/30 cursor-default' : 'hover:bg-white/5'
    }`}
  >
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
        <span className={`font-normal text-sm ${isSelected ? 'text-amber-400' : 'text-white'}`}>
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
  colorIndex,
  totalWeight,
  onUpdateWeight,
  onRemove,
}: {
  item: AssetItem;
  colorIndex: number;
  totalWeight: number;
  onUpdateWeight: (address: string, value: number) => void;
  onRemove: (address: string) => void;
}) => {
  const isOverLimit = totalWeight > 100;
  const displayColor = isOverLimit ? '#ef4444' : AXIS_GOLD;
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: '#0e0906',
        boxShadow: `0 1px 10px rgba(0,0,0,0.5), 0 0 0 1px ${AXIS_GOLD_GLOW}0.08)`,
      }}
    >
      {/* Left accent stripe — brand gradient */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: `linear-gradient(180deg, ${AXIS_GOLD_DIM}, ${AXIS_GOLD}, ${AXIS_GOLD_DIM})` }}
      />
      {/* Ambient copper glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at -5% 50%, ${AXIS_GOLD_GLOW}0.08), transparent 50%)` }}
      />
      <div className="pl-5 pr-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          {/* Logo with copper halo */}
          <div className="relative flex-none">
            <div
              className="absolute inset-0 rounded-full blur-md"
              style={{ backgroundColor: AXIS_GOLD, opacity: 0.18, transform: 'scale(1.5)' }}
            />
            <TokenImage src={item.token.logoURI} className="relative w-9 h-9 rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-normal text-white text-sm tracking-wide">{item.token.symbol}</div>
            <div className="text-[11px] truncate mt-0.5" style={{ color: `${AXIS_GOLD_GLOW}0.40)` }}>
              {item.token.name}
            </div>
          </div>
          {/* Weight — sole percentage display */}
          <div
            className="text-xl font-normal tabular-nums mr-1"
            style={{ color: displayColor, fontFamily: '"Times New Roman", serif' }}
          >
            {item.weight}%
          </div>
          <button
            onClick={() => onRemove(item.token.address)}
            className="w-7 h-7 flex items-center justify-center text-white/15 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <X size={14} />
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
};

// ─── Portfolio Progress Bar (shared) ─────────────────────────────────────────
const PortfolioProgressBar = memo(
  ({
    portfolio,
    totalWeight,
    onDistributeEvenly,
  }: {
    portfolio: AssetItem[];
    totalWeight: number;
    onDistributeEvenly: () => void;
  }) => {
    const isComplete = totalWeight === 100;
    const isOver = totalWeight > 100;

    return (
      <div className="px-4 py-3 space-y-2.5">
        {/* Top row: stacked avatars + status + equal button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Stacked token avatars */}
            <div className="flex items-center">
              {portfolio.length === 0 ? (
                <div className="w-8 h-8 rounded-full ring-2 ring-dashed ring-white/10 bg-white/5 flex items-center justify-center">
                  <Plus size={12} className="text-white/20" />
                </div>
              ) : (
                <>
                  {portfolio.slice(0, 6).map((asset, i) => (
                    <div
                      key={asset.token.address}
                      className="relative w-8 h-8 rounded-full ring-2 ring-[#030303] overflow-hidden bg-[#1a1a1a] flex-none"
                      style={{ marginLeft: i === 0 ? 0 : -10, zIndex: portfolio.length - i }}
                    >
                      <TokenImage src={asset.token.logoURI} className="w-full h-full" />
                    </div>
                  ))}
                  {portfolio.length > 6 && (
                    <div
                      className="relative w-8 h-8 rounded-full ring-2 ring-[#030303] bg-white/10 flex items-center justify-center text-[10px] text-white/50 font-normal flex-none"
                      style={{ marginLeft: -10 }}
                    >
                      +{portfolio.length - 6}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Status */}
            <div className="text-sm">
              {isComplete ? (
                <span className="font-normal flex items-center gap-1" style={{ color: '#D9A05B' }}>
                  <Check size={13} /> Ready
                </span>
              ) : isOver ? (
                <span className="font-normal text-red-400">+{totalWeight - 100}% over</span>
              ) : (
                <span style={{ color: `${AXIS_GOLD_GLOW}0.45)` }}>
                  <span className="font-normal" style={{ color: AXIS_GOLD }}>{totalWeight}</span>% / 100%
                </span>
              )}
            </div>
          </div>
          {/* Equal button */}
          {portfolio.length >= 2 && (
            <button
              onClick={onDistributeEvenly}
              className="flex items-center gap-1 text-xs font-normal px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: `${AXIS_GOLD_GLOW}0.08)`,
                border: `1px solid ${AXIS_GOLD_GLOW}0.20)`,
                color: '#D9A05B',
              }}
            >
              <Percent size={11} /> Equal
            </button>
          )}
        </div>

        {/* Progress bar — brand copper-gold gradient */}
        <div
          className="relative h-2 rounded-full overflow-hidden"
          style={{ background: 'rgba(199,125,54,0.08)' }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: isOver
                ? '#ef4444'
                : isComplete
                  ? 'linear-gradient(90deg, #4A230F, #8E4D1F, #C77D36, #D9A05B, #E8C28A)'
                  : 'linear-gradient(90deg, #4A230F, #8E4D1F, #C77D36, #D9A05B)',
              boxShadow: isOver ? 'none' : `0 0 8px 1px ${AXIS_GOLD_GLOW}0.35)`,
            }}
            animate={{ width: `${Math.min(totalWeight, 100)}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>

        {/* Token legend */}
        {portfolio.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {portfolio.map((asset, i) => (
              <div key={asset.token.address} className="flex items-center gap-1">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-none"
                  style={{ backgroundColor: PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length] }}
                />
                <span className="text-[10px] text-white/35">{asset.token.symbol} {asset.weight}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// MobileBuilder
// ─────────────────────────────────────────────────────────────────────────────
export const MobileBuilder = ({ dashboard, preferences, onBack, inline }: BuilderProps) => {
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
    addTokenToComposition,
  } = dashboard;

  const { publicKey } = useWallet();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectedDetailToken, setSelectedDetailToken] = useState<JupiterToken | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const [isPredictionListOpen, setIsPredictionListOpen] = useState(false);

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
      } catch (e) {
        console.error('Selection Error:', e);
      }
    },
    [dashboard, triggerHaptic, preferences]
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

  // Reset scroll to top when tab or search changes so the virtualizer renders correctly
  useEffect(() => {
    if (mobileScrollRef.current) mobileScrollRef.current.scrollTop = 0;
  }, [activeTab, searchQuery]);

  const handlePasteCA = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length >= 32) setSearchQuery(text.trim());
    } catch { /* clipboard denied */ }
  }, [setSearchQuery]);

  // Removed: auto-open token selector on mount.
  // Users should open it by scrolling to and clicking the "Add Token" button.

  return (
    <div className={inline ? 'flex flex-col h-full' : 'absolute inset-0 bg-[#030303] flex flex-col'}>
      {/* Header — standalone mode only */}
      {!inline && (
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
      )}

      {/* Scrollable Content */}
      <div className={`${inline ? 'flex-1 min-h-0' : 'absolute inset-0 z-0'} overflow-y-auto custom-scrollbar`}>
        {!inline && <div className="h-[64px] safe-area-top" />}

        {/* Stats bar — inline mode: compact pill row */}
        {inline ? (
          <div className="sticky top-0 z-20 backdrop-blur-sm bg-black/50 px-4 py-2.5 flex items-center gap-3">
            {/* Allocation pill */}
            <motion.div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-normal ${
                totalWeight === 100
                  ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30'
                  : totalWeight > 100
                    ? 'bg-red-900/30 text-red-400 border border-red-700/30'
                    : 'bg-amber-900/20 text-amber-500 border border-amber-800/20'
              }`}
              animate={totalWeight === 100 ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              {totalWeight === 100 ? (
                <><Check size={11} /> Complete</>
              ) : totalWeight > 100 ? (
                <><AlertCircle size={11} /> {totalWeight - 100}% over</>
              ) : (
                <><span style={{ fontFamily: '"Times New Roman", serif' }}>{totalWeight}%</span> / 100</>
              )}
            </motion.div>

            {/* Assets count */}
            <span className="text-xs text-white/30">
              {portfolio.length} asset{portfolio.length !== 1 ? 's' : ''}
            </span>

            <div className="flex-1" />

            {/* Equal button */}
            {portfolio.length >= 2 && (
              <button
                onClick={distributeEvenly}
                className="flex items-center gap-1 text-[11px] font-normal px-2.5 py-1.5 rounded-lg bg-white/5 text-white/50 active:bg-white/10 transition-colors"
              >
                <Percent size={10} /> Equal
              </button>
            )}

            {/* Add token button */}
            <button
              onClick={() => setIsSelectorOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-normal px-3 py-1.5 rounded-full btn-glass-gold transition-colors"
            >
              <Plus size={12} /> Add
            </button>
          </div>
        ) : (
          /* Stats Header — standalone mode */
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
                <span className={`text-2xl font-normal ${totalWeight === 100 ? 'text-emerald-400' : totalWeight > 100 ? 'text-red-400' : 'text-amber-500'}`}>
                  {totalWeight}
                </span>
                <span className="text-[10px] text-white/40 -mt-1">%</span>
              </div>
              <div>
                <div className="text-[10px] text-white/40 font-normal uppercase tracking-wider">Allocation</div>
                <div className="text-sm font-normal mt-0.5">
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
                <button onClick={distributeEvenly} className="flex items-center gap-1.5 text-xs font-normal px-3 py-2 rounded-lg bg-white/5 text-white/70 active:bg-white/10 transition-colors">
                  <Percent size={12} /> Equal
                </button>
              )}
              <div className="text-xs text-white/30 font-mono">{portfolio.length} Asset{portfolio.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        )}

        {/* Portfolio List */}
        <div className={`p-4 space-y-3 ${inline ? 'pb-4' : 'pb-40'}`}>
          <AnimatePresence>
            {totalWeight > 100 && (
              <motion.div
                key="error-banner"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-normal mb-2"
              >
                <AlertCircle size={16} />
                <span>Allocation exceeds 100%</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout">
            {portfolio.map((item, index) => (
              <MobileAssetCard
                key={item.token.address}
                item={item}
                colorIndex={index}
                totalWeight={totalWeight}
                onUpdateWeight={updateWeight}
                onRemove={removeToken}
              />
            ))}
          </AnimatePresence>

          <motion.button
            layout
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsSelectorOpen(true)}
            className="w-full py-4 rounded-2xl border border-dashed border-white/[0.08] flex items-center justify-center gap-2.5 text-white/25 active:bg-white/5 active:text-white/50 transition-colors"
          >
            <Plus size={17} />
            <span className="text-sm font-normal">Add token</span>
          </motion.button>
        </div>
      </div>


      {/* Token Selector Modal — portal to body so no parent overflow/transform interference */}
      {isSelectorOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-3"
          onClick={() => setIsSelectorOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative w-full max-w-lg pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full bg-[#121212] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: 'min(88vh, 680px)' }}>
              <div className="shrink-0 bg-[#121212] border-b border-white/5 p-3 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-amber-700/60 font-normal">Protocol Assets</p>
                    <p className="text-xs text-white/25 mt-0.5">{sortedVisibleTokens.length} whitelisted tokens</p>
                  </div>
                  <button
                    onClick={() => setIsSelectorOpen(false)}
                    className="p-2 rounded-full bg-white/5 text-white/50 active:bg-white/10 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div ref={mobileScrollRef} className="flex-1 overflow-y-auto bg-[#121212] custom-scrollbar" style={{ touchAction: 'pan-y' }}>
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-4">
                    <AxisSpinner size={36} />
                    <span className="text-sm text-white/30">Loading tokens...</span>
                  </div>
                ) : false ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-4">
                    <AxisSpinner size={30} />
                    <span className="text-sm text-white/30">Searching...</span>
                  </div>
                ) : activeTab === 'prediction' ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 px-6">
                    <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {groupedPredictions.length} markets available · sorted by volume
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setIsPredictionListOpen(true)}
                      className="w-full py-3.5 rounded-2xl text-sm font-normal"
                      style={{
                        background: 'linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08))',
                        border: '1px solid rgba(201,168,76,0.25)',
                        color: '#c9a84c',
                      }}
                    >
                      Browse Prediction Markets
                    </motion.button>
                  </div>
                ) : sortedVisibleTokens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3 text-white/20">
                    <Search size={32} />
                    <span className="text-sm">No tokens found</span>
                  </div>
                ) : (
                  <div className="px-2 py-3 space-y-1">
                    {sortedVisibleTokens.map((token) => {
                      const isSelected = selectedIds.has(token.address);
                      return (
                        <MobileTokenListItem
                          key={token.address}
                          token={token}
                          isSelected={isSelected}
                          isFav={preferences.isFavorite(token.address)}
                          onAdd={() => handleTokenSelect(token)}
                          onRemove={isSelected ? () => removeToken(token.address) : undefined}
                          onDetail={() => setSelectedDetailToken(token)}
                          onToggleFav={(e) => { e.stopPropagation(); preferences.toggleFavorite(token.address); }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      , document.body)}

      {/* Token Detail Modal — portal to body */}
      {createPortal(
        <AnimatePresence>
          {selectedDetailToken && (
            <TokenDetailModal
              token={selectedDetailToken}
              isSelected={selectedIds.has(selectedDetailToken.address)}
              onAdd={() => handleTokenSelect(selectedDetailToken)}
              onClose={() => setSelectedDetailToken(null)}
            />
          )}
        </AnimatePresence>,
        document.body
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

      <PredictionListModal
        isOpen={isPredictionListOpen}
        onClose={() => setIsPredictionListOpen(false)}
        groups={groupedPredictions}
        selectedIds={selectedIds}
        onSelect={handleTokenSelect}
      />
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
    addTokenToComposition,
    removeToken,
    updateWeight,
    distributeEvenly,
  } = dashboard;

  const { publicKey } = useWallet();

  const [isPredictionListOpen, setIsPredictionListOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
      <div className="flex-none px-6 py-4 flex items-center justify-between border-b border-white/[0.06]">
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
          <div className="px-6 py-4 flex justify-between items-center">
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
                <div className="text-xs text-amber-700/70 font-normal uppercase tracking-wider">Total</div>
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

            {portfolio.map((item, index) => (
              <DesktopAssetCard
                key={item.token.address}
                item={item}
                colorIndex={index}
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

        </div>

        {/* Right Panel: Token Selector */}
        <div className="w-[45%] flex flex-col min-h-0 bg-[#0a0a0a]">
          <div className="px-4 py-4 border-b border-white/5">
            {/* Whitelist header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-amber-700/60 font-normal mb-0.5">Protocol Assets</p>
                <p className="text-xs text-white/30">{allTokens.length} whitelisted tokens</p>
              </div>
              {hasSelection && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Check size={12} /> {portfolio.length} selected
                </span>
              )}
            </div>

          </div>

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-2 pb-4 custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-4">
                <AxisSpinner size={32} />
                <span className="text-sm text-white/30">Loading assets...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 px-3 py-1.5 text-[9px] text-white/20 uppercase tracking-wider">
                  <div className="w-5" />
                  <div className="w-9" />
                  <div className="flex-1">Asset</div>
                  <div className="w-[50px] text-right">MC</div>
                  <div className="w-[50px] text-right">VOL</div>
                  <div className="w-7" />
                </div>
                {sortedVisibleTokens.map((token) => {
                  const isSelected = selectedIds.has(token.address);
                  return (
                    <DesktopTokenListItem
                      key={token.address}
                      token={token}
                      isSelected={isSelected}
                      onSelect={() => handleTokenSelect(token)}
                    />
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
