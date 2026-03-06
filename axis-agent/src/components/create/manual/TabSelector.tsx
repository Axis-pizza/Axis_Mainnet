import { motion } from 'framer-motion';
import { Search, Sparkles, TrendingUp, BarChart3 } from 'lucide-react';
import type { TabType } from './types';

interface TabSelectorProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isWalletConnected: boolean;
}

const TABS = [
  { id: 'all' as TabType,        label: 'All',        icon: Search    },
  { id: 'meme' as TabType,       label: 'Meme',       icon: Sparkles  },
  { id: 'stock' as TabType,      label: 'Stock',      icon: TrendingUp },
  { id: 'prediction' as TabType, label: 'Predict',    icon: BarChart3 },
] as const;

export const TabSelector = ({ activeTab, setActiveTab }: TabSelectorProps) => (
  <div className="flex items-center gap-1.5">
    {TABS.map((tab) => {
      const isActive = activeTab === tab.id;
      const Icon = tab.icon;
      return (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all"
        >
          {isActive && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-amber-500 rounded-xl"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
            />
          )}
          <span className={`relative z-10 flex items-center gap-1 ${isActive ? 'text-black' : 'text-white/35'}`}>
            <Icon size={12} />
            {tab.label}
          </span>
        </button>
      );
    })}
  </div>
);
