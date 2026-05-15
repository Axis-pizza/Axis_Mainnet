/**
 * Verifies the equalizing seed allocator in jupiterSeed.ts using the repo's
 * own deterministic mock Jupiter client. No network / no mainnet tx.
 *
 * Run: ./node_modules/.bin/ts-node-esm scripts/verify-seed-equalize.ts
 */
import { Keypair } from '@solana/web3.js';
import { SOL_MINT } from '../src/protocol/axis-vault/jupiter';
import {
  buildJupiterSeedPreview,
  createMockJupiterQuoteClient,
} from '../src/protocol/axis-vault/jupiterSeed';

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

const SLIPPAGE = 50;
// Mirror the mock client's arithmetic so we can compute the *naive*
// weight-proportional bottleneck and prove the allocator beats it.
const mockMinOut = (lamports: bigint, bps: number) => {
  const out = (lamports * BigInt(bps)) / 10_000n;
  return (out * BigInt(10_000 - SLIPPAGE)) / 10_000n;
};

async function main() {
  // ── Scenario 1: normal token + a wBTC-like leg (tiny base units / lamport)
  const normal = Keypair.generate().publicKey;
  const wbtcLike = Keypair.generate().publicKey;
  const NORMAL_BPS = 85_000; // ~8.5 base units per lamport
  const WBTC_BPS = 12; // 8-dec high-price: ~0.0012 base units per lamport
  const client = createMockJupiterQuoteClient({
    outputBpsByMint: {
      [normal.toBase58()]: NORMAL_BPS,
      [wbtcLike.toBase58()]: WBTC_BPS,
    },
  });
  const solIn = 1_000_000_000n; // 1 SOL
  const weights = [5_000, 5_000];

  const preview = await buildJupiterSeedPreview({
    basketMints: [normal, wbtcLike],
    weights,
    solIn,
    slippageBps: SLIPPAGE,
    quoteClient: client,
  });

  const legSum = preview.legs.reduce((a, l) => a + l.solLamports, 0n);
  check('Σ leg lamports === solIn (conservation)', legSum === solIn, `${legSum} vs ${solIn}`);

  // Naive weight-proportional bottleneck (what the OLD code would yield).
  const halfA = solIn / 2n;
  const halfB = solIn - halfA;
  const naiveCandA = (mockMinOut(halfA, NORMAL_BPS) * 10_000n) / 5_000n;
  const naiveCandB = (mockMinOut(halfB, WBTC_BPS) * 10_000n) / 5_000n;
  const naiveMin = naiveCandA < naiveCandB ? naiveCandA : naiveCandB;

  check(
    'equalized depositAmount strictly beats naive weight-split bottleneck',
    preview.depositAmount > naiveMin,
    `equalized=${preview.depositAmount} naiveMin=${naiveMin} (ratio≈${
      naiveMin > 0n ? (Number(preview.depositAmount) / Number(naiveMin)).toFixed(2) : 'inf'
    }x; ~2x is the ceiling for 2 equal-weight legs)`
  );

  // Per-leg candidates should be ~equal after reallocation (mock is linear,
  // so equalization is near-exact; allow 2% for integer rounding).
  const cands = preview.legs.map(
    (l) => (l.minOut * 10_000n) / BigInt(l.weightBps)
  );
  const maxC = cands.reduce((a, b) => (a > b ? a : b));
  const minC = cands.reduce((a, b) => (a < b ? a : b));
  check(
    'per-leg deposit candidates equalized within 2%',
    maxC > 0n && (maxC - minC) * 100n <= maxC * 2n,
    `min=${minC} max=${maxC}`
  );

  // The wBTC-like leg must receive far more SOL than the normal leg.
  const solNormal = preview.legs[0].solLamports;
  const solWbtc = preview.legs[1].solLamports;
  check(
    'expensive (wBTC-like) leg gets the larger SOL share',
    solWbtc > solNormal,
    `normal=${solNormal} wbtc=${solWbtc}`
  );

  // ── Scenario 1b: realistic "too much SOL" case — wBTC-like leg at a
  // small 10% weight inside an otherwise normal 3-token basket. This is the
  // shape Muse hit: a low-weight, low-base-unit leg tanks the naive
  // bottleneck and forces an absurd seed. Equalization should recover a
  // large multiple here.
  const a = Keypair.generate().publicKey;
  const b = Keypair.generate().publicKey;
  const wbtc3 = Keypair.generate().publicKey;
  const c1b = createMockJupiterQuoteClient({
    outputBpsByMint: {
      [a.toBase58()]: 90_000,
      [b.toBase58()]: 70_000,
      [wbtc3.toBase58()]: 12,
    },
  });
  const w3 = [4_500, 4_500, 1_000];
  const p1b = await buildJupiterSeedPreview({
    basketMints: [a, b, wbtc3],
    weights: w3,
    solIn,
    slippageBps: SLIPPAGE,
    quoteClient: c1b,
  });
  const split3 = w3.map((w) => (solIn * BigInt(w)) / 10_000n);
  split3[2] += solIn - split3.reduce((x, y) => x + y, 0n);
  const naive3 = [
    (mockMinOut(split3[0], 90_000) * 10_000n) / BigInt(w3[0]),
    (mockMinOut(split3[1], 70_000) * 10_000n) / BigInt(w3[1]),
    (mockMinOut(split3[2], 12) * 10_000n) / BigInt(w3[2]),
  ].reduce((x, y) => (x < y ? x : y));
  check(
    '3-leg low-weight wBTC: equalized ≥ 3x the naive bottleneck',
    p1b.depositAmount >= naive3 * 3n,
    `equalized=${p1b.depositAmount} naive=${naive3} (ratio≈${
      naive3 > 0n ? (Number(p1b.depositAmount) / Number(naive3)).toFixed(1) : 'inf'
    }x)`
  );

  // ── Scenario 2: SOL-only basket — must not throw, no reallocation.
  const solOnly = await buildJupiterSeedPreview({
    basketMints: [SOL_MINT, SOL_MINT],
    weights: [6_000, 4_000],
    solIn,
    slippageBps: SLIPPAGE,
    quoteClient: client,
  });
  const solOnlySum = solOnly.legs.reduce((a, l) => a + l.solLamports, 0n);
  check('SOL-only basket conserves Σ and does not throw', solOnlySum === solIn);
  check(
    'SOL-only basket keeps weight split (6000/4000)',
    solOnly.legs[0].solLamports === (solIn * 6_000n) / 10_000n
  );

  // ── Scenario 3: an illiquid leg (0 out) — graceful, no throw/regression.
  const illiquid = Keypair.generate().publicKey;
  const c3 = createMockJupiterQuoteClient({
    outputBpsByMint: {
      [normal.toBase58()]: NORMAL_BPS,
      [illiquid.toBase58()]: 0,
    },
  });
  const p3 = await buildJupiterSeedPreview({
    basketMints: [normal, illiquid],
    weights,
    solIn,
    slippageBps: SLIPPAGE,
    quoteClient: c3,
  });
  check(
    'illiquid leg → falls back safely (depositAmount 0, Σ conserved)',
    p3.depositAmount === 0n &&
      p3.legs.reduce((a, l) => a + l.solLamports, 0n) === solIn
  );

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
