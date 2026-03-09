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

// テスト対象のmintアドレス（SOL, USDC, JUP）
const TEST_MINTS = [
  'So11111111111111111111111111111111111111112',   // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  // JUPのmintアドレスが変更されていたため、最新のものに更新
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  // JUP
];

// JUPITER_API_KEY は Jupiter フォールバック時に x-api-key ヘッダーとして使用
const apiKey = process.env.JUPITER_API_KEY;
console.log(`JUPITER_API_KEY: ${apiKey ? '設定あり' : '未設定（認証なしで lite-api.jup.ag を使用）'}\n`);

const results = await fetchPrices(TEST_MINTS, apiKey);

console.log('\n=== テスト結果 ===');
for (const [mint, result] of results) {
  const label = `${mint.slice(0, 8)}...`;
  if (result.price_usd > 0) {
    console.log(`✅ ${label}: $${result.price_usd} (source: ${result.source})`);
  } else {
    console.log(`❌ ${label}: 取得失敗 (source: ${result.source})`);
  }
}