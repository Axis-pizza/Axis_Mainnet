import React from 'react';
import { X, Check } from 'lucide-react';
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
  if (!isOpen || !group) return null;

  const yesProb = group.yesToken?.price != null ? (group.yesToken.price * 100).toFixed(1) : '50.0';
  const noProb = group.noToken?.price != null ? (group.noToken.price * 100).toFixed(1) : '50.0';

  const isYesSelected = selectedTokenAddress === group.yesToken?.address;
  const isNoSelected = selectedTokenAddress === group.noToken?.address;

  return (
    <div 
      // ★ z-index を 10000 にしてスマホのドロワーより手前に表示
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity" 
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-[#111] border border-white/10 rounded-[32px] overflow-hidden p-6 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6">
          <div className="flex gap-4 items-center flex-1 pr-2">
            {/* ★ group.image をそのまま表示 */}
            <TokenImage src={group.image} className="w-16 h-16 rounded-2xl bg-white/5 flex-none object-cover" />
            <div>
              <div className="text-xs text-amber-500 font-normal uppercase mb-1 tracking-wider line-clamp-1">
                {group.eventTitle}
              </div>
              <h2 className="text-base sm:text-lg font-normal text-white leading-tight">
                {group.marketQuestion}
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition flex-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-8">
          <div className="flex justify-between text-sm font-mono mb-2 px-1">
            <span className="text-emerald-400 font-normal">YES {yesProb}%</span>
            <span className="text-red-400 font-normal">NO {noProb}%</span>
          </div>
          <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden flex">
            <div style={{ width: `${yesProb}%` }} className="h-full bg-emerald-500 transition-all duration-700 ease-out" />
            <div style={{ width: `${noProb}%` }} className="h-full bg-red-500 transition-all duration-700 ease-out" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => {
              if (group.yesToken) onSelect(group.yesToken);
              onClose();
            }}
            className={`relative flex flex-col items-center p-5 rounded-2xl border-2 transition-all ${
              isYesSelected 
                ? 'bg-emerald-500/20 border-emerald-500/50 scale-[0.98]' 
                : 'bg-white/5 border-transparent hover:border-emerald-500/30 hover:bg-white/10'
            }`}
          >
            <span className="text-emerald-400 font-normal text-2xl mb-1">YES</span>
            <span className="text-white font-mono text-xl">{yesProb}%</span>
            {isYesSelected && <div className="absolute top-3 right-3 text-emerald-500"><Check size={20} /></div>}
          </button>

          <button
            onClick={() => {
              if (group.noToken) onSelect(group.noToken);
              onClose();
            }}
            className={`relative flex flex-col items-center p-5 rounded-2xl border-2 transition-all ${
              isNoSelected 
                ? 'bg-red-500/20 border-red-500/50 scale-[0.98]' 
                : 'bg-white/5 border-transparent hover:border-red-500/30 hover:bg-white/10'
            }`}
          >
            <span className="text-red-400 font-normal text-2xl mb-1">NO</span>
            <span className="text-white font-mono text-xl">{noProb}%</span>
            {isNoSelected && <div className="absolute top-3 right-3 text-red-500"><Check size={20} /></div>}
          </button>
        </div>
      </div>
    </div>
  );
};