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
  mode: 'single' | 'split';
  versionedTx: VersionedTransaction;
  depositTx?: VersionedTransaction;
  altAccounts: AddressLookupTableAccount[];
  quotes: JupiterQuoteResponse[];
  depositAmount: bigint;
  expectedBasketAmounts: bigint[];
  seedPreview: JupiterSeedPreview;
  ixCount: number;
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

  const ataCreates = [
    createAssociatedTokenAccountIdempotentInstruction(args.user, userWsolAta, args.user, SOL_MINT),
    ...args.basketMints.map((mint, i) =>
      createAssociatedTokenAccountIdempotentInstruction(
        args.user,
        userBasketAtas[i],
        args.user,
        mint
      )
    ),
    createAssociatedTokenAccountIdempotentInstruction(args.user, userEtfAta, args.user, args.etfMint),
    createAssociatedTokenAccountIdempotentInstruction(
      args.user,
      args.treasuryEtfAta,
      args.treasury,
      args.etfMint
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
    ...ataCreates,
    ...wrapIxs,
    ...swapIxs,
  ];
  const depositTxIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cb.cuPrice }),
    depositIx,
    ...closeWsolIxs,
  ];

  const swapAttempt = tryCompileV0(args.user, blockhash, swapTxIxs, altAccounts);
  if (!swapAttempt.ok) {
    throw new Error(
      `Even after splitting, the Jupiter swap leg blew the 1232-byte wire cap ` +
        `(estimated ${swapAttempt.bytes ?? '?'} bytes; ix count ${swapTxIxs.length}; ` +
        `static keys ${swapAttempt.staticKeys ?? '?'}; ALT addresses ${altAccounts.length}). ` +
        `Try a smaller basket (2 mints), lower the per-leg \`maxAccounts\` (currently ${maxAccounts}), ` +
        `or pick mints with simpler Jupiter routes. Underlying error: ${swapAttempt.error}`
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
