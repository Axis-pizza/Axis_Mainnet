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
import { SOLANA_MAX_TX_CU, tryCompileV0 } from './depositSolPlan';

/// Plans a v0 transaction that sells `inputs[i].amount` of `inputs[i].mint`
/// (basket tokens held in the user's ATAs) and lands the consolidated SOL
/// in the user's wallet. Symmetric inverse of buildJupiterSolSeedPlan.
///
/// Flow inside the produced tx:
///   1. compute-budget (limit + price)
///   2. idempotent ATA creates (user wSOL — basket ATAs assumed to exist)
///   3. for each leg: Jupiter setupIxs + swap + cleanupIx, output → wSOL ATA
///   4. close wSOL ATA → native SOL refund (only when user had no pre-existing wSOL)
///
/// Direct-wSOL legs (selling wSOL itself) are handled as a no-op and
/// folded into the close step.

const FALLBACK_PRIORITY_MICRO_LAMPORTS = 50_000;

export interface SellBasketLegInput {
  mint: PublicKey;
  amount: bigint;
}

export interface JupiterBasketSellArgs {
  conn: Connection;
  user: PublicKey;
  inputs: SellBasketLegInput[];
  slippageBps?: number;
  maxAccounts?: number;
  closeWsolAtEnd?: boolean;
  priorityMicroLamports?: number;
}

export interface JupiterBasketSellLeg {
  mint: PublicKey;
  amountIn: bigint;
  isDirectWsol: boolean;
  quote?: JupiterQuoteResponse;
  expectedSolOut: bigint;
  minSolOut: bigint;
  routeLabel: string;
  userBasketAta: PublicKey;
}

export interface JupiterBasketSellPlan {
  versionedTx: VersionedTransaction;
  altAccounts: AddressLookupTableAccount[];
  legs: JupiterBasketSellLeg[];
  totalExpectedSolOut: bigint;
  totalMinSolOut: bigint;
  ixCount: number;
  txBytes: number;
  computeUnitLimit: number;
  computeUnitPrice: number;
}

