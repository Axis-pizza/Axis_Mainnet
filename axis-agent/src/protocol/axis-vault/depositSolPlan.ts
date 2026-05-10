import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Buffer } from 'buffer';
import {
  SOL_MINT,
  deserializeIx,
  fetchAltAccounts,
  getSwapInstructions,
  type JupiterQuoteResponse,
} from './jupiter';
import {
  buildJupiterSeedPreview,
  liveJupiterQuoteClient,
  type JupiterQuoteClient,
  type JupiterSeedPreview,
} from './jupiterSeed';
import { u64Le } from './ix';

export const SOLANA_MAX_TX_CU = 1_400_000;
export const SOLANA_MAX_TX_BYTES = 1232;
const FALLBACK_PRIORITY_MICRO_LAMPORTS = 50_000;
/// Mirrors `axis-vault::MIN_FIRST_DEPOSIT = 1_000_000` (= 1.0 ETF at 6 decimals).
export const MIN_FIRST_DEPOSIT_BASE = 1_000_000n;

export interface DepositSolPlanArgs {
  conn: Connection;
  user: PublicKey;
  programId: PublicKey;
  etfName: string;
  etfState: PublicKey;
  etfMint: PublicKey;
  treasury: PublicKey;
  treasuryEtfAta: PublicKey;
  basketMints: PublicKey[];
  weights: number[];
  vaults: PublicKey[];
  solIn: bigint;
  minEtfOut: bigint;
  slippageBps?: number;
  maxAccounts?: number;
  existingEtfTotalSupply?: bigint;
  priorityMicroLamports?: number;
  quoteClient?: JupiterQuoteClient;
}

export interface DepositSolPlan {
  mode: 'single' | 'split' | 'multi';
  /// `single`: full flow in one tx. `split`: tx 0 wraps + swaps, tx 1 deposits.
  /// `multi`: tx 0 wraps + creates ATAs, txs 1..k swap one leg each (one tx
  /// per non-SOL leg), tx k+1 deposits + closes wSOL.
  versionedTx: VersionedTransaction;
  /// `split`/`multi` only: the axis Deposit tx.
  depositTx?: VersionedTransaction;
  /// `multi` only: per-leg Jupiter swap txs (one per non-SOL basket mint).
  legTxs?: VersionedTransaction[];
  /// `multi` only: which `maxAccounts` value succeeded for each leg in
  /// `legTxs` order. Surface this in telemetry so we can spot routes that
  /// regularly need a step-down.
  legMaxAccounts?: number[];
  altAccounts: AddressLookupTableAccount[];
  quotes: JupiterQuoteResponse[];
  depositAmount: bigint;
  expectedBasketAmounts: bigint[];
  seedPreview: JupiterSeedPreview;
  ixCount: number;
  /// Bytes of the longest tx in the plan (for size telemetry).
  txBytes: number;
  computeUnitLimit: number;
  computeUnitPrice: number;
}

function buildAxisDepositIx(
  programId: PublicKey,
  user: PublicKey,
  etfState: PublicKey,
  etfMint: PublicKey,
  userEtfAta: PublicKey,
  treasuryEtfAta: PublicKey,
  userBasketAtas: PublicKey[],
  vaults: PublicKey[],
  etfName: string,
  amount: bigint,
  minMintOut: bigint
): TransactionInstruction {
  const nameBytes = Buffer.from(etfName);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: etfState, isSigner: false, isWritable: true },
      { pubkey: etfMint, isSigner: false, isWritable: true },
      { pubkey: userEtfAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: treasuryEtfAta, isSigner: false, isWritable: true },
      ...userBasketAtas.map((a) => ({ pubkey: a, isSigner: false, isWritable: true })),
      ...vaults.map((v) => ({ pubkey: v, isSigner: false, isWritable: true })),
    ],
    data: Buffer.concat([
      Buffer.from([1]),
      u64Le(amount),
      u64Le(minMintOut),
      Buffer.from([nameBytes.length]),
      nameBytes,
    ]),
  });
}

