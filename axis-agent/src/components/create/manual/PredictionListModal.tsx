import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, BarChart2 } from 'lucide-react';
import { PredictionEventCard, type PredictionGroup } from './PredictionEventCard';
import { PredictionSelectModal } from './PredictionSelectModal';
import type { JupiterToken } from '../../../services/jupiter';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  groups: PredictionGroup[];
  selectedIds: Set<string>;
  onSelect: (token: JupiterToken) => void;
}

export const PredictionListModal = ({ isOpen, onClose, groups, selectedIds, onSelect }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<PredictionGroup | null>(null);

  const filtered = searchQuery.trim()
    ? groups.filter((g) => {
        const q = searchQuery.toLowerCase();
        return (
          g.marketQuestion.toLowerCase().includes(q) ||
          g.eventTitle.toLowerCase().includes(q)
        );
      })
    : groups;

  const getSelectedSide = (group: PredictionGroup): 'YES' | 'NO' | undefined => {
    if (group.yesToken && selectedIds.has(group.yesToken.address)) return 'YES';
    if (group.noToken && selectedIds.has(group.noToken.address)) return 'NO';
    return undefined;
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9000] flex flex-col"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="flex flex-col h-full max-w-lg mx-auto w-full"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-8 pb-4 flex-none">
                <div>
                  <h2 className="text-lg font-normal text-white/90">Prediction Markets</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <BarChart2 size={11} style={{ color: '#c9a84c' }} />
                    <span className="text-[11px] font-mono" style={{ color: 'rgba(201,168,76,0.7)' }}>
                      Sorted by volume
                    </span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2.5 rounded-xl transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search */}
              <div className="px-5 pb-4 flex-none">
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Search size={15} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Search markets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm text-white/80 placeholder:text-white/25"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} style={{ color: 'rgba(255,255,255,0.3)' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Gold divider */}
              <div className="mx-5 mb-2 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.2), transparent)' }} />

              {/* List */}
              <div className="flex-1 overflow-y-auto px-5 pb-8 custom-scrollbar">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    <Search size={28} strokeWidth={1.5} />
                    <span className="text-sm">No markets found</span>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    {filtered.map((group) => (
                      <PredictionEventCard
                        key={group.marketId}
                        group={group}
                        selectedSide={getSelectedSide(group)}
                        onClick={() => setActiveGroup(group)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* YES/NO selector — on top of the list modal */}
      <PredictionSelectModal
        group={activeGroup}
        isOpen={!!activeGroup}
        onClose={() => setActiveGroup(null)}
        onSelect={(token) => {
          onSelect(token);
          setActiveGroup(null);
          onClose();
        }}
        selectedTokenAddress={
          activeGroup?.yesToken && selectedIds.has(activeGroup.yesToken.address)
            ? activeGroup.yesToken.address
            : activeGroup?.noToken && selectedIds.has(activeGroup.noToken.address)
            ? activeGroup.noToken.address
            : undefined
        }
      />
    </>
  );
};
