import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  SOL_MINT,
  deserializeIx,
  fetchAltAccounts,
  getQuote,
  getSwapInstructions,
  type JupiterQuoteResponse,
} from './jupiter';
import { ixWithdraw } from './ix';
import {
  expectedWithdrawOutputs,
  fetchEtfState,
  fetchVaultBalances,
  type EtfStateData,
} from './etfState';
import {
  PER_LEG_MAX_ACCOUNTS_LADDER,
  SOLANA_MAX_TX_CU,
  tryCompileV0,
} from './depositSolPlan';
import {
  liveJupiterQuoteClient,
  type JupiterQuoteClient,
} from './jupiterSeed';

const FALLBACK_PRIORITY_MICRO_LAMPORTS = 50_000;

export interface WithdrawSolPlanArgs {
  conn: Connection;
  user: PublicKey;
  programId: PublicKey;
  etfState: PublicKey;
  etfStateData?: EtfStateData;
  burnAmount: bigint;
  safetyShrinkBps?: number;
  slippageBps?: number;
  maxAccounts?: number;
  priorityMicroLamports?: number;
}

export interface WithdrawSolLegPreview {
  mint: PublicKey;
  vault: PublicKey;
  expectedBasketOut: bigint;
  quotedBasketIn: bigint;
  quote: JupiterQuoteResponse;
  expectedSolOut: bigint;
  minSolOut: bigint;
  routeLabel: string;
}

export interface WithdrawSolPlan {
  mode: 'single' | 'split' | 'multi';
  /// `single`: full flow in one tx. `split`: tx 0 burns ETF, tx 1 swaps + closes.
  /// `multi`: tx 0 burns ETF, txs 1..k swap one leg each, tx k+1 closes wSOL.
  versionedTx: VersionedTransaction;
  /// `split` only: combined per-basket-leg swap tx + close-wSOL.
  swapTx?: VersionedTransaction;
  /// `multi` only: per-leg Jupiter swap txs (one per non-SOL basket mint).
  legTxs?: VersionedTransaction[];
  /// `multi` only: actual `maxAccounts` chosen for each leg in `legTxs` order.
  legMaxAccounts?: number[];
  /// `multi` only: optional close-wSOL tx that runs after all legs.
  cleanupTx?: VersionedTransaction;
  altAccounts: AddressLookupTableAccount[];
  legs: WithdrawSolLegPreview[];
  feeAmount: bigint;
  effectiveBurn: bigint;
  totalExpectedBasketOut: bigint;
  expectedSolOut: bigint;
  minSolOut: bigint;
  ixCount: number;
  txBytes: number;
  computeUnitLimit: number;
  computeUnitPrice: number;
}

function extractRouteLabel(quote: JupiterQuoteResponse): string {
  const first = quote.routePlan[0];
  if (
    typeof first === 'object' &&
    first !== null &&
    'swapInfo' in first &&
    typeof first.swapInfo === 'object' &&
    first.swapInfo !== null &&
    'label' in first.swapInfo &&
    typeof first.swapInfo.label === 'string'
  ) {
    return first.swapInfo.label;
  }
  return 'Jupiter';
}

