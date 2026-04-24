import { describe, it, expect } from 'vitest';
import { buildPriceSnapshot } from '../services/snapshot';
import type { PriceResult } from '../services/snapshot/price-fetcher';

const SOL_MINT  = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const lc = (s: string) => s.toLowerCase();

function makePrice(price_usd: number): PriceResult {
  return { price_usd, source: 'jupiter' };
}

describe('Performance ROI calculation', () => {
  it('roi is 0 when nav equals baseline', () => {
    const tokens = [{ symbol: 'SOL', weight: 1, mint: SOL_MINT }];
    const priceMap = new Map([[lc(SOL_MINT), makePrice(200)]]);

    const { indexPriceUsd } = buildPriceSnapshot(tokens, priceMap);
    const baselineNav = indexPriceUsd;
    const roi = baselineNav > 0 ? ((indexPriceUsd - baselineNav) / baselineNav) * 100 : 0;

    expect(roi).toBe(0);
  });

  it('roi is positive when price increases', () => {
    const tokens = [{ symbol: 'SOL', weight: 1, mint: SOL_MINT }];

    const { indexPriceUsd: baselineNav } = buildPriceSnapshot(
      tokens, new Map([[lc(SOL_MINT), makePrice(200)]])
    );
    const { indexPriceUsd: currentNav } = buildPriceSnapshot(
      tokens, new Map([[lc(SOL_MINT), makePrice(240)]])
    );

    const roi = ((currentNav - baselineNav) / baselineNav) * 100;
    expect(roi).toBeCloseTo(20);
  });

  it('roi is negative when price decreases', () => {
    const tokens = [{ symbol: 'SOL', weight: 1, mint: SOL_MINT }];

    const { indexPriceUsd: baselineNav } = buildPriceSnapshot(
      tokens, new Map([[lc(SOL_MINT), makePrice(200)]])
    );
    const { indexPriceUsd: currentNav } = buildPriceSnapshot(
      tokens, new Map([[lc(SOL_MINT), makePrice(160)]])
    );

    const roi = ((currentNav - baselineNav) / baselineNav) * 100;
    expect(roi).toBeCloseTo(-20);
  });

  it('normalized price starts at 100 on inception', () => {
    const tokens = [{ symbol: 'SOL', weight: 1, mint: SOL_MINT }];
    const priceMap = new Map([[lc(SOL_MINT), makePrice(200)]]);

    const { indexPriceUsd } = buildPriceSnapshot(tokens, priceMap);
    const baselineNav = indexPriceUsd;
    const normalized = (indexPriceUsd / baselineNav) * 100;

    expect(normalized).toBe(100);
  });

  it('change_since_inception equals (normalized - 100)', () => {
    const tokens = [{ symbol: 'SOL', weight: 1, mint: SOL_MINT }];

    const { indexPriceUsd: baselineNav } = buildPriceSnapshot(
      tokens, new Map([[lc(SOL_MINT), makePrice(200)]])
    );
    const { indexPriceUsd: currentNav } = buildPriceSnapshot(
      tokens, new Map([[lc(SOL_MINT), makePrice(250)]])
    );

    const currentNormalized = (currentNav / baselineNav) * 100;
    const changeSinceInception = currentNormalized - 100;
    expect(changeSinceInception).toBeCloseTo(25);
  });

  it('multi-token portfolio roi calculation', () => {
    const tokens = [
      { symbol: 'SOL',  weight: 0.5, mint: SOL_MINT },
      { symbol: 'USDC', weight: 0.5, mint: USDC_MINT },
    ];

    const { indexPriceUsd: baselineNav } = buildPriceSnapshot(
      tokens,
      new Map([[lc(SOL_MINT), makePrice(200)], [lc(USDC_MINT), makePrice(1)]])
    );
    const { indexPriceUsd: currentNav } = buildPriceSnapshot(
      tokens,
      new Map([[lc(SOL_MINT), makePrice(300)], [lc(USDC_MINT), makePrice(1)]])
    );

    const roi = ((currentNav - baselineNav) / baselineNav) * 100;
    expect(roi).toBeGreaterThan(0);
    expect(currentNav).toBeCloseTo(150.5);
  });
});
