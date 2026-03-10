import React, { memo } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { TokenImage } from '../../common/TokenImage';
import { formatCompactUSD } from '../../../utils/formatNumber';
import type { JupiterToken } from '../../../services/jupiter';

export interface PredictionGroup {
  marketId: string;
  marketQuestion: string;
  eventTitle: string;
  image: string; // DFlowから来たイベント画像
  expiry: string;
  totalVolume?: number;
  yesToken?: JupiterToken;
  noToken?: JupiterToken;
}

export const PredictionEventCard = memo(
  ({
    group,
    selectedSide,
    onClick,
  }: {
    group: PredictionGroup;
    selectedSide?: 'YES' | 'NO';
    onClick: () => void;
  }) => {
    // 0%も正しく反映させるための != null 判定
    const yesProb = group.yesToken?.price != null ? (group.yesToken.price * 100).toFixed(1) : '50.0';
    const noProb = group.noToken?.price != null ? (group.noToken.price * 100).toFixed(1) : '50.0';

    const formattedDate = group.expiry
      ? new Date(group.expiry).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    return (
      <button
        onClick={onClick}
        className={`w-full text-left mb-4 p-4 rounded-2xl bg-white/[0.03] border transition-all pointer-events-auto group ${
          selectedSide 
            ? 'border-amber-500/50 bg-amber-500/5' 
            : 'border-white/10 hover:border-amber-500/30'
        }`}
      >
        <div className="flex gap-4 mb-3">
          {/* ★ group.image をそのまま表示 */}
          <TokenImage src={group.image} className="w-12 h-12 rounded-xl flex-none bg-white/5 object-cover" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-1">
              <div className="text-[10px] text-amber-500 font-bold uppercase tracking-wider line-clamp-1">
                {group.eventTitle}
              </div>
            </div>

            <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
              {group.marketQuestion}
            </h3>

            <div className="mt-2 flex items-center justify-between">
              <div className="text-[10px] text-white/40 flex items-center gap-1">
                <span className="text-white/20">Expires:</span>
                <span className="text-white/60 font-medium font-mono">{formattedDate}</span>
              </div>
              
              <div className="text-[10px] font-mono font-bold flex gap-2 bg-black/40 px-2 py-1 rounded-md">
                <span className="text-emerald-400">Y: {yesProb}%</span>
                <span className="text-white/20">|</span>
                <span className="text-red-400">N: {noProb}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center pl-2 opacity-50 group-hover:opacity-100 transition-opacity">
             <ChevronRight className="text-amber-500" size={18} />
          </div>
        </div>

        {selectedSide && (
          <div className="mb-3 flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded w-max">
            <Check size={12} />
            {selectedSide} INCLUDED
          </div>
        )}

        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden flex">
          <div style={{ width: `${yesProb}%` }} className="h-full bg-emerald-500/50" />
          <div style={{ width: `${noProb}%` }} className="h-full bg-red-500/50" />
        </div>
      </button>
    );
  }
);