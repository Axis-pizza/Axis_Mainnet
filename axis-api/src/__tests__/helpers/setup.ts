import { SELF } from 'cloudflare:test';

export const TEST_STRATEGY_ID = 'test-strategy-0000-0000-0000-000000000001';
export const TEST_OWNER = 'TestOwner1111111111111111111111111111111111';

export async function seedStrategy(env: any) {
  const now = Math.floor(Date.now() / 1000);
  await env.axis_main_db.prepare(`
    INSERT OR REPLACE INTO strategies
      (id, owner_pubkey, name, ticker, description, type, composition, config, status, created_at, tvl, total_deposited, roi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 100, 100, 0)
  `).bind(
    TEST_STRATEGY_ID,
    TEST_OWNER,
    'Test ETF',
    'TETF',
    'Integration test strategy',
    'MANUAL',
    JSON.stringify([
      { symbol: 'SOL', weight: 0.5, mint: 'So11111111111111111111111111111111111111112' },
      { symbol: 'USDC', weight: 0.5, mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    ]),
    JSON.stringify({}),
    now
  ).run();
}

export async function cleanupStrategy(env: any) {
  await env.axis_main_db.prepare('DELETE FROM strategies WHERE id = ?').bind(TEST_STRATEGY_ID).run();
  await env.axis_main_db.prepare('DELETE FROM strategy_deployment_baseline WHERE strategy_id = ?').bind(TEST_STRATEGY_ID).run();
  await env.axis_price_db.prepare('DELETE FROM strategy_performance WHERE strategy_id = ?').bind(TEST_STRATEGY_ID).run();
  await env.axis_price_db.prepare('DELETE FROM strategy_price_snapshots WHERE strategy_id = ?').bind(TEST_STRATEGY_ID).run();
}
