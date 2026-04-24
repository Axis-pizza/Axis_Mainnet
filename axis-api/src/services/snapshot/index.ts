/**
 * Strategy Price Snapshot Worker
 *
 * Runs every 5 minutes via Cloudflare Cron Trigger.
 * Writes to two separate D1 databases:
 *   mainDb  (axis_main_db) — strategies, strategy_deployment_baseline
 *   priceDb (axis_price_db) — strategy_price_snapshots, strategy_performance, token_prices
 */

import { fetchPrices, resolveMint, PriceResult } from './price-fetcher';

const BUCKET_SECONDS = 300; // 5 minutes
const D1_BATCH_LIMIT = 50;  // conservative limit for D1 batch

interface TokenEntry {
  symbol: string;
  weight: number;
  mint: string | null;
}

interface StrategyRow {
  id: string;
  composition: string | null;
  config: string | null;
  tvl: number | null;
}

interface BaselineRow {
  strategy_id: string;
  baseline_nav: number;
}

export async function runPriceSnapshot(mainDb: any, priceDb: any): Promise<void> {
  const startMs = Date.now();
  const tsBucket = Math.floor(startMs / 1000 / BUCKET_SECONDS) * BUCKET_SECONDS;

  // 1. Fetch all strategies from mainDb
  const { results: rows } = await mainDb.prepare(
    'SELECT id, composition, config, tvl FROM strategies WHERE status = ?'
  ).bind('active').all() as { results: StrategyRow[] };

  if (!rows || rows.length === 0) {
    console.log('[Snapshot] No active strategies found.');
    return;
  }

  // 2. Fetch existing baselines from mainDb (to calculate ROI)
  const { results: baselineRows } = await mainDb.prepare(
    'SELECT strategy_id, baseline_nav FROM strategy_deployment_baseline'
  ).all() as { results: BaselineRow[] };
  const baselineMap = new Map(baselineRows.map(b => [b.strategy_id, b.baseline_nav]));

  // 3. Parse tokens and collect all unique mints
  const strategyTokens = new Map<string, TokenEntry[]>();
  const allMints = new Set<string>();
  const mintToSymbol = new Map<string, string>();

  for (const row of rows) {
    const tokens = parseTokens(row);
    strategyTokens.set(row.id, tokens);
    for (const t of tokens) {
      if (t.mint) {
        allMints.add(t.mint);
        mintToSymbol.set(t.mint.toLowerCase(), t.symbol);
      }
    }
  }

  // 4. Batch fetch all prices (deduplicated by mint)
  const priceMap = await fetchPrices([...allMints]);

  // 5. Build statements for priceDb and mainDb
  const priceSnapshotStmts: any[] = [];
  const performanceStmts: any[]   = [];
  const baselineStmts: any[]      = [];
  const now = Math.floor(Date.now() / 1000);

  for (const row of rows) {
    const tokens = strategyTokens.get(row.id)!;
    const { indexPriceUsd, pricesJson, weightsJson, sourceJson, confidence } =
      buildPriceSnapshot(tokens, priceMap);

    // strategy_price_snapshots → priceDb
    priceSnapshotStmts.push(
      priceDb.prepare(`
        INSERT OR REPLACE INTO strategy_price_snapshots
          (strategy_id, ts_bucket_utc, prices_json, weights_json,
           source_json, confidence, version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `).bind(
        row.id, tsBucket,
        pricesJson, weightsJson, sourceJson, confidence, now
      )
    );

    // strategy_performance → priceDb
    const baselineNav = baselineMap.get(row.id) ?? indexPriceUsd;
    const nav     = indexPriceUsd;
    const roiPct  = baselineNav > 0
      ? ((nav - baselineNav) / baselineNav) * 100
      : 0;

    performanceStmts.push(
      priceDb.prepare(`
        INSERT OR REPLACE INTO strategy_performance
          (strategy_id, ts_bucket_utc, nav_sol, total_tvl_sol, roi_pct, drawdown_pct, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `).bind(
        row.id, tsBucket,
        nav,
        row.tvl ?? 0,
        roiPct,
        now
      )
    );

    // strategy_deployment_baseline → mainDb (INSERT OR IGNORE: 初回のみ記録)
    baselineStmts.push(
      mainDb.prepare(`
        INSERT OR IGNORE INTO strategy_deployment_baseline
          (strategy_id, baseline_ts_bucket_utc, baseline_nav, baseline_confidence, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(row.id, tsBucket, indexPriceUsd, confidence, now)
    );
  }

  // 6. token_prices → priceDb (recorded_at はunix秒)
  const tokenPriceStmts: any[] = [];
  for (const mint of allMints) {
    const price  = priceMap.get(mint.toLowerCase());
    const symbol = mintToSymbol.get(mint.toLowerCase());
    if (price && price.price_usd > 0 && symbol) {
      tokenPriceStmts.push(
        priceDb.prepare(`
          INSERT OR REPLACE INTO token_prices (token_name, recorded_at, price_usd)
          VALUES (?, ?, ?)
        `).bind(symbol, tsBucket, price.price_usd)
      );
    }
  }

  // 7. Execute in batches
  await batchExecute(priceDb, [...priceSnapshotStmts, ...performanceStmts, ...tokenPriceStmts]);
  await batchExecute(mainDb, baselineStmts);

  // 8. Purge records older than 7 days
  const oneWeekAgo = tsBucket - 7 * 24 * 3600;
  await priceDb.batch([
    priceDb.prepare('DELETE FROM strategy_price_snapshots WHERE ts_bucket_utc < ?').bind(oneWeekAgo),
    priceDb.prepare('DELETE FROM strategy_performance WHERE ts_bucket_utc < ?').bind(oneWeekAgo),
    priceDb.prepare('DELETE FROM token_prices WHERE recorded_at < ?').bind(oneWeekAgo),
  ]);

  const elapsed = Date.now() - startMs;
  console.log(
    `[Snapshot] Done: ${rows.length} strategies, ${allMints.size} mints, ` +
    `bucket=${tsBucket}, purged<${oneWeekAgo}, ${elapsed}ms`
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function parseTokens(row: StrategyRow): TokenEntry[] {
  const raw = row.composition || row.config;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((t: any) => t.symbol && typeof t.weight === 'number')
        .map((t: any) => ({
          symbol: t.symbol.toUpperCase(),
          weight: t.weight,
          mint: resolveMint(t),
        }));
    }
    return [];
  } catch {
    return [];
  }
}

/** @deprecated use buildPriceSnapshot */
export const buildSnapshot = (strategyId: string, tsBucket: number, tokens: TokenEntry[], priceMap: Map<string, PriceResult>) => {
  const result = buildPriceSnapshot(tokens, priceMap);
  return { strategy_id: strategyId, ts_bucket_utc: tsBucket, index_price: result.indexPriceUsd, ...result };
};

export function buildPriceSnapshot(
  tokens: TokenEntry[],
  priceMap: Map<string, PriceResult>
): {
  indexPriceUsd: number;
  pricesJson: string;
  weightsJson: string;
  sourceJson: string;
  confidence: 'OK' | 'PARTIAL' | 'FAIL';
} {
  if (tokens.length === 0) {
    return {
      indexPriceUsd: 0,
      pricesJson: '{}', weightsJson: '{}', sourceJson: '{}',
      confidence: 'FAIL',
    };
  }

  const totalWeight = tokens.reduce((sum, t) => sum + t.weight, 0);
  if (totalWeight === 0) {
    return {
      indexPriceUsd: 0,
      pricesJson: '{}', weightsJson: '{}', sourceJson: '{}',
      confidence: 'FAIL',
    };
  }

  const prices:  Record<string, number> = {};
  const weights: Record<string, number> = {};
  const sources: Record<string, string> = {};
  let indexPriceUsd = 0;
  let missingCount  = 0;

  for (const token of tokens) {
    const normWeight = token.weight / totalWeight;
    const key = token.mint ?? token.symbol;
    weights[key] = normWeight;

    if (!token.mint) {
      prices[key] = 0; sources[key] = 'no_mint'; missingCount++; continue;
    }

    const result   = priceMap.get(token.mint.toLowerCase());
    const priceUsd = result?.price_usd ?? 0;
    prices[token.mint]  = priceUsd;
    sources[token.mint] = result?.source ?? 'none';
    if (priceUsd === 0) missingCount++;
    indexPriceUsd += normWeight * priceUsd;
  }

  const confidence: 'OK' | 'PARTIAL' | 'FAIL' =
    missingCount === 0 ? 'OK' :
    missingCount < tokens.length ? 'PARTIAL' : 'FAIL';

  return {
    indexPriceUsd,
    pricesJson:  JSON.stringify(prices),
    weightsJson: JSON.stringify(weights),
    sourceJson:  JSON.stringify(sources),
    confidence,
  };
}

async function batchExecute(db: any, stmts: any[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += D1_BATCH_LIMIT) {
    await db.batch(stmts.slice(i, i + D1_BATCH_LIMIT));
  }
}
