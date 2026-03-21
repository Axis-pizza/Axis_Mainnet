/**
 * ShareCard - Share strategy via native Share API (React Native)
 * Generates a text-based share payload instead of html2canvas screenshot
 */

import React from 'react';
import { Share } from 'react-native';
import { PizzaChart } from '../common/PizzaChart';

interface ShareCardProps {
  strategy: {
    name: string;
    ticker: string;
    price: number;
    apy: number;
    tvl: string | number;
    tokens: any[];
    chartData?: any[];
  } | null;
}

/**
 * Trigger native share sheet for a strategy
 */
export async function shareStrategy(strategy: ShareCardProps['strategy']): Promise<void> {
  if (!strategy) return;

  const composition = strategy.tokens
    .slice(0, 5)
    .map((t: any) => `${t.symbol} ${t.weight}%`)
    .join(' | ');

  const message = [
    `🏛️ ${strategy.name} ($${strategy.ticker})`,
    `📈 APY: ${strategy.apy}% | TVL: $${strategy.tvl}`,
    `💎 Composition: ${composition}`,
    ``,
    `Built on Axis Protocol — AI Strategy Factory`,
    `axis.app`,
  ].join('\n');

  try {
    await Share.share({ message, title: `${strategy.name} Strategy` });
  } catch {}
}

/**
 * ShareCard is not rendered visually on mobile.
 * Use shareStrategy() function instead.
 */
export const ShareCard = ({ strategy }: ShareCardProps) => {
  return null;
};

ShareCard.displayName = 'ShareCard';