export async function buildWithdrawSolPlan(args: WithdrawSolPlanArgs): Promise<WithdrawSolPlan> {
  if (args.burnAmount <= 0n) throw new Error('burnAmount must be > 0');

  const etf = args.etfStateData ?? (await fetchEtfState(args.conn, args.etfState));
  if (etf.paused) throw new Error('ETF is paused — Withdraw is disabled');
  if (etf.totalSupply === 0n) {
    throw new Error('ETF has no supply — nothing to withdraw');
  }
  if (args.burnAmount > etf.totalSupply) {
    throw new Error(`burnAmount ${args.burnAmount} > totalSupply ${etf.totalSupply}`);
  }

  const safetyShrinkBps = args.safetyShrinkBps ?? 100;
  const slippageBps = args.slippageBps ?? 50;
  const maxAccounts = args.maxAccounts ?? 16;

  const vaults = etf.tokenVaults;
  const mints = etf.tokenMints;

  const vaultBalances = await fetchVaultBalances(args.conn, vaults);
  const { feeAmount, effectiveBurn, perLeg } = expectedWithdrawOutputs(
    vaultBalances,
    args.burnAmount,
    etf.totalSupply,
    etf.feeBps
  );
  const totalExpectedBasketOut = perLeg.reduce((s, v) => s + v, 0n);
  if (totalExpectedBasketOut === 0n) {
    throw new Error('expected basket output is zero — burnAmount too small');
  }

  const userBasketAtas = mints.map((m) => getAssociatedTokenAddressSync(m, args.user, false));
  const userEtfAta = getAssociatedTokenAddressSync(etf.etfMint, args.user, false);
  const userWsolAta = getAssociatedTokenAddressSync(SOL_MINT, args.user, false);
  const treasuryEtfAta = getAssociatedTokenAddressSync(etf.etfMint, etf.treasury, true);

  const wsolInfo = await args.conn.getAccountInfo(userWsolAta, 'confirmed');
  let preExistingWsolBalance = 0n;
  if (wsolInfo) {
    try {
      const bal = await args.conn.getTokenAccountBalance(userWsolAta, 'confirmed');
      preExistingWsolBalance = BigInt(bal.value.amount);
    } catch {
      preExistingWsolBalance = 0n;
    }
  }
  const closeWsolAtEnd = preExistingWsolBalance === 0n;

  const legs: WithdrawSolLegPreview[] = [];
  let totalExpectedSol = 0n;
  let totalMinSol = 0n;
  for (let i = 0; i < perLeg.length; i++) {
    const expected = perLeg[i];
    const quotedAmount = (expected * BigInt(10_000 - safetyShrinkBps)) / 10_000n;
    if (quotedAmount === 0n) {
      throw new Error(
        `leg ${i} (${mints[i].toBase58().slice(0, 8)}…) quote amount is zero ` +
          'after safety shrink — burnAmount too small for this basket'
      );
    }
    let quote: JupiterQuoteResponse;
    if (mints[i].equals(SOL_MINT)) {
      // SOL leg: vault holds wSOL, no Jupiter swap needed. The basket-to-user
      // transfer in axis_vault::Withdraw lands wSOL directly in the user's
      // wSOL ATA, which is the swap destination. Synthesize a 1:1 passthrough.
      const out = quotedAmount.toString();
      quote = {
        inputMint: mints[i].toBase58(),
        outputMint: SOL_MINT.toBase58(),
        inAmount: out,
        outAmount: out,
        otherAmountThreshold: out,
        swapMode: 'ExactIn',
        slippageBps,
        priceImpactPct: '0',
        routePlan: [{ swapInfo: { label: 'wrap' }, percent: 100 }],
        contextSlot: 0,
      };
    } else {
      try {
        quote = await getQuote({
          inputMint: mints[i],
          outputMint: SOL_MINT,
          amount: quotedAmount,
          slippageBps,
          swapMode: 'ExactIn',
          maxAccounts,
        });
      } catch (e) {
        throw new Error(
          `Jupiter quote failed on leg ${i} (${mints[i].toBase58().slice(0, 8)}…): ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
    const expectedSolOut = BigInt(quote.outAmount);
    const minSolOut = BigInt(quote.otherAmountThreshold);
    legs.push({
      mint: mints[i],
      vault: vaults[i],
      expectedBasketOut: expected,
      quotedBasketIn: quotedAmount,
      quote,
      expectedSolOut,
      minSolOut,
      routeLabel: extractRouteLabel(quote),
    });
    totalExpectedSol += expectedSolOut;
    totalMinSol += minSolOut;
  }

  // SOL legs need no swap (Withdraw already returns wSOL into user's wSOL ATA).
  const swapBundles = await Promise.all(
    legs.map((leg, i) => {
      if (leg.mint.equals(SOL_MINT)) return Promise.resolve(null);
      return getSwapInstructions({
        quote: leg.quote,
        userPublicKey: args.user,
        destinationTokenAccount: userWsolAta,
        wrapAndUnwrapSol: false,
      }).catch((e) => {
        throw new Error(
          `Jupiter swap-instructions failed on leg ${i} (${mints[i].toBase58().slice(0, 8)}…): ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      });
    })
  );

  let cuSum = 0;
  let microLamportsMax = 0;
  for (const bundle of swapBundles) {
    if (!bundle) continue;
    for (const raw of bundle.computeBudgetInstructions) {
      const ix = deserializeIx(raw);
      if (ix.data[0] === 0x02 && ix.data.length >= 5) {
        cuSum += ix.data.readUInt32LE(1);
      } else if (ix.data[0] === 0x03 && ix.data.length >= 9) {
        const lo = ix.data.readUInt32LE(1);
        const hi = ix.data.readUInt32LE(5);
        const fee = lo + hi * 0x1_0000_0000;
        if (fee > microLamportsMax) microLamportsMax = fee;
      }
    }
  }
  const cuLimit = Math.min(SOLANA_MAX_TX_CU, Math.max(400_000, cuSum + 150_000));
  const cuPrice =
    args.priorityMicroLamports !== undefined
      ? args.priorityMicroLamports
      : Math.max(microLamportsMax, FALLBACK_PRIORITY_MICRO_LAMPORTS);

  const ataIxs = [
    createAssociatedTokenAccountIdempotentInstruction(args.user, userWsolAta, args.user, SOL_MINT),
    ...mints.map((mint, i) =>
      createAssociatedTokenAccountIdempotentInstruction(
        args.user,
        userBasketAtas[i],
        args.user,
        mint
      )
    ),
    createAssociatedTokenAccountIdempotentInstruction(args.user, userEtfAta, args.user, etf.etfMint),
    createAssociatedTokenAccountIdempotentInstruction(
      args.user,
      treasuryEtfAta,
      etf.treasury,
      etf.etfMint
    ),
  ];

  const withdrawIx = ixWithdraw({
    programId: args.programId,
    payer: args.user,
    etfState: args.etfState,
    etfMint: etf.etfMint,
    userEtfAta,
    treasuryEtfAta,
    vaults,
    userBasketAccounts: userBasketAtas,
    burnAmount: args.burnAmount,
    minTokensOut: totalExpectedBasketOut,
    name: etf.name,
  });

  const swapIxs: TransactionInstruction[] = [];
  const seen = new Set<string>();
  const pushDedup = (target: TransactionInstruction[], ix: TransactionInstruction) => {
    const key = [
      ix.programId.toBase58(),
      ix.keys
        .map((k) => `${k.pubkey.toBase58()}:${k.isSigner ? 1 : 0}:${k.isWritable ? 1 : 0}`)
        .join('|'),
      ix.data.toString('base64'),
    ].join('#');
    if (!seen.has(key)) {
      seen.add(key);
      target.push(ix);
    }
  };
  for (const bundle of swapBundles) {
    if (!bundle) continue;
    for (const raw of bundle.setupInstructions) pushDedup(swapIxs, deserializeIx(raw));
    pushDedup(swapIxs, deserializeIx(bundle.swapInstruction));
    if (bundle.cleanupInstruction) pushDedup(swapIxs, deserializeIx(bundle.cleanupInstruction));
  }

  const closeWsolIxs = closeWsolAtEnd
    ? [createCloseAccountInstruction(userWsolAta, args.user, args.user, [], TOKEN_PROGRAM_ID)]
    : [];

  const altAccounts = await fetchAltAccounts(
    args.conn,
    swapBundles.flatMap((b) => (b ? b.addressLookupTableAddresses : []))
  );
  const { blockhash } = await args.conn.getLatestBlockhash('confirmed');

  const cbIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
  ];

  const singleIxs = [...cbIxs, ...ataIxs, withdrawIx, ...swapIxs, ...closeWsolIxs];
  const singleAttempt = tryCompileV0(args.user, blockhash, singleIxs, altAccounts);
  if (singleAttempt.ok) {
    return {
      mode: 'single',
      versionedTx: new VersionedTransaction(singleAttempt.message),
      altAccounts,
      legs,
      feeAmount,
      effectiveBurn,
      totalExpectedBasketOut,
      expectedSolOut: totalExpectedSol,
      minSolOut: totalMinSol,
      ixCount: singleIxs.length,
      txBytes: singleAttempt.bytes,
      computeUnitLimit: cuLimit,
      computeUnitPrice: cuPrice,
    };
  }

  // Withdraw tx must include every basket ATA create (wSOL included): when a
  // basket leg is wSOL, axis_vault::Withdraw transfers from the vault into the
  // user's wSOL ATA, which has to exist before the withdraw ix runs. The swap
  // tx (which fires after the withdraw lands) only needs Jupiter setup, no ATA
  // creates — the ATAs are already there from the withdraw half.
  const withdrawTxIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
    ...ataIxs,
    withdrawIx,
  ];
  const swapTxIxs = [...cbIxs, ...swapIxs, ...closeWsolIxs];

  const withdrawAttempt = tryCompileV0(args.user, blockhash, withdrawTxIxs, []);
  if (!withdrawAttempt.ok) {
    throw new Error(
      `Even after splitting, the Withdraw half failed to compile: ${withdrawAttempt.error}`
    );
  }
  const swapAttempt = tryCompileV0(args.user, blockhash, swapTxIxs, altAccounts);
  if (!swapAttempt.ok) {
    throw new Error(
      `Even after splitting, the Jupiter swap half blew the 1232-byte wire cap ` +
        `(estimated ${swapAttempt.bytes ?? '?'} bytes; ix count ${swapTxIxs.length}; ` +
        `static keys ${swapAttempt.staticKeys ?? '?'}; ALT addresses ${altAccounts.length}). ` +
        `Try a smaller basket (2 mints), lower per-leg \`maxAccounts\` (currently ${maxAccounts}), ` +
        `or pick mints with simpler Jupiter routes. Underlying error: ${swapAttempt.error}`
    );
  }

  return {
    mode: 'split',
    versionedTx: new VersionedTransaction(withdrawAttempt.message),
    swapTx: new VersionedTransaction(swapAttempt.message),
    altAccounts,
    legs,
    feeAmount,
    effectiveBurn,
    totalExpectedBasketOut,
    expectedSolOut: totalExpectedSol,
    minSolOut: totalMinSol,
    ixCount: withdrawTxIxs.length + swapTxIxs.length,
    txBytes: withdrawAttempt.bytes,
    computeUnitLimit: cuLimit,
    computeUnitPrice: cuPrice,
  };
}

