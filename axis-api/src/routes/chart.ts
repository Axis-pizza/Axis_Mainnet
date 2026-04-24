import { Context } from 'hono';
import { Bindings } from '../config/env';

// GET /strategies/:id/chart?period=7d  (also: /linechart)
// token_prices から composition の重み付きでインデックス価格を計算して返す
export async function getLineChartData(c: Context<{ Bindings: Bindings }>) {
  const strategyId = c.req.param('id');
  const recordPeriod = c.req.query('period') ?? '7d';

  // period → fromUnix (mainnet: recorded_at は INTEGER unix秒)
  const now = Math.floor(Date.now() / 1000);
  let fromUnix: number;

  if (recordPeriod.endsWith('d')) {
    const days = parseInt(recordPeriod.slice(0, -1));
    if (isNaN(days)) return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
    fromUnix = now - days * 86400;
  } else if (recordPeriod.endsWith('h')) {
    const hours = parseInt(recordPeriod.slice(0, -1));
    if (isNaN(hours)) return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
    fromUnix = now - hours * 3600;
  } else {
    return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
  }

  // strategies から composition を取得
  const strategyRecord = await c.env.axis_main_db.prepare(
    'SELECT composition FROM strategies WHERE id = ? LIMIT 1'
  ).bind(strategyId).first();

  if (!strategyRecord) {
    return c.json({ success: false, message: 'Strategy not found' }, 404);
  }

  const composition = JSON.parse(strategyRecord.composition as string) as { symbol: string; weight: number }[];
  const totalWeight = composition.reduce((sum, t) => sum + t.weight, 0);

  // token_prices から期間内の価格履歴を取得
  const symbols = composition.map(t => t.symbol);
  const placeholders = symbols.map(() => '?').join(', ');
  const { results } = await c.env.axis_price_db.prepare(
    `SELECT token_name, recorded_at, price_usd
     FROM token_prices
     WHERE token_name IN (${placeholders}) AND recorded_at >= ?
     ORDER BY recorded_at ASC`
  ).bind(...symbols, fromUnix).all();

  // recorded_at ごとに token_name と price_usd をマッピング
  const pricesByTimestamp = new Map<number, Map<string, number>>();
  for (const row of results as any[]) {
    const ts = row.recorded_at as number;
    if (!pricesByTimestamp.has(ts)) pricesByTimestamp.set(ts, new Map());
    pricesByTimestamp.get(ts)!.set(row.token_name as string, row.price_usd as number);
  }

  // recorded_at ごとに Σ(price × weight / totalWeight) を計算
  const linechartData: { time: number; value: number }[] = [];
  for (const [ts, tokenPrices] of pricesByTimestamp) {
    let value = 0;
    for (const { symbol, weight } of composition) {
      const price = tokenPrices.get(symbol);
      if (price && totalWeight > 0) value += price * (weight / totalWeight);
    }
    linechartData.push({ time: ts, value });
  }

  return c.json({ success: true, data: linechartData });
}