interface DecodedComputeBudget {
  cuLimit: number | null;
  microLamportsPerCu: number | null;
}

function decodeComputeBudgetIx(ix: TransactionInstruction): DecodedComputeBudget {
  const data = ix.data;
  if (data.length === 0) return { cuLimit: null, microLamportsPerCu: null };
  if (data[0] === 0x02 && data.length >= 5) {
    return { cuLimit: data.readUInt32LE(1), microLamportsPerCu: null };
  }
  if (data[0] === 0x03 && data.length >= 9) {
    const lo = data.readUInt32LE(1);
    const hi = data.readUInt32LE(5);
    return { cuLimit: null, microLamportsPerCu: lo + hi * 0x1_0000_0000 };
  }
  return { cuLimit: null, microLamportsPerCu: null };
}

function buildComputeBudgetIxs(
  legBudgets: DecodedComputeBudget[][],
  override?: number
): { ixs: TransactionInstruction[]; cuLimit: number; cuPrice: number } {
  let cuSum = 0;
  let microLamportsMax = 0;
  for (const leg of legBudgets) {
    for (const item of leg) {
      if (item.cuLimit !== null) cuSum += item.cuLimit;
      if (item.microLamportsPerCu !== null && item.microLamportsPerCu > microLamportsMax) {
        microLamportsMax = item.microLamportsPerCu;
      }
    }
  }
  const cuLimit = Math.min(SOLANA_MAX_TX_CU, Math.max(400_000, cuSum + 100_000));
  const cuPrice =
    override !== undefined
      ? override
      : Math.max(microLamportsMax, FALLBACK_PRIORITY_MICRO_LAMPORTS);
  return {
    ixs: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
    ],
    cuLimit,
    cuPrice,
  };
}

function ixDedupKey(ix: TransactionInstruction): string {
  return [
    ix.programId.toBase58(),
    ix.keys
      .map((k) => `${k.pubkey.toBase58()}:${k.isSigner ? 1 : 0}:${k.isWritable ? 1 : 0}`)
      .join('|'),
    ix.data.toString('base64'),
  ].join('#');
}

function dedupeIxs(ixs: TransactionInstruction[]): TransactionInstruction[] {
  const seen = new Set<string>();
  const out: TransactionInstruction[] = [];
  for (const ix of ixs) {
    const key = ixDedupKey(ix);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ix);
  }
  return out;
}

