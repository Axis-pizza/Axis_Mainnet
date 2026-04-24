import { describe, it, expect } from 'vitest';
import { fetchPrices } from '../services/snapshot/price-fetcher';
import { buildPriceSnapshot } from '../services/snapshot';

const SOL_MINT  = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUP_MINT  = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';

describe('fetchPrices — live DexScreener', () => {
  it('returns price > 0 for SOL', async () => {
    const map = await fetchPrices([SOL_MINT]);
    const sol = map.get(SOL_MINT.toLowerCase());
    expect(sol).toBeDefined();
    expect(sol!.price_usd).toBeGreaterThan(0);
    expect(sol!.source).toBe('dexscreener');
  }, 15000);

  it('returns $1 for USDC (stablecoin hardcoded)', async () => {
    const map = await fetchPrices([USDC_MINT]);
    const usdc = map.get(USDC_MINT.toLowerCase());
    expect(usdc?.price_usd).toBe(1.0);
    expect(usdc?.source).toBe('hardcoded_stable');
  }, 15000);

  it('fetches multiple mints in one call', async () => {
    const map = await fetchPrices([SOL_MINT, USDC_MINT, JUP_MINT]);
    expect(map.size).toBe(3);
    expect(map.get(SOL_MINT.toLowerCase())!.price_usd).toBeGreaterThan(0);
    expect(map.get(USDC_MINT.toLowerCase())!.price_usd).toBe(1.0);
  }, 15000);
});

describe('buildPriceSnapshot — with live prices', () => {
  it('computes valid index price for SOL/USDC 50/50', async () => {
    const tokens = [
      { symbol: 'SOL',  weight: 0.5, mint: SOL_MINT },
      { symbol: 'USDC', weight: 0.5, mint: USDC_MINT },
    ];
    const priceMap = await fetchPrices([SOL_MINT, USDC_MINT]);
    const result = buildPriceSnapshot(tokens, priceMap);

    expect(result.confidence).toBe('OK');
    expect(result.indexPriceUsd).toBeGreaterThan(0);

    // SOL価格の半分 + $0.5 ≈ indexPrice
    const solPrice = priceMap.get(SOL_MINT.toLowerCase())!.price_usd;
    expect(result.indexPriceUsd).toBeCloseTo(solPrice * 0.5 + 0.5, 1);

    console.log(`SOL: $${solPrice} → index: $${result.indexPriceUsd.toFixed(4)}`);
  }, 15000);

  it('ROI stays 0 when comparing identical price snapshots', async () => {
    const tokens = [
      { symbol: 'SOL',  weight: 0.5, mint: SOL_MINT },
      { symbol: 'USDC', weight: 0.5, mint: USDC_MINT },
    ];
    const priceMap = await fetchPrices([SOL_MINT, USDC_MINT]);

    const { indexPriceUsd: nav1 } = buildPriceSnapshot(tokens, priceMap);
    const { indexPriceUsd: nav2 } = buildPriceSnapshot(tokens, priceMap);

    const roi = ((nav2 - nav1) / nav1) * 100;
    expect(roi).toBe(0);
  }, 15000);

  it('weights in pricesJson match actual mints', async () => {
    const tokens = [
      { symbol: 'SOL',  weight: 0.6, mint: SOL_MINT },
      { symbol: 'USDC', weight: 0.4, mint: USDC_MINT },
    ];
    const priceMap = await fetchPrices([SOL_MINT, USDC_MINT]);
    const result = buildPriceSnapshot(tokens, priceMap);

    const weights = JSON.parse(result.weightsJson);
    expect(weights[SOL_MINT]).toBeCloseTo(0.6);
    expect(weights[USDC_MINT]).toBeCloseTo(0.4);
  }, 15000);
});