// GET /strategies/:id/candles?period=7d&interval=30m
// ローソク足チャート用のデータを返す (interval: 5m, 15m, 30m, 1h, 4h, 1d)
export async function getCandleChartData(c: Context<{ Bindings: Bindings }>) {
  const strategyId = c.req.param('id');
  const recordPeriod = c.req.query('period') ?? '7d';
  const intervalParam = c.req.query('interval') ?? '30m';

  // interval → seconds
  const INTERVAL_MAP: Record<string, number> = {
    '5m': 5 * 60, '15m': 15 * 60, '30m': 30 * 60,
    '1h': 3600, '4h': 4 * 3600, '1d': 86400,
  };
  const CANDLE = INTERVAL_MAP[intervalParam];
  if (!CANDLE) {
    return c.json({ success: false, message: 'Invalid interval. Use 5m, 15m, 30m, 1h, 4h, or 1d' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  let fromUnix: number;

  if (recordPeriod.endsWith('d')) {
    const days = parseInt(recordPeriod.slice(0, -1));
    if (isNaN(days)) return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
    fromUnix = now - days * 86400;
  } else if (recordPeriod.endsWith('h')) {
    const hours = parseInt(recordPeriod.slice(0, -1));
    if (isNaN(hours)) return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
    fromUnix = now - hours * 3600;
  } else {
    return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
  }

  // strategies から composition を取得
  const strategyRecord = await c.env.axis_main_db.prepare(
    'SELECT composition FROM strategies WHERE id = ? LIMIT 1'
  ).bind(strategyId).first();

  if (!strategyRecord) {
    return c.json({ success: false, message: 'Strategy not found' }, 404);
  }

  const composition = JSON.parse(strategyRecord.composition as string) as { symbol: string; weight: number }[];
  const totalWeight = composition.reduce((sum, t) => sum + t.weight, 0);

  // token_prices から期間内の価格履歴を取得
  const symbols = composition.map(t => t.symbol);
  const placeholders = symbols.map(() => '?').join(', ');
  const { results } = await c.env.axis_price_db.prepare(
    `SELECT token_name, recorded_at, price_usd
     FROM token_prices
     WHERE token_name IN (${placeholders}) AND recorded_at >= ?
     ORDER BY recorded_at ASC`
  ).bind(...symbols, fromUnix).all();

  if (results.length === 0) {
    return c.json({ success: true, interval: intervalParam, data: [] });
  }

  // recorded_at ごとに token_name と price_usd をマッピング
  const pricesByTimestamp = new Map<number, Map<string, number>>();
  for (const row of results as any[]) {
    const ts = row.recorded_at as number;
    if (!pricesByTimestamp.has(ts)) pricesByTimestamp.set(ts, new Map());
    pricesByTimestamp.get(ts)!.set(row.token_name as string, row.price_usd as number);
  }

  // recorded_at ごとの index 値を計算
  const indexValues: { time: number; value: number }[] = [];
  for (const [ts, tokenPrices] of pricesByTimestamp) {
    let value = 0;
    for (const { symbol, weight } of composition) {
      const price = tokenPrices.get(symbol);
      if (price && totalWeight > 0) value += price * (weight / totalWeight);
    }
    indexValues.push({ time: ts, value });
  }
  indexValues.sort((a, b) => a.time - b.time);

  // interval ごとにグループ化
  const candleMap = new Map<number, number[]>();
  for (const { time, value } of indexValues) {
    const candleStart = Math.floor(time / CANDLE) * CANDLE;
    if (!candleMap.has(candleStart)) candleMap.set(candleStart, []);
    candleMap.get(candleStart)!.push(value);
  }

  // OHLC を計算 (standard: { time, open, high, low, close })
  const data: { time: number; open: number; high: number; low: number; close: number }[] = [];
  for (const [candleStart, values] of [...candleMap.entries()].sort((a, b) => a[0] - b[0])) {
    data.push({
      time:  candleStart,
      open:  values[0],
      high:  Math.max(...values),
      low:   Math.min(...values),
      close: values[values.length - 1],
    });
  }

  return c.json({ success: true, interval: intervalParam, data });
}

// GET /strategies/:id/token-prices?period=7d
// 個別トークン価格の時系列（トークン内訳チャート用）
export async function getTokenPriceChart(c: Context<{ Bindings: Bindings }>) {
  const strategyId = c.req.param('id');
  const recordPeriod = c.req.query('period') ?? '7d';

  const now = Math.floor(Date.now() / 1000);
  let fromUnix: number;

  if (recordPeriod.endsWith('d')) {
    const days = parseInt(recordPeriod.slice(0, -1));
    if (isNaN(days)) return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
    fromUnix = now - days * 86400;
  } else if (recordPeriod.endsWith('h')) {
    const hours = parseInt(recordPeriod.slice(0, -1));
    if (isNaN(hours)) return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
    fromUnix = now - hours * 3600;
  } else {
    return c.json({ success: false, message: 'Invalid period format. Use e.g. 7d, 24h' }, 400);
  }

  const strategyRecord = await c.env.axis_main_db.prepare(
    'SELECT composition FROM strategies WHERE id = ? LIMIT 1'
  ).bind(strategyId).first();

  if (!strategyRecord) return c.json({ success: false, message: 'Strategy not found' }, 404);

  const composition = JSON.parse(strategyRecord.composition as string) as { symbol: string; weight: number }[];
  const symbols = composition.map(t => t.symbol);
  const placeholders = symbols.map(() => '?').join(', ');

  const { results } = await c.env.axis_price_db.prepare(
    `SELECT token_name, recorded_at, price_usd
     FROM token_prices
     WHERE token_name IN (${placeholders}) AND recorded_at >= ?
     ORDER BY recorded_at ASC`
  ).bind(...symbols, fromUnix).all();

  const byToken: Record<string, { time: number; value: number }[]> = {};
  for (const row of results as any[]) {
    const name = row.token_name as string;
    if (!byToken[name]) byToken[name] = [];
    byToken[name].push({ time: row.recorded_at as number, value: row.price_usd as number });
  }

  return c.json({ success: true, data: byToken });
}