export async function buildDepositSolPlan(args: DepositSolPlanArgs): Promise<DepositSolPlan> {
  const n = args.basketMints.length;
  if (n !== args.weights.length || n !== args.vaults.length) {
    throw new Error('basketMints / weights / vaults length mismatch');
  }
  const weightSum = args.weights.reduce((a, b) => a + b, 0);
  if (weightSum !== 10_000) {
    throw new Error(`weights must sum to 10_000, got ${weightSum}`);
  }
  if (args.solIn <= 0n) {
    throw new Error('SOL input must be greater than zero');
  }
  if (n < 2 || n > 5) {
    throw new Error(`basket size must be 2..5; got ${n}`);
  }

  const RENT_WSOL_ATA = 2_039_280n;
  const RESERVE_FOR_FEES = 5_000_000n;
  const balanceLamports = BigInt(await args.conn.getBalance(args.user, 'confirmed'));
  if (balanceLamports < args.solIn + RENT_WSOL_ATA + RESERVE_FOR_FEES) {
    throw new Error(
      `Insufficient SOL: need ${(args.solIn + RENT_WSOL_ATA + RESERVE_FOR_FEES).toString()} lamports (deposit + wSOL rent + fee reserve), have ${balanceLamports.toString()}`
    );
  }

  const slippageBps = args.slippageBps ?? 50;
  const maxAccounts = args.maxAccounts ?? 16;
  const userBasketAtas = args.basketMints.map((m) =>
    getAssociatedTokenAddressSync(m, args.user, false)
  );
  const userEtfAta = getAssociatedTokenAddressSync(args.etfMint, args.user, false);
  const userWsolAta = getAssociatedTokenAddressSync(SOL_MINT, args.user, false);

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

  let seedPreview: JupiterSeedPreview;
  try {
    seedPreview = await buildJupiterSeedPreview({
      basketMints: args.basketMints,
      weights: args.weights,
      solIn: args.solIn,
      slippageBps,
      maxAccounts,
      quoteClient: args.quoteClient ?? liveJupiterQuoteClient,
    });
  } catch (e) {
    throw new Error(`Jupiter quote failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const quotes = seedPreview.legs.map((leg) => leg.quote);

  const isFirstDeposit = (args.existingEtfTotalSupply ?? 0n) === 0n;
  if (isFirstDeposit && seedPreview.depositAmount < MIN_FIRST_DEPOSIT_BASE) {
    const suggestedLamports =
      (args.solIn * MIN_FIRST_DEPOSIT_BASE * 11n) / (seedPreview.depositAmount * 10n);
    throw new Error(
      `First deposit must yield ≥ ${MIN_FIRST_DEPOSIT_BASE} base units (1.0 ETF). ` +
        `At ${args.solIn} lamports (${(Number(args.solIn) / 1e9).toFixed(6)} SOL) the bottleneck floor is ` +
        `${seedPreview.depositAmount} base. Increase SOL seed to at least ` +
        `~${suggestedLamports} lamports (≈ ${(Number(suggestedLamports) / 1e9).toFixed(4)} SOL) and retry. ` +
        `Bottleneck leg: ${seedPreview.legs[seedPreview.bottleneckIndex].mint.toBase58()}.`
    );
  }

  // SOL legs need no Jupiter swap — the wrap step (System.transfer + SyncNative
  // below) already lands wSOL in the user's wSOL ATA, which IS the user's
  // basket ATA for the SOL leg. Skip those legs from getSwapInstructions to
  // avoid Jupiter's CIRCULAR_ARBITRAGE_IS_DISABLED error on input==output.
  const swapBundles = await Promise.all(
    quotes.map((quote, i) => {
      if (args.basketMints[i].equals(SOL_MINT)) {
        return Promise.resolve(null);
      }
      return getSwapInstructions({
        quote,
        userPublicKey: args.user,
        destinationTokenAccount: userBasketAtas[i],
        wrapAndUnwrapSol: false,
      }).catch((e) => {
        throw new Error(
          `Jupiter swap-instructions failed for leg ${i} (${args.basketMints[i].toBase58().slice(0, 8)}…): ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      });
    })
  );

  const depositAmount = seedPreview.depositAmount;

  const legBudgets = swapBundles.map((b) =>
    b ? b.computeBudgetInstructions.map((raw) => decodeComputeBudgetIx(deserializeIx(raw))) : []
  );
  const cb = buildComputeBudgetIxs(legBudgets, args.priorityMicroLamports);

  // Split ATA creates by which half of the flow actually touches them. In
  // split mode this lets us drop `etfAta` + `treasuryEtfAta` (and the
  // `etfMint` / `treasury` static keys they pull in) out of the swap-half tx,
  // which is the leg most likely to brush the 1232-byte wire cap.
  const swapAtaCreatesRaw = [
    createAssociatedTokenAccountIdempotentInstruction(args.user, userWsolAta, args.user, SOL_MINT),
    ...args.basketMints.map((mint, i) =>
      createAssociatedTokenAccountIdempotentInstruction(
        args.user,
        userBasketAtas[i],
        args.user,
        mint
      )
    ),
  ];
  const depositAtaCreates = [
    createAssociatedTokenAccountIdempotentInstruction(args.user, userEtfAta, args.user, args.etfMint),
    createAssociatedTokenAccountIdempotentInstruction(
      args.user,
      args.treasuryEtfAta,
      args.treasury,
      args.etfMint
    ),
  ];
  const swapAtaCreates = dedupeIxs(swapAtaCreatesRaw);
  const ataCreates = [...swapAtaCreates, ...depositAtaCreates];

  const wrapIxs = [
    SystemProgram.transfer({
      fromPubkey: args.user,
      toPubkey: userWsolAta,
      lamports: Number(args.solIn),
    }),
    createSyncNativeInstruction(userWsolAta, TOKEN_PROGRAM_ID),
  ];

  const swapIxs: TransactionInstruction[] = [];
  const seen = new Set<string>();
  const pushDedup = (target: TransactionInstruction[], ix: TransactionInstruction) => {
    const key = ixDedupKey(ix);
    if (!seen.has(key)) {
      seen.add(key);
      target.push(ix);
    }
  };
  for (const bundle of swapBundles) {
    if (!bundle) continue; // SOL leg: nothing to swap
    for (const raw of bundle.setupInstructions) pushDedup(swapIxs, deserializeIx(raw));
    pushDedup(swapIxs, deserializeIx(bundle.swapInstruction));
    if (bundle.cleanupInstruction) {
      pushDedup(swapIxs, deserializeIx(bundle.cleanupInstruction));
    }
  }

  const closeWsolIxs = closeWsolAtEnd
    ? [createCloseAccountInstruction(userWsolAta, args.user, args.user, [], TOKEN_PROGRAM_ID)]
    : [];

  const depositIx = buildAxisDepositIx(
    args.programId,
    args.user,
    args.etfState,
    args.etfMint,
    userEtfAta,
    args.treasuryEtfAta,
    userBasketAtas,
    args.vaults,
    args.etfName,
    depositAmount,
    args.minEtfOut
  );

  const altAccounts = await fetchAltAccounts(
    args.conn,
    swapBundles.flatMap((b) => (b ? b.addressLookupTableAddresses : []))
  );
  const { blockhash } = await args.conn.getLatestBlockhash('confirmed');

  const singleIxs = [...cb.ixs, ...ataCreates, ...wrapIxs, ...swapIxs, depositIx, ...closeWsolIxs];
  const singleAttempt = tryCompileV0(args.user, blockhash, singleIxs, altAccounts);

  if (singleAttempt.ok) {
    return {
      mode: 'single',
      versionedTx: new VersionedTransaction(singleAttempt.message),
      altAccounts,
      quotes,
      depositAmount,
      expectedBasketAmounts: quotes.map((q) => BigInt(q.outAmount)),
      seedPreview,
      ixCount: singleIxs.length,
      txBytes: singleAttempt.bytes,
      computeUnitLimit: cb.cuLimit,
      computeUnitPrice: cb.cuPrice,
    };
  }

  const swapTxIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cb.cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cb.cuPrice }),
    ...swapAtaCreates,
    ...wrapIxs,
    ...swapIxs,
  ];
  const depositTxIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cb.cuPrice }),
    ...depositAtaCreates,
    depositIx,
    ...closeWsolIxs,
  ];

  const swapAttempt = tryCompileV0(args.user, blockhash, swapTxIxs, altAccounts);
  if (!swapAttempt.ok) {
    throw new Error(
      `Even after splitting and pushing the ETF ATA creates into the deposit half, ` +
        `the Jupiter swap leg blew the 1232-byte wire cap ` +
        `(estimated ${swapAttempt.bytes ?? '?'} bytes; ix count ${swapTxIxs.length}; ` +
        `static keys ${swapAttempt.staticKeys ?? '?'}; ALT addresses ${altAccounts.length}). ` +
        `Try a smaller basket (2 mints), lower the per-leg \`maxAccounts\` (currently ${maxAccounts}; ` +
        `try 10–12), or pick mints with simpler Jupiter routes. Underlying error: ${swapAttempt.error}`
    );
  }
  const depositAttempt = tryCompileV0(args.user, blockhash, depositTxIxs, []);
  if (!depositAttempt.ok) {
    throw new Error(
      `axis Deposit half of the split flow failed to compile: ${depositAttempt.error}`
    );
  }

  return {
    mode: 'split',
    versionedTx: new VersionedTransaction(swapAttempt.message),
    depositTx: new VersionedTransaction(depositAttempt.message),
    altAccounts,
    quotes,
    depositAmount,
    expectedBasketAmounts: quotes.map((q) => BigInt(q.outAmount)),
    seedPreview,
    ixCount: swapTxIxs.length + depositTxIxs.length,
    txBytes: swapAttempt.bytes,
    computeUnitLimit: cb.cuLimit,
    computeUnitPrice: cb.cuPrice,
  };
}

