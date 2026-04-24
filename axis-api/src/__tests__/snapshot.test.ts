import { describe, it, expect } from 'vitest';
import { buildPriceSnapshot } from '../services/snapshot';
import type { PriceResult } from '../services/snapshot/price-fetcher';

const SOL_MINT  = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BTC_MINT  = 'bitcoin_mint_placeholder';

// fetchPrices はキーを小文字で返すのでモックも小文字キーで統一
const lc = (s: string) => s.toLowerCase();

function makePrice(price_usd: number, source = 'jupiter'): PriceResult {
  return { price_usd, source };
}

describe('buildPriceSnapshot', () => {
  it('returns FAIL with empty tokens', () => {
    const result = buildPriceSnapshot([], new Map());
    expect(result.confidence).toBe('FAIL');
    expect(result.indexPriceUsd).toBe(0);
  });

  it('returns FAIL when totalWeight is 0', () => {
    const tokens = [{ symbol: 'SOL', weight: 0, mint: SOL_MINT }];
    const result = buildPriceSnapshot(tokens, new Map());
    expect(result.confidence).toBe('FAIL');
  });

  it('computes weighted index price correctly', () => {
    const tokens = [
      { symbol: 'SOL',  weight: 0.5, mint: SOL_MINT },
      { symbol: 'USDC', weight: 0.5, mint: USDC_MINT },
    ];
    const priceMap = new Map([
      [lc(SOL_MINT),  makePrice(200)],
      [lc(USDC_MINT), makePrice(1)],
    ]);

    const result = buildPriceSnapshot(tokens, priceMap);
    expect(result.confidence).toBe('OK');
    expect(result.indexPriceUsd).toBeCloseTo(100.5);
  });

  it('normalizes uneven weights correctly', () => {
    const tokens = [
      { symbol: 'SOL', weight: 70, mint: SOL_MINT },
      { symbol: 'BTC', weight: 30, mint: BTC_MINT },
    ];
    const priceMap = new Map([
      [lc(SOL_MINT), makePrice(200)],
      [lc(BTC_MINT), makePrice(100000)],
    ]);

    const result = buildPriceSnapshot(tokens, priceMap);
    expect(result.confidence).toBe('OK');
    expect(result.indexPriceUsd).toBeCloseTo(30140);
  });

  it('returns PARTIAL when some prices are missing', () => {
    const tokens = [
      { symbol: 'SOL',  weight: 0.5, mint: SOL_MINT },
      { symbol: 'USDC', weight: 0.5, mint: USDC_MINT },
    ];
    const priceMap = new Map([
      [lc(SOL_MINT), makePrice(200)],
    ]);

    const result = buildPriceSnapshot(tokens, priceMap);
    expect(result.confidence).toBe('PARTIAL');
    expect(result.indexPriceUsd).toBeCloseTo(100);
  });

  it('returns FAIL when all prices are missing', () => {
    const tokens = [{ symbol: 'SOL', weight: 1, mint: SOL_MINT }];
    const result = buildPriceSnapshot(tokens, new Map());
    expect(result.confidence).toBe('FAIL');
    expect(result.indexPriceUsd).toBe(0);
  });

  it('returns PARTIAL when token has no mint', () => {
    const tokens = [
      { symbol: 'UNKNOWN', weight: 0.5, mint: null },
      { symbol: 'SOL',     weight: 0.5, mint: SOL_MINT },
    ];
    const priceMap = new Map([[lc(SOL_MINT), makePrice(200)]]);

    const result = buildPriceSnapshot(tokens, priceMap);
    expect(result.confidence).toBe('PARTIAL');
  });

  it('returns valid JSON strings for prices/weights/sources', () => {
    const tokens = [{ symbol: 'SOL', weight: 1, mint: SOL_MINT }];
    const priceMap = new Map([[lc(SOL_MINT), makePrice(200)]]);

    const result = buildPriceSnapshot(tokens, priceMap);
    expect(() => JSON.parse(result.pricesJson)).not.toThrow();
    expect(() => JSON.parse(result.weightsJson)).not.toThrow();
    expect(() => JSON.parse(result.sourceJson)).not.toThrow();
  });

  it('weights in output sum to 1.0', () => {
    const tokens = [
      { symbol: 'SOL',  weight: 60, mint: SOL_MINT },
      { symbol: 'USDC', weight: 40, mint: USDC_MINT },
    ];
    const priceMap = new Map([
      [lc(SOL_MINT),  makePrice(200)],
      [lc(USDC_MINT), makePrice(1)],
    ]);

    const result = buildPriceSnapshot(tokens, priceMap);
    const weights = JSON.parse(result.weightsJson) as Record<string, number>;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});
