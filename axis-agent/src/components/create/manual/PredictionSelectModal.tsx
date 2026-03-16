import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { TokenImage } from '../../common/TokenImage';
import type { PredictionGroup } from './PredictionEventCard';
import type { JupiterToken } from '../../../services/jupiter';

interface Props {
  group: PredictionGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: JupiterToken) => void;
  selectedTokenAddress?: string;
}

export const PredictionSelectModal = ({ group, isOpen, onClose, onSelect, selectedTokenAddress }: Props) => {
  if (!group) return null;

  const yesProb = group.yesToken?.price != null ? (group.yesToken.price * 100) : 50;
  const noProb = group.noToken?.price != null ? (group.noToken.price * 100) : 50;
  const yesProbStr = yesProb.toFixed(1);
  const noProbStr = noProb.toFixed(1);

  const isYesSelected = selectedTokenAddress === group.yesToken?.address;
  const isNoSelected = selectedTokenAddress === group.noToken?.address;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="w-full max-w-md overflow-hidden rounded-3xl shadow-2xl"
            style={{
              background: 'linear-gradient(160deg, #1a1208 0%, #0d0d0b 60%, #0a0a08 100%)',
              border: '1px solid rgba(201,168,76,0.15)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(201,168,76,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Gold top accent line */}
            <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.5), transparent)' }} />

            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-start mb-5">
                <div className="flex gap-3 items-center flex-1 pr-3">
                  <div className="relative flex-none">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.05)' }}>
                      <TokenImage src={group.image} className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] tracking-[0.15em] uppercase mb-1" style={{ color: '#c9a84c' }}>
                      {group.eventTitle}
                    </div>
                    <h2 className="text-sm font-normal leading-snug text-white/90 line-clamp-2">
                      {group.marketQuestion}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex-none p-2 rounded-xl transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Probability bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs mb-2 px-0.5">
                  <span className="font-mono" style={{ color: '#4cc38a' }}>YES · {yesProbStr}%</span>
                  <span className="font-mono" style={{ color: '#ff6369' }}>NO · {noProbStr}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${yesProbStr}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                    className="h-full rounded-l-full"
                    style={{ background: 'linear-gradient(90deg, #30a46c, #4cc38a)' }}
                  />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${noProbStr}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                    className="h-full rounded-r-full"
                    style={{ background: 'linear-gradient(90deg, #e54d2e, #ff6369)' }}
                  />
                </div>
              </div>

              {/* YES / NO buttons */}
              <div className="grid grid-cols-2 gap-3">
                {/* YES */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { if (group.yesToken) onSelect(group.yesToken); onClose(); }}
                  className="relative flex flex-col items-center justify-center py-6 rounded-2xl overflow-hidden transition-all"
                  style={{
                    background: isYesSelected
                      ? 'linear-gradient(160deg, rgba(48,164,108,0.25), rgba(76,195,138,0.12))'
                      : 'rgba(48,164,108,0.06)',
                    border: isYesSelected
                      ? '1px solid rgba(76,195,138,0.5)'
                      : '1px solid rgba(76,195,138,0.15)',
                    boxShadow: isYesSelected ? '0 0 24px rgba(76,195,138,0.15)' : 'none',
                  }}
                >
                  <TrendingUp size={20} style={{ color: '#4cc38a', marginBottom: 8 }} />
                  <span className="text-2xl font-normal" style={{ color: '#4cc38a', letterSpacing: '0.05em' }}>YES</span>
                  <span className="font-mono text-sm mt-1" style={{ color: 'rgba(76,195,138,0.7)' }}>{yesProbStr}%</span>
                  {isYesSelected && (
                    <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: 'inset 0 0 20px rgba(76,195,138,0.1)' }} />
                  )}
                </motion.button>

                {/* NO */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { if (group.noToken) onSelect(group.noToken); onClose(); }}
                  className="relative flex flex-col items-center justify-center py-6 rounded-2xl overflow-hidden transition-all"
                  style={{
                    background: isNoSelected
                      ? 'linear-gradient(160deg, rgba(229,77,46,0.25), rgba(255,99,105,0.12))'
                      : 'rgba(229,77,46,0.06)',
                    border: isNoSelected
                      ? '1px solid rgba(255,99,105,0.5)'
                      : '1px solid rgba(255,99,105,0.15)',
                    boxShadow: isNoSelected ? '0 0 24px rgba(255,99,105,0.15)' : 'none',
                  }}
                >
                  <TrendingDown size={20} style={{ color: '#ff6369', marginBottom: 8 }} />
                  <span className="text-2xl font-normal" style={{ color: '#ff6369', letterSpacing: '0.05em' }}>NO</span>
                  <span className="font-mono text-sm mt-1" style={{ color: 'rgba(255,99,105,0.7)' }}>{noProbStr}%</span>
                  {isNoSelected && (
                    <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: 'inset 0 0 20px rgba(255,99,105,0.1)' }} />
                  )}
                </motion.button>
              </div>

              <p className="text-center text-[11px] mt-4" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Select a position to add to your ETF
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