/// Per-leg ladder used in multi-tx fallback. Each leg is its own tx, so the
/// 1232-byte cap is comfortable at maxAccounts=16 for nearly every Jupiter
/// route. We still step down a few notches just in case a single leg has an
/// absurdly dense routing graph.
export const PER_LEG_MAX_ACCOUNTS_LADDER: readonly number[] = Object.freeze([
  16, 14, 12,
]);

/// Multi-tx (per-leg) deposit plan. Used as a fallback when bundling all
/// Jupiter swap legs into one tx blows the 1232-byte wire cap. Each leg
/// runs in its own tx, so even a 5-mint basket with dense routes lands.
///
/// Tx layout for an N-leg basket with k non-SOL legs:
///   tx 0     setup     compute_budget + ATA creates + wrap (System.transfer + syncNative)
///   tx 1..k legSwap   compute_budget + Jupiter swap (per non-SOL leg)
///   tx k+1   deposit   compute_budget + axis Deposit + (closeWsol if owed)
///
/// SOL-leg shares stay in the user's wSOL ATA after the wrap; the deposit ix
/// reads them from there directly.
export async function buildDepositSolMultiTxPlan(
  args: DepositSolPlanArgs
): Promise<DepositSolPlan> {
  const n = args.basketMints.length;
  if (n !== args.weights.length || n !== args.vaults.length) {
    throw new Error('basketMints / weights / vaults length mismatch');
  }
  const weightSum = args.weights.reduce((a, b) => a + b, 0);
  if (weightSum !== 10_000) {
    throw new Error(`weights must sum to 10_000, got ${weightSum}`);
  }
  if (args.solIn <= 0n) {
    throw new Error('SOL input must be greater than zero');
  }
  if (n < 2 || n > 5) {
    throw new Error(`basket size must be 2..5; got ${n}`);
  }

  const RENT_WSOL_ATA = 2_039_280n;
  const RESERVE_FOR_FEES = 5_000_000n;
  const balanceLamports = BigInt(await args.conn.getBalance(args.user, 'confirmed'));
  if (balanceLamports < args.solIn + RENT_WSOL_ATA + RESERVE_FOR_FEES) {
    throw new Error(
      `Insufficient SOL: need ${(args.solIn + RENT_WSOL_ATA + RESERVE_FOR_FEES).toString()} lamports (deposit + wSOL rent + fee reserve), have ${balanceLamports.toString()}`
    );
  }

  const slippageBps = args.slippageBps ?? 50;
  const baseMaxAccounts = args.maxAccounts ?? 16;
  const userBasketAtas = args.basketMints.map((m) =>
    getAssociatedTokenAddressSync(m, args.user, false)
  );
  const userEtfAta = getAssociatedTokenAddressSync(args.etfMint, args.user, false);
  const userWsolAta = getAssociatedTokenAddressSync(SOL_MINT, args.user, false);

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

  let seedPreview: JupiterSeedPreview;
  try {
    seedPreview = await buildJupiterSeedPreview({
      basketMints: args.basketMints,
      weights: args.weights,
      solIn: args.solIn,
      slippageBps,
      maxAccounts: baseMaxAccounts,
      quoteClient: args.quoteClient ?? liveJupiterQuoteClient,
    });
  } catch (e) {
    throw new Error(`Jupiter quote failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const quotes = seedPreview.legs.map((leg) => leg.quote);

  const isFirstDeposit = (args.existingEtfTotalSupply ?? 0n) === 0n;
  if (isFirstDeposit && seedPreview.depositAmount < MIN_FIRST_DEPOSIT_BASE) {
    const suggestedLamports =
      (args.solIn * MIN_FIRST_DEPOSIT_BASE * 11n) / (seedPreview.depositAmount * 10n);
    throw new Error(
      `First deposit must yield ≥ ${MIN_FIRST_DEPOSIT_BASE} base units (1.0 ETF). ` +
        `At ${args.solIn} lamports (${(Number(args.solIn) / 1e9).toFixed(6)} SOL) the bottleneck floor is ` +
        `${seedPreview.depositAmount} base. Increase SOL seed to at least ` +
        `~${suggestedLamports} lamports (≈ ${(Number(suggestedLamports) / 1e9).toFixed(4)} SOL) and retry. ` +
        `Bottleneck leg: ${seedPreview.legs[seedPreview.bottleneckIndex].mint.toBase58()}.`
    );
  }

  const { blockhash } = await args.conn.getLatestBlockhash('confirmed');

  // ── Setup tx: ATAs + wrap. No Jupiter, no ALTs, easily fits. ───────────
  const setupAtaCreates = [
    createAssociatedTokenAccountIdempotentInstruction(args.user, userWsolAta, args.user, SOL_MINT),
    ...args.basketMints.map((mint, i) =>
      createAssociatedTokenAccountIdempotentInstruction(
        args.user,
        userBasketAtas[i],
        args.user,
        mint
      )
    ),
  ];
  const wrapIxs = [
    SystemProgram.transfer({
      fromPubkey: args.user,
      toPubkey: userWsolAta,
      lamports: Number(args.solIn),
    }),
    createSyncNativeInstruction(userWsolAta, TOKEN_PROGRAM_ID),
  ];
  const setupCuLimit = 200_000;
  const setupCuPrice = args.priorityMicroLamports ?? FALLBACK_PRIORITY_MICRO_LAMPORTS;
  const setupIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: setupCuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: setupCuPrice }),
    ...dedupeIxs(setupAtaCreates),
    ...wrapIxs,
  ];
  const setupAttempt = tryCompileV0(args.user, blockhash, setupIxs, []);
  if (!setupAttempt.ok) {
    throw new Error(
      `Multi-tx setup tx failed to compile: ${setupAttempt.error} ` +
        `(this should not happen — setup is just ATAs + wrap)`
    );
  }

  // ── Per-leg swap txs: one Jupiter swap each. ───────────────────────────
  // Skip SOL legs (their share is already in wSOL ATA after the wrap above).
  const legTxs: VersionedTransaction[] = [];
  const legMaxAccounts: number[] = [];
  const legAltAccounts: AddressLookupTableAccount[] = [];
  let maxLegBytes = 0;
  let combinedCuLimit = 0;
  let combinedCuPrice = setupCuPrice;
  for (let i = 0; i < n; i++) {
    if (args.basketMints[i].equals(SOL_MINT)) continue;
    const legResult = await compilePerLegSwapTx({
      conn: args.conn,
      blockhash,
      user: args.user,
      inputMint: SOL_MINT,
      outputMint: args.basketMints[i],
      amount: seedPreview.legs[i].solLamports,
      slippageBps,
      destinationTokenAccount: userBasketAtas[i],
      ladder: PER_LEG_MAX_ACCOUNTS_LADDER,
      priorityMicroLamports: args.priorityMicroLamports,
      quoteClient: args.quoteClient ?? liveJupiterQuoteClient,
    });
    legTxs.push(legResult.tx);
    legMaxAccounts.push(legResult.maxAccounts);
    legAltAccounts.push(...legResult.altAccounts);
    if (legResult.txBytes > maxLegBytes) maxLegBytes = legResult.txBytes;
    if (legResult.cuLimit > combinedCuLimit) combinedCuLimit = legResult.cuLimit;
    if (legResult.cuPrice > combinedCuPrice) combinedCuPrice = legResult.cuPrice;
    // Refresh the parent quote with the leg's actual fulfillment quote —
    // the per-leg ladder may have stepped down to a worse-priced route, in
    // which case the seed preview's deposit floor is now optimistic.
    quotes[i] = legResult.quote;
  }

  // Recompute the deposit floor against the leg quotes that were actually
  // committed to a tx. If any leg stepped down its maxAccounts and got a
  // worse minOut, the new bottleneck candidate is lower — using the seed
  // preview's number unchanged would over-promise the deposit ix and trip
  // axis-vault's InsufficientBalance check at execute time.
  let depositAmountFinal = seedPreview.depositAmount;
  for (let i = 0; i < n; i++) {
    if (args.basketMints[i].equals(SOL_MINT)) continue; // SOL leg uses passthrough quote
    const minOut = BigInt(quotes[i].otherAmountThreshold);
    if (minOut === 0n) continue;
    const candidate = (minOut * 10_000n) / BigInt(args.weights[i]);
    if (candidate < depositAmountFinal) depositAmountFinal = candidate;
  }
  if (isFirstDeposit && depositAmountFinal < MIN_FIRST_DEPOSIT_BASE) {
    throw new Error(
      `First deposit floor dropped below ${MIN_FIRST_DEPOSIT_BASE} base after per-leg ` +
        `ladder step-down (now ${depositAmountFinal}). Increase SOL seed and retry.`
    );
  }

  // ── Deposit tx: axis Deposit + closeWsol. ──────────────────────────────
  const treasuryAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    args.user,
    args.treasuryEtfAta,
    args.treasury,
    args.etfMint
  );
  const userEtfAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    args.user,
    userEtfAta,
    args.user,
    args.etfMint
  );
  const depositIx = buildAxisDepositIx(
    args.programId,
    args.user,
    args.etfState,
    args.etfMint,
    userEtfAta,
    args.treasuryEtfAta,
    userBasketAtas,
    args.vaults,
    args.etfName,
    depositAmountFinal,
    args.minEtfOut
  );
  const closeWsolIxs = closeWsolAtEnd
    ? [createCloseAccountInstruction(userWsolAta, args.user, args.user, [], TOKEN_PROGRAM_ID)]
    : [];
  const depositCuLimit = 250_000;
  const depositCuPrice = combinedCuPrice;
  const depositIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: depositCuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: depositCuPrice }),
    userEtfAtaIx,
    treasuryAtaIx,
    depositIx,
    ...closeWsolIxs,
  ];
  const depositAttempt = tryCompileV0(args.user, blockhash, depositIxs, []);
  if (!depositAttempt.ok) {
    throw new Error(`Multi-tx deposit tx failed to compile: ${depositAttempt.error}`);
  }

  // Aggregate ALTs across all legs so callers can see the full set; tx-level
  // ALTs are already baked into each leg's compiled message.
  const altAccountsAll = dedupeAlts(legAltAccounts);

  return {
    mode: 'multi',
    versionedTx: new VersionedTransaction(setupAttempt.message),
    depositTx: new VersionedTransaction(depositAttempt.message),
    legTxs,
    legMaxAccounts,
    altAccounts: altAccountsAll,
    quotes,
    depositAmount: depositAmountFinal,
    expectedBasketAmounts: quotes.map((q) => BigInt(q.outAmount)),
    seedPreview,
    ixCount: setupIxs.length + legTxs.length + depositIxs.length,
    txBytes: Math.max(setupAttempt.bytes, maxLegBytes, depositAttempt.bytes),
    computeUnitLimit: Math.max(setupCuLimit, combinedCuLimit, depositCuLimit),
    computeUnitPrice: combinedCuPrice,
  };
}

function dedupeAlts(alts: AddressLookupTableAccount[]): AddressLookupTableAccount[] {
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

interface PerLegCompileArgs {
  conn: Connection;
  blockhash: string;
  user: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  slippageBps: number;
  destinationTokenAccount: PublicKey;
  ladder: readonly number[];
  priorityMicroLamports?: number;
  quoteClient: JupiterQuoteClient;
}

interface PerLegCompileResult {
  tx: VersionedTransaction;
  altAccounts: AddressLookupTableAccount[];
  txBytes: number;
  maxAccounts: number;
  cuLimit: number;
  cuPrice: number;
  quote: JupiterQuoteResponse;
}

/// Compiles a single Jupiter swap leg into its own v0 tx, retrying with a
/// shrinking maxAccounts ladder if the first compile blows the wire cap.
/// Each leg is its own tx, so size is rarely an issue at maxAccounts=16.
async function compilePerLegSwapTx(args: PerLegCompileArgs): Promise<PerLegCompileResult> {
  const errors: string[] = [];
  for (let i = 0; i < args.ladder.length; i++) {
    const maxAccounts = args.ladder[i];
    let quote: JupiterQuoteResponse;
    try {
      quote = await args.quoteClient.getQuote({
        inputMint: args.inputMint,
        outputMint: args.outputMint,
        amount: args.amount,
        slippageBps: args.slippageBps,
        swapMode: 'ExactIn',
        maxAccounts,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`maxAccounts=${maxAccounts}: quote ${msg}`);
      // Keep climbing the ladder — Jupiter sometimes 400s only at low caps.
      if (i < args.ladder.length - 1) continue;
      throw new Error(
        `Jupiter quote failed for leg ${args.outputMint.toBase58().slice(0, 8)}… across ladder ` +
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
        `Jupiter swap-instructions failed for leg ${args.outputMint.toBase58().slice(0, 8)}… ` +
          `across ladder [${args.ladder.join(', ')}]. ${errors.slice(-3).join(' | ')}`
      );
    }

    const cbDecoded = bundle.computeBudgetInstructions.map((raw) =>
      decodeComputeBudgetIx(deserializeIx(raw))
    );
    let cuSum = 0;
    let microLamportsMax = 0;
    for (const item of cbDecoded) {
      if (item.cuLimit !== null) cuSum += item.cuLimit;
      if (item.microLamportsPerCu !== null && item.microLamportsPerCu > microLamportsMax) {
        microLamportsMax = item.microLamportsPerCu;
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
      const key = ixDedupKey(ix);
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
    // Loop continues to next ladder value.
  }
  throw new Error(
    `Per-leg Jupiter swap (${args.outputMint.toBase58().slice(0, 8)}…) failed across ladder ` +
      `[${args.ladder.join(', ')}]. Last attempts: ${errors.slice(-3).join(' | ')}. ` +
      `Try a different basket mint with simpler routes, or report this token.`
  );
}

export type CompileAttempt =
  | {
      ok: true;
      message: ReturnType<TransactionMessage['compileToV0Message']>;
      bytes: number;
      staticKeys: number;
    }
  | { ok: false; bytes: number | null; staticKeys: number | null; error: string };

export function tryCompileV0(
  payerKey: PublicKey,
  recentBlockhash: string,
  instructions: TransactionInstruction[],
  altAccounts: AddressLookupTableAccount[]
): CompileAttempt {
  let message;
  try {
    message = new TransactionMessage({
      payerKey,
      recentBlockhash,
      instructions,
    }).compileToV0Message(altAccounts);
  } catch (e) {
    return {
      ok: false,
      bytes: null,
      staticKeys: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  let bytes: number;
  try {
    bytes = message.serialize().length + 1 + 64;
  } catch (e) {
    return {
      ok: false,
      bytes: null,
      staticKeys: message.staticAccountKeys.length,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (bytes > SOLANA_MAX_TX_BYTES) {
    return {
      ok: false,
      bytes,
      staticKeys: message.staticAccountKeys.length,
      error: `serialized ${bytes} bytes > ${SOLANA_MAX_TX_BYTES} cap`,
    };
  }
  return { ok: true, message, bytes, staticKeys: message.staticAccountKeys.length };
}
