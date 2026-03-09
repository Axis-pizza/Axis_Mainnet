/**
 * price-fetcher.ts の動作確認用スクリプト
 * 実行: pnpm test:price
 *
 * 価格取得の優先順位:
 *   1. DexScreener（メイン）
 *   2. Jupiter Price API v3 / lite-api.jup.ag（フォールバック）
 *      - JUPITER_API_KEY が .dev.vars に設定されている場合は x-api-key ヘッダーで送信
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.dev.vars' }); // Cloudflare Workers のローカル環境変数ファイル
import { fetchPrices } from './price-fetcher.js';
import { STRICT_LIST } from '../../config/constants.js';

// STRICT_LIST の全トークンを対象にテスト
const TEST_MINTS = STRICT_LIST.map(t => t.address);

const results = await fetchPrices(TEST_MINTS);

console.log('\n=== テスト結果 ===');
for (const t of STRICT_LIST) {
  const result = results.get(t.address.toLowerCase());
  if (result && result.price_usd > 0) {
    console.log(`✅ ${t.symbol.padEnd(8)}: $${result.price_usd} (source: ${result.source})`);
  } else {
    console.log(`❌ ${t.symbol.padEnd(8)}: 取得失敗 (source: ${result?.source ?? 'none'})`);
  }
}