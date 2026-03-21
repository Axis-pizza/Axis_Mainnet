import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Search, Sparkles, TrendingUp, BarChart3 } from 'lucide-react-native';
import type { TabType } from './types';

interface TabSelectorProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isWalletConnected?: boolean;
}

const TABS = [
  { id: 'all' as TabType,        label: 'All',     Icon: Search     },
  { id: 'meme' as TabType,       label: 'Meme',    Icon: Sparkles   },
  { id: 'stock' as TabType,      label: 'Stock',   Icon: TrendingUp },
  { id: 'prediction' as TabType, label: 'Predict', Icon: BarChart3  },
] as const;

export const TabSelector = ({ activeTab, setActiveTab }: TabSelectorProps) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    {TABS.map((tab) => {
      const isActive = activeTab === tab.id;
      const { Icon } = tab;
      return (
        <Pressable
          key={tab.id}
          onPress={() => setActiveTab(tab.id)}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 8,
            borderRadius: 12,
            gap: 4,
            backgroundColor: isActive ? '#F59E0B' : 'transparent',
          }}
        >
          <Icon size={12} color={isActive ? '#000' : 'rgba(255,255,255,0.35)'} />
          <Text style={{
            fontSize: 12,
            fontWeight: 'bold',
            color: isActive ? '#000' : 'rgba(255,255,255,0.35)',
          }}>
            {tab.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);
