import { buildSnapshot } from '../../../services/snapshot/index.js';

// 使用するトークンとそれぞれの重み
const tokens = [
    { symbol: 'SOL',  weight: 2,  mint: 'So11111111111111111111111111111111111111112' },
    { symbol: 'USDC', weight: 7, mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    { symbol: 'WBTC', weight: 1,  mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh' },
];

// モック価格データ
const priceMap = new Map([
    ['So11111111111111111111111111111111111111112',       { price_usd: 85,    source: 'test' }],
    ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',   { price_usd: 1,      source: 'test' }],
    ['3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',   { price_usd: 70000, source: 'test' }],
]);

// 期待値: (2/10×85) + (7/10×1) + (1/10×70000) = 7017.333...
const EXPECTED = (2/10 * 85) + (7/10 * 1) + (1/10 * 70000);

// Jestのテストケース
test('正常系: index_priceを加重計算', () => {
    const result = buildSnapshot('strategy-1', 0, tokens, priceMap);
    console.log(JSON.stringify({ index_price: result.index_price, expected: EXPECTED }, null, 2));
    expect(result.index_price).toBeCloseTo(EXPECTED, 5);
});