import { describe, test, expect } from 'vitest';
import { Hono } from 'hono';
import { getLineChartData, getCandleChartData, getTokenPriceChart } from '../routes/chart';
import type { Bindings } from '../config/env';

// mainnet: recorded_at は INTEGER unix秒
const T1 = 1743378300; // 2026-03-30T23:45:00Z
const T2 = 1743378600; // 2026-03-30T23:50:00Z
const T3 = 1743378900; // 2026-03-30T23:55:00Z
const T4 = 1743379200; // 2026-03-31T00:00:00Z

const STRATEGY_ID = 'strategy-123';

// strategies テーブルのモックデータ
const compositionRow = {
  composition: JSON.stringify([
    { symbol: 'SOL',  weight: 50, address: 'So11111111111111111111111111111111111111112' },
    { symbol: 'USDC', weight: 50, address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  ]),
};

// token_prices テーブルのモックデータ (recorded_at = INTEGER unix秒)
const tokenPriceRows = [
  { token_name: 'SOL',  recorded_at: T1, price_usd: 60.0 },
  { token_name: 'USDC', recorded_at: T1, price_usd: 1.0 },
  { token_name: 'SOL',  recorded_at: T2, price_usd: 59.0 },
  { token_name: 'USDC', recorded_at: T2, price_usd: 0.9 },
  { token_name: 'SOL',  recorded_at: T3, price_usd: 59.0 },
  { token_name: 'USDC', recorded_at: T3, price_usd: 0.95 },
  { token_name: 'SOL',  recorded_at: T4, price_usd: 58.0 },
  { token_name: 'USDC', recorded_at: T4, price_usd: 1.0 },
];

// USDCが欠損しているケース
const partialTokenPriceRows = tokenPriceRows.filter(r => r.token_name === 'SOL');

// 先頭が欠損しているケース
const emptyTopTokenPriceRows = tokenPriceRows.filter(r => r.recorded_at >= T3);

function makeMainDb(strategy: any = compositionRow) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => strategy,
        all:   async () => ({ results: strategy ? [strategy] : [] }),
      }),
    }),
  };
}

function makePriceDb(rows = tokenPriceRows) {
  return {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: rows }),
      }),
    }),
  };
}

const app = new Hono<{ Bindings: Bindings }>()
  .get('/strategies/:id/linechart',    getLineChartData)
  .get('/strategies/:id/chart',        getLineChartData)
  .get('/strategies/:id/candles',      getCandleChartData)
  .get('/strategies/:id/token-prices', getTokenPriceChart);