function extractRouteLabel(quote: JupiterQuoteResponse): string {
  const first = quote.routePlan[0] as { swapInfo?: { label?: string } } | undefined;
  return first?.swapInfo?.label ?? 'Jupiter';
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

function ixDedupKey(ix: TransactionInstruction): string {
  return [
    ix.programId.toBase58(),
    ix.keys
      .map((k) => `${k.pubkey.toBase58()}:${k.isSigner ? 1 : 0}:${k.isWritable ? 1 : 0}`)
      .join('|'),
    ix.data.toString('base64'),
  ].join('#');
}

export async function buildJupiterBasketSellPlan(
  args: JupiterBasketSellArgs
): Promise<JupiterBasketSellPlan> {
  const n = args.inputs.length;
  if (n < 1 || n > 5) {
    throw new Error(`inputs length must be 1..5, got ${n}`);
  }
  for (const input of args.inputs) {
    if (input.amount <= 0n) {
      throw new Error(
        `amount for ${input.mint.toBase58().slice(0, 8)}… must be greater than zero`
      );
    }
  }

  const slippageBps = args.slippageBps ?? 50;
  const maxAccounts = args.maxAccounts ?? 16;
  const closeWsolAtEnd = args.closeWsolAtEnd ?? true;

  const userWsolAta = getAssociatedTokenAddressSync(SOL_MINT, args.user, false);
  const userBasketAtas = args.inputs.map((input) =>
    getAssociatedTokenAddressSync(input.mint, args.user, false)
  );

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
  const finalCloseWsol = closeWsolAtEnd && preExistingWsolBalance === 0n;

  const balanceChecks = await Promise.all(
    args.inputs.map(async (input, i) => {
      if (input.mint.equals(SOL_MINT)) {
        return preExistingWsolBalance + 0n;
      }
      try {
        const bal = await args.conn.getTokenAccountBalance(userBasketAtas[i], 'confirmed');
        return BigInt(bal.value.amount);
      } catch {
        return 0n;
      }
    })
  );
  for (let i = 0; i < n; i++) {
    if (balanceChecks[i] < args.inputs[i].amount) {
      throw new Error(
        `Insufficient balance for ${args.inputs[i].mint.toBase58().slice(0, 8)}…: ` +
          `need ${args.inputs[i].amount.toString()}, have ${balanceChecks[i].toString()}`
      );
    }
  }

  const legs: JupiterBasketSellLeg[] = [];
  const jupiterLegIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const input = args.inputs[i];
    const userBasketAta = userBasketAtas[i];
    if (input.mint.equals(SOL_MINT)) {
      legs.push({
        mint: input.mint,
        amountIn: input.amount,
        isDirectWsol: true,
        expectedSolOut: input.amount,
        minSolOut: input.amount,
        routeLabel: 'unwrap',
        userBasketAta,
      });
      continue;
    }
    let quote: JupiterQuoteResponse;
    try {
      quote = await getQuote({
        inputMint: input.mint,
        outputMint: SOL_MINT,
        amount: input.amount,
        slippageBps,
        swapMode: 'ExactIn',
        maxAccounts,
      });
    } catch (e) {
      throw new Error(
        `Jupiter quote failed for leg ${i} (${input.mint.toBase58().slice(0, 8)}…): ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
    legs.push({
      mint: input.mint,
      amountIn: input.amount,
      isDirectWsol: false,
      quote,
      expectedSolOut: BigInt(quote.outAmount),
      minSolOut: BigInt(quote.otherAmountThreshold),
      routeLabel: extractRouteLabel(quote),
      userBasketAta,
    });
    jupiterLegIndices.push(i);
  }

  const swapBundles = await Promise.all(
    jupiterLegIndices.map(async (i) => {
      const quote = legs[i].quote!;
      try {
        return await getSwapInstructions({
          quote,
          userPublicKey: args.user,
          destinationTokenAccount: userWsolAta,
          wrapAndUnwrapSol: false,
        });
      } catch (e) {
        throw new Error(
          `Jupiter swap-instructions failed for leg ${i} (${args.inputs[i].mint.toBase58().slice(0, 8)}…): ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    })
  );

  const legBudgets = swapBundles.map((b) =>
    b.computeBudgetInstructions.map((raw) => decodeComputeBudgetIx(deserializeIx(raw)))
  );
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
  const cuLimit = Math.min(SOLANA_MAX_TX_CU, Math.max(400_000, cuSum + 60_000));
  const cuPrice =
    args.priorityMicroLamports !== undefined
      ? args.priorityMicroLamports
      : Math.max(microLamportsMax, FALLBACK_PRIORITY_MICRO_LAMPORTS);

  const ataCreates: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(args.user, userWsolAta, args.user, SOL_MINT),
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
    for (const raw of bundle.setupInstructions) pushDedup(swapIxs, deserializeIx(raw));
    pushDedup(swapIxs, deserializeIx(bundle.swapInstruction));
    if (bundle.cleanupInstruction) {
      pushDedup(swapIxs, deserializeIx(bundle.cleanupInstruction));
    }
  }

  const closeWsolIxs = finalCloseWsol
    ? [createCloseAccountInstruction(userWsolAta, args.user, args.user, [], TOKEN_PROGRAM_ID)]
    : [];

  const altAccounts = await fetchAltAccounts(
    args.conn,
    swapBundles.flatMap((b) => b.addressLookupTableAddresses)
  );
  const { blockhash } = await args.conn.getLatestBlockhash('confirmed');

  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
    ...ataCreates,
    ...swapIxs,
    ...closeWsolIxs,
  ];
  const attempt = tryCompileV0(args.user, blockhash, ixs, altAccounts);
  if (!attempt.ok) {
    throw new Error(
      `Jupiter basket-sell tx blew the 1232-byte wire cap ` +
        `(estimated ${attempt.bytes ?? '?'} bytes; ix count ${ixs.length}; ` +
        `static keys ${attempt.staticKeys ?? '?'}; ALT addresses ${altAccounts.length}). ` +
        `Try a smaller leg count, lower per-leg \`maxAccounts\` (currently ${maxAccounts}), ` +
        `or pick mints with simpler Jupiter routes. Underlying error: ${attempt.error}`
    );
  }

  const totalExpectedSolOut = legs.reduce((sum, leg) => sum + leg.expectedSolOut, 0n);
  const totalMinSolOut = legs.reduce((sum, leg) => sum + leg.minSolOut, 0n);

  return {
    versionedTx: new VersionedTransaction(attempt.message),
    altAccounts,
    legs,
    totalExpectedSolOut,
    totalMinSolOut,
    ixCount: ixs.length,
    txBytes: attempt.bytes,
    computeUnitLimit: cuLimit,
    computeUnitPrice: cuPrice,
  };
}
