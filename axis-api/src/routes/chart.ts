import { Context } from 'hono';
import { Bindings } from '../config/env';

// GET /strategies/:id/linechart?period=7d  (also mounted at /chart)
// token_prices から composition の重み付きでインデックス価格を計算して返す
// value = Σ (token_price_usd × weight / 100) per timestamp
export async function getLineChartData(c: Context<{ Bindings: Bindings }>) {
  const strategyId = c.req.param('id');
  const recordPeriod = c.req.query('period') ?? '7d';

  // period → unix秒 (mainnet: recorded_at は INTEGER unix秒)
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

  // token_prices から期間内の価格履歴を取得 (recorded_at は INTEGER unix秒)
  const symbols = composition.map(t => t.symbol);
  const placeholders = symbols.map(() => '?').join(', ');
  const { results } = await c.env.axis_price_db.prepare(
    `SELECT token_name, recorded_at, price_usd
     FROM token_prices
     WHERE token_name IN (${placeholders}) AND recorded_at >= ?
     ORDER BY recorded_at ASC`
  ).bind(...symbols, fromUnix).all();

  // recorded_at ごとにトークン価格をまとめる
  const pricesByTimestamp = new Map<number, Map<string, number>>();
  for (const row of results as any[]) {
    const ts = row.recorded_at as number;
    if (!pricesByTimestamp.has(ts)) pricesByTimestamp.set(ts, new Map());
    pricesByTimestamp.get(ts)!.set(row.token_name as string, row.price_usd as number);
  }

  // weight は小数(0.5)でも整数パーセント(50)でも対応できるよう totalWeight で正規化
  const totalWeight = composition.reduce((sum, t) => sum + t.weight, 0);

  // タイムスタンプごとに Σ (price × normWeight) を計算
  const linechartData: { time: number; value: number }[] = [];
  for (const [ts, tokenPrices] of pricesByTimestamp) {
    let calculatedIndexValue = 0;
    for (const { symbol, weight } of composition) {
      const price = tokenPrices.get(symbol);
      if (price && totalWeight > 0) {
        calculatedIndexValue += price * (weight / totalWeight);
      }
    }
    linechartData.push({ time: ts, value: calculatedIndexValue });
  }

  return c.json({ success: true, data: linechartData });
}

// GET /strategies/:id/token-prices?period=7d
// token_prices から個別トークン価格の時系列を返す（トークン内訳チャート用）
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

  if (!strategyRecord) {
    return c.json({ success: false, message: 'Strategy not found' }, 404);
  }

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