// ─────────────────────────────────────────────
// getLineChartData: 計算ロジック
// value = Σ (price × weight / totalWeight) per timestamp
// weight=50, totalWeight=100 → normWeight=0.5
// T1: SOL 60×0.5 + USDC 1×0.5 = 30.5
// T4: SOL 58×0.5 + USDC 1×0.5 = 29.5
// ─────────────────────────────────────────────
describe('GET /strategies/:id/linechart', () => {
  test('正常: タイムスタンプごとに Σ(price × weight/100) を計算して返す', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/linechart?period=7d`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(4);
    // T1: 60×50/100 + 1×50/100 = 30.5
    expect(json.data[0]).toEqual({ time: T1, value: 30.5 });
    // T4: 58×50/100 + 1×50/100 = 29.5
    expect(json.data[3]).toEqual({ time: T4, value: 29.5 });
  });

  test('正常: period省略時は7dがデフォルト', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/linechart`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
  });

  test('異常: strategy が存在しない場合は404', async () => {
    const res = await app.request(
      '/strategies/nonexistent/linechart?period=7d',
      {},
      { axis_main_db: makeMainDb(null), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(404);
  });

  test('異常: token_price が全て欠損している場合は空配列', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/linechart?period=7d`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb([]) } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data).toEqual([]);
  });

  test('異常: token_price の一部が欠損している場合、あるデータのみで計算して返す', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/linechart?period=7d`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb(partialTokenPriceRows) } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    // USDCが欠損 → SOLのみで計算: 60×50/100 = 30.0
    expect(json.data[0]).toEqual({ time: T1, value: 30.0 });
  });

  test('異常: 先頭が欠損している場合、存在するデータのみで計算して返す', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/linechart?period=7d`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb(emptyTopTokenPriceRows) } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(2); // T3, T4 のみ
    // T3: 59×50/100 + 0.95×50/100 = 29.975
    expect(json.data[0].value).toBeCloseTo(29.975);
  });

  test('正常: 24h period を受け付ける', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/linechart?period=24h`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(200);
  });

  test('異常: period フォーマットが不正な場合は400', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/linechart?period=invalid`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────
// getCandleChartData
// T1〜T4 は 300秒間隔。interval=30m(1800s) なら全て同一バケットに集約
// T1 index=30.5, T2=29.95, T3=29.975, T4=29.5
// OHLC: O=30.5, H=30.5, L=29.5, C=29.5
// ─────────────────────────────────────────────
describe('GET /strategies/:id/candles', () => {
  test('正常: 30m足でOHLCを集約して返す', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/candles?period=7d&interval=30m`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    const candle = json.data[0];
    expect(candle).toHaveProperty('time');
    expect(candle).toHaveProperty('open');
    expect(candle).toHaveProperty('high');
    expect(candle).toHaveProperty('low');
    expect(candle).toHaveProperty('close');
    expect(candle).not.toHaveProperty('datetime');
    // T1,T2,T3 は同一30mバケット / T4は次のバケット境界
    // 最初のキャンドル: O=T1(30.5), C=T3(29.975), H=30.5, L=29.95
    expect(candle.open).toBeCloseTo(30.5, 1);
    expect(candle.close).toBeCloseTo(29.975, 2);
    expect(candle.high).toBeGreaterThanOrEqual(candle.low);
  });

  test('正常: 5m足では各タイムスタンプが別キャンドルになる', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/candles?period=7d&interval=5m`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    const json = await res.json() as any;
    // 5m足(300秒)はちょうど各バケットと一致するので4本
    expect(json.data.length).toBe(4);
  });

  test('正常: intervalのデフォルトは30m', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/candles?period=7d`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.interval).toBe('30m');
  });

  test('異常: strategy が存在しない場合は404', async () => {
    const res = await app.request(
      '/strategies/nonexistent/candles?period=24h',
      {},
      { axis_main_db: makeMainDb(null), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(404);
  });

  test('異常: 不正なintervalは400', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/candles?period=7d&interval=invalid`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(400);
  });

  test('異常: データがない場合は空配列', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/candles?period=7d`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb([]) } as any,
    );
    const json = await res.json() as any;
    expect(json.data).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// GET /strategies/:id/chart (フロントが使うエイリアス)
// ─────────────────────────────────────────────
describe('GET /strategies/:id/chart (frontend alias)', () => {
  test('24h period で正しくデータを返す', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/chart?period=24h`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data[0]).toHaveProperty('time');
    expect(json.data[0]).toHaveProperty('value');
  });

  test('24h change は (last - first) / first × 100 で計算できる', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/chart?period=24h`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    const json = await res.json() as any;
    const first = json.data[0].value as number;
    const last  = json.data[json.data.length - 1].value as number;
    const change = ((last - first) / first) * 100;
    // T1=30.5, T4=29.5 → change ≈ -3.28%
    expect(change).toBeCloseTo(((29.5 - 30.5) / 30.5) * 100, 1);
  });

  test('strategy が存在しない場合は404', async () => {
    const res = await app.request(
      '/strategies/unknown/chart?period=24h',
      {},
      { axis_main_db: makeMainDb(null), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// getTokenPriceChart
// ─────────────────────────────────────────────
describe('GET /strategies/:id/token-prices', () => {
  test('token_name ごとにグループ化して返す', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/token-prices?period=7d`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('SOL');
    expect(json.data).toHaveProperty('USDC');
    expect(json.data['SOL'][0]).toEqual({ time: T1, value: 60.0 });
  });

  test('strategy が存在しない場合は404', async () => {
    const res = await app.request(
      '/strategies/nonexistent/token-prices',
      {},
      { axis_main_db: makeMainDb(null), axis_price_db: makePriceDb() } as any,
    );
    expect(res.status).toBe(404);
  });

  test('データが空の場合は空オブジェクトを返す', async () => {
    const res = await app.request(
      `/strategies/${STRATEGY_ID}/token-prices?period=7d`,
      {},
      { axis_main_db: makeMainDb(), axis_price_db: makePriceDb([]) } as any,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data).toEqual({});
  });
});