/// Multi-tx (per-leg) withdraw plan. Used as a fallback when bundling all
/// Jupiter sell-legs into one tx blows the 1232-byte cap or hits
/// NO_ROUTES_FOUND at low maxAccounts. Mirrors the deposit's per-leg mode
/// in reverse: each leg's basket→SOL swap runs in its own tx.
///
/// Tx layout for a basket with k non-SOL legs:
///   tx 0      withdraw  compute_budget + ATA creates + axis Withdraw (burn ETF + send basket out)
///   tx 1..k   legSwap   compute_budget + Jupiter swap (basket → wSOL, per non-SOL leg)
///   tx k+1    cleanup   close-wSOL (only when user had no pre-existing wSOL)
export async function buildWithdrawSolMultiTxPlan(
  args: WithdrawSolPlanArgs
): Promise<WithdrawSolPlan> {
  if (args.burnAmount <= 0n) throw new Error('burnAmount must be > 0');

  const etf = args.etfStateData ?? (await fetchEtfState(args.conn, args.etfState));
  if (etf.paused) throw new Error('ETF is paused — Withdraw is disabled');
  if (etf.totalSupply === 0n) {
    throw new Error('ETF has no supply — nothing to withdraw');
  }
  if (args.burnAmount > etf.totalSupply) {
    throw new Error(`burnAmount ${args.burnAmount} > totalSupply ${etf.totalSupply}`);
  }

  const safetyShrinkBps = args.safetyShrinkBps ?? 100;
  const slippageBps = args.slippageBps ?? 50;
  const baseMaxAccounts = args.maxAccounts ?? 16;

  const vaults = etf.tokenVaults;
  const mints = etf.tokenMints;

  const vaultBalances = await fetchVaultBalances(args.conn, vaults);
  const { feeAmount, effectiveBurn, perLeg } = expectedWithdrawOutputs(
    vaultBalances,
    args.burnAmount,
    etf.totalSupply,
    etf.feeBps
  );
  const totalExpectedBasketOut = perLeg.reduce((s, v) => s + v, 0n);
  if (totalExpectedBasketOut === 0n) {
    throw new Error('expected basket output is zero — burnAmount too small');
  }

  const userBasketAtas = mints.map((m) => getAssociatedTokenAddressSync(m, args.user, false));
  const userEtfAta = getAssociatedTokenAddressSync(etf.etfMint, args.user, false);
  const userWsolAta = getAssociatedTokenAddressSync(SOL_MINT, args.user, false);
  const treasuryEtfAta = getAssociatedTokenAddressSync(etf.etfMint, etf.treasury, true);

  const wsolInfo = await args.conn.getAccountInfo(userWsolAta, 'confirmed');
  let preExistingWsolBalance = 0n;
  if (wsolInfo) {
    try {
      const bal = await args.conn.getTokenAccountBalance(userWsolAta, 'confirmed');
      preExistingWsolBalance = BigInt(bal.value.amount);
    } catch {
      preExistingWsolBalance = 0n;
    }
  }
  const closeWsolAtEnd = preExistingWsolBalance === 0n;
  const quoteClient: JupiterQuoteClient = liveJupiterQuoteClient;

  // Build legs with quotes (similar to single-tx mode), but each leg will
  // get its OWN tx so we don't have to share the 1232-byte budget.
  const legs: WithdrawSolLegPreview[] = [];
  for (let i = 0; i < perLeg.length; i++) {
    const expected = perLeg[i];
    const quotedAmount = (expected * BigInt(10_000 - safetyShrinkBps)) / 10_000n;
    if (quotedAmount === 0n) {
      throw new Error(
        `leg ${i} (${mints[i].toBase58().slice(0, 8)}…) quote amount is zero ` +
          'after safety shrink — burnAmount too small for this basket'
      );
    }
    let quote: JupiterQuoteResponse;
    if (mints[i].equals(SOL_MINT)) {
      const out = quotedAmount.toString();
      quote = {
        inputMint: mints[i].toBase58(),
        outputMint: SOL_MINT.toBase58(),
        inAmount: out,
        outAmount: out,
        otherAmountThreshold: out,
        swapMode: 'ExactIn',
        slippageBps,
        priceImpactPct: '0',
        routePlan: [{ swapInfo: { label: 'wrap' }, percent: 100 }],
        contextSlot: 0,
      };
    } else {
      try {
        quote = await getQuote({
          inputMint: mints[i],
          outputMint: SOL_MINT,
          amount: quotedAmount,
          slippageBps,
          swapMode: 'ExactIn',
          maxAccounts: baseMaxAccounts,
        });
      } catch (e) {
        throw new Error(
          `Jupiter quote failed on leg ${i} (${mints[i].toBase58().slice(0, 8)}…): ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
    legs.push({
      mint: mints[i],
      vault: vaults[i],
      expectedBasketOut: expected,
      quotedBasketIn: quotedAmount,
      quote,
      expectedSolOut: BigInt(quote.outAmount),
      minSolOut: BigInt(quote.otherAmountThreshold),
      routeLabel: extractRouteLabel(quote),
    });
  }

  const { blockhash } = await args.conn.getLatestBlockhash('confirmed');

  // ── Withdraw tx: ATA creates + axis Withdraw. Doesn't need ALTs. ───────
  const ataIxs = [
    createAssociatedTokenAccountIdempotentInstruction(args.user, userWsolAta, args.user, SOL_MINT),
    ...mints.map((mint, i) =>
      createAssociatedTokenAccountIdempotentInstruction(
        args.user,
        userBasketAtas[i],
        args.user,
        mint
      )
    ),
    createAssociatedTokenAccountIdempotentInstruction(args.user, userEtfAta, args.user, etf.etfMint),
    createAssociatedTokenAccountIdempotentInstruction(
      args.user,
      treasuryEtfAta,
      etf.treasury,
      etf.etfMint
    ),
  ];
  const withdrawIx = ixWithdraw({
    programId: args.programId,
    payer: args.user,
    etfState: args.etfState,
    etfMint: etf.etfMint,
    userEtfAta,
    treasuryEtfAta,
    vaults,
    userBasketAccounts: userBasketAtas,
    burnAmount: args.burnAmount,
    minTokensOut: totalExpectedBasketOut,
    name: etf.name,
  });
  const withdrawCuLimit = 250_000;
  const withdrawCuPrice = args.priorityMicroLamports ?? FALLBACK_PRIORITY_MICRO_LAMPORTS;
  const withdrawTxIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: withdrawCuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: withdrawCuPrice }),
    ...ataIxs,
    withdrawIx,
  ];
  const withdrawAttempt = tryCompileV0(args.user, blockhash, withdrawTxIxs, []);
  if (!withdrawAttempt.ok) {
    throw new Error(`Multi-tx withdraw tx failed to compile: ${withdrawAttempt.error}`);
  }

  // ── Per-leg swap txs: Jupiter basket→SOL, each in own tx. ──────────────
  const legTxs: VersionedTransaction[] = [];
  const legMaxAccounts: number[] = [];
  const legAltsAggregate: AddressLookupTableAccount[] = [];
  let maxLegBytes = 0;
  let combinedCuLimit = withdrawCuLimit;
  let combinedCuPrice = withdrawCuPrice;
  for (let i = 0; i < legs.length; i++) {
    if (legs[i].mint.equals(SOL_MINT)) continue; // SOL leg already in wSOL ATA
    const result = await compileWithdrawLegSwapTx({
      conn: args.conn,
      blockhash,
      user: args.user,
      mint: legs[i].mint,
      quotedAmount: legs[i].quotedBasketIn,
      slippageBps,
      destinationTokenAccount: userWsolAta,
      ladder: PER_LEG_MAX_ACCOUNTS_LADDER,
      priorityMicroLamports: args.priorityMicroLamports,
      quoteClient,
    });
    legTxs.push(result.tx);
    legMaxAccounts.push(result.maxAccounts);
    legAltsAggregate.push(...result.altAccounts);
    if (result.txBytes > maxLegBytes) maxLegBytes = result.txBytes;
    if (result.cuLimit > combinedCuLimit) combinedCuLimit = result.cuLimit;
    if (result.cuPrice > combinedCuPrice) combinedCuPrice = result.cuPrice;
    legs[i].quote = result.quote;
    legs[i].expectedSolOut = BigInt(result.quote.outAmount);
    legs[i].minSolOut = BigInt(result.quote.otherAmountThreshold);
    legs[i].routeLabel = extractRouteLabel(result.quote);
  }

  // ── Optional cleanup tx: close wSOL ATA → native SOL refund. ───────────
  let cleanupTx: VersionedTransaction | undefined;
  let cleanupBytes = 0;
  if (closeWsolAtEnd) {
    const cleanupIxs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: combinedCuPrice }),
      createCloseAccountInstruction(userWsolAta, args.user, args.user, [], TOKEN_PROGRAM_ID),
    ];
    const cleanupAttempt = tryCompileV0(args.user, blockhash, cleanupIxs, []);
    if (!cleanupAttempt.ok) {
      throw new Error(`Multi-tx withdraw cleanup tx failed to compile: ${cleanupAttempt.error}`);
    }
    cleanupTx = new VersionedTransaction(cleanupAttempt.message);
    cleanupBytes = cleanupAttempt.bytes;
  }

  const altsDedup = dedupeAltsByKey(legAltsAggregate);

  return {
    mode: 'multi',
    versionedTx: new VersionedTransaction(withdrawAttempt.message),
    legTxs,
    legMaxAccounts,
    cleanupTx,
    altAccounts: altsDedup,
    legs,
    feeAmount,
    effectiveBurn,
    totalExpectedBasketOut,
    expectedSolOut: legs.reduce((s, l) => s + l.expectedSolOut, 0n),
    minSolOut: legs.reduce((s, l) => s + l.minSolOut, 0n),
    ixCount: withdrawTxIxs.length + legTxs.length + (cleanupTx ? 3 : 0),
    txBytes: Math.max(withdrawAttempt.bytes, maxLegBytes, cleanupBytes),
    computeUnitLimit: combinedCuLimit,
    computeUnitPrice: combinedCuPrice,
  };
}

function dedupeAltsByKey(alts: AddressLookupTableAccount[]): AddressLookupTableAccount[] {
  const seen = new Set<string>();
  const out: AddressLookupTableAccount[] = [];
  for (const a of alts) {
    const key = a.key.toBase58();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

interface WithdrawLegCompileArgs {
  conn: import('@solana/web3.js').Connection;
  blockhash: string;
  user: PublicKey;
  mint: PublicKey;
  quotedAmount: bigint;
  slippageBps: number;
  destinationTokenAccount: PublicKey;
  ladder: readonly number[];
  priorityMicroLamports?: number;
  quoteClient: JupiterQuoteClient;
}

interface WithdrawLegCompileResult {
  tx: VersionedTransaction;
  altAccounts: AddressLookupTableAccount[];
  txBytes: number;
  maxAccounts: number;
  cuLimit: number;
  cuPrice: number;
  quote: JupiterQuoteResponse;
}

async function compileWithdrawLegSwapTx(
  args: WithdrawLegCompileArgs
): Promise<WithdrawLegCompileResult> {
  const errors: string[] = [];
  for (let i = 0; i < args.ladder.length; i++) {
    const maxAccounts = args.ladder[i];
    let quote: JupiterQuoteResponse;
    try {
      quote = await args.quoteClient.getQuote({
        inputMint: args.mint,
        outputMint: SOL_MINT,
        amount: args.quotedAmount,
        slippageBps: args.slippageBps,
        swapMode: 'ExactIn',
        maxAccounts,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`maxAccounts=${maxAccounts}: quote ${msg}`);
      if (i < args.ladder.length - 1) continue;
      throw new Error(
        `Jupiter quote failed for withdraw leg ${args.mint.toBase58().slice(0, 8)}… across ladder ` +
          `[${args.ladder.join(', ')}]. ${errors.slice(-3).join(' | ')}`
      );
    }
    let bundle: import('./jupiter').JupiterSwapInstructionsResponse;
    try {
      bundle = await getSwapInstructions({
        quote,
        userPublicKey: args.user,
        destinationTokenAccount: args.destinationTokenAccount,
        wrapAndUnwrapSol: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`maxAccounts=${maxAccounts}: swap-ix ${msg}`);
      if (i < args.ladder.length - 1) continue;
      throw new Error(
        `Jupiter swap-instructions failed for withdraw leg ${args.mint.toBase58().slice(0, 8)}… ` +
          `across ladder [${args.ladder.join(', ')}]. ${errors.slice(-3).join(' | ')}`
      );
    }

    let cuSum = 0;
    let microLamportsMax = 0;
    for (const raw of bundle.computeBudgetInstructions) {
      const ix = deserializeIx(raw);
      if (ix.data[0] === 0x02 && ix.data.length >= 5) {
        cuSum += ix.data.readUInt32LE(1);
      } else if (ix.data[0] === 0x03 && ix.data.length >= 9) {
        const lo = ix.data.readUInt32LE(1);
        const hi = ix.data.readUInt32LE(5);
        const fee = lo + hi * 0x1_0000_0000;
        if (fee > microLamportsMax) microLamportsMax = fee;
      }
    }
    const cuLimit = Math.min(SOLANA_MAX_TX_CU, Math.max(300_000, cuSum + 60_000));
    const cuPrice =
      args.priorityMicroLamports !== undefined
        ? args.priorityMicroLamports
        : Math.max(microLamportsMax, FALLBACK_PRIORITY_MICRO_LAMPORTS);

    const ixs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
    ];
    const seen = new Set<string>();
    const pushDedup = (ix: TransactionInstruction) => {
      const key = [
        ix.programId.toBase58(),
        ix.keys
          .map((k) => `${k.pubkey.toBase58()}:${k.isSigner ? 1 : 0}:${k.isWritable ? 1 : 0}`)
          .join('|'),
        ix.data.toString('base64'),
      ].join('#');
      if (seen.has(key)) return;
      seen.add(key);
      ixs.push(ix);
    };
    for (const raw of bundle.setupInstructions) pushDedup(deserializeIx(raw));
    pushDedup(deserializeIx(bundle.swapInstruction));
    if (bundle.cleanupInstruction) pushDedup(deserializeIx(bundle.cleanupInstruction));

    const altAccounts = await fetchAltAccounts(args.conn, bundle.addressLookupTableAddresses);
    const attempt = tryCompileV0(args.user, args.blockhash, ixs, altAccounts);
    if (attempt.ok) {
      return {
        tx: new VersionedTransaction(attempt.message),
        altAccounts,
        txBytes: attempt.bytes,
        maxAccounts,
        cuLimit,
        cuPrice,
        quote,
      };
    }
    errors.push(`maxAccounts=${maxAccounts}: compile ${attempt.error}`);
  }
  throw new Error(
    `Per-leg withdraw swap (${args.mint.toBase58().slice(0, 8)}…) failed across ladder ` +
      `[${args.ladder.join(', ')}]. Last attempts: ${errors.slice(-3).join(' | ')}.`
  );
}
