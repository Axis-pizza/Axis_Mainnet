import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { ixWithdrawFees3 } from './ix';
import { fetchPoolState3, type PoolState3Data } from './pfmmState';
import { tryCompileV0 } from './depositSolPlan';

/// Plans a v0 transaction that withdraws basket tokens from a PFMM pool's
/// vaults to the authority's treasury ATAs. Mirrors the on-chain
/// `process_withdraw_fees` invariant: amounts ≤ pool.reserves[i], authority
/// must equal pool.authority, vaults must equal pool.vaults[i].
///
/// Used by the Creator Console to recover seed liquidity. Output is the
/// authority's basket ATAs — caller can then run buildJupiterBasketSellPlan
/// over those balances to convert back to SOL in a second transaction.

export interface WithdrawFeesPlanArgs {
  conn: Connection;
  authority: PublicKey;
  /** PFMM pool PDA (the strategy.address for pfda-amm-3 strategies). */
  pool: PublicKey;
  /** Optional pre-fetched pool state. If absent, will fetch. */
  poolState?: PoolState3Data;
  /** Per-vault withdraw amounts. Pass [reserves[0], reserves[1], reserves[2]]
   *  to drain. Each entry must be ≤ pool.reserves[i]. */
  amounts: [bigint, bigint, bigint];
  priorityMicroLamports?: number;
}

export interface WithdrawFeesPlan {
  versionedTx: VersionedTransaction;
  authorityBasketAtas: [PublicKey, PublicKey, PublicKey];
  amounts: [bigint, bigint, bigint];
  ixCount: number;
  txBytes: number;
}

const FALLBACK_PRIORITY_MICRO_LAMPORTS = 50_000;

export async function buildPfmmWithdrawFeesPlan(
  args: WithdrawFeesPlanArgs
): Promise<WithdrawFeesPlan> {
  const pool = args.poolState ?? (await fetchPoolState3(args.conn, args.pool));
  if (!pool) {
    throw new Error(`pool ${args.pool.toBase58()} not initialized`);
  }
  if (pool.authority.toBase58() !== args.authority.toBase58()) {
    throw new Error(
      `authority mismatch: pool.authority=${pool.authority.toBase58().slice(0, 8)}…, ` +
        `signer=${args.authority.toBase58().slice(0, 8)}…`
    );
  }
  for (let i = 0; i < 3; i++) {
    if (args.amounts[i] > pool.reserves[i]) {
      throw new Error(
        `amount[${i}]=${args.amounts[i]} exceeds pool.reserves[${i}]=${pool.reserves[i]} ` +
          `(would hit FeeWithdrawExceedsReserves on-chain)`
      );
    }
  }

  const programId = pool.pool.equals(args.pool) ? undefined : undefined;
  // The pool's own program id isn't stored in PoolState3 — caller-side we
  // rely on PFDA_AMM3_PROGRAM_ID via getClusterConfig. Read it from the
  // pool account's owner instead so this helper stays config-free.
  const info = await args.conn.getAccountInfo(args.pool, 'confirmed');
  if (!info) throw new Error(`pool account ${args.pool.toBase58()} disappeared`);
  const pfmmProgramId = info.owner;
  void programId;

  const authorityAtas: [PublicKey, PublicKey, PublicKey] = [
    getAssociatedTokenAddressSync(pool.tokenMints[0], args.authority, false),
    getAssociatedTokenAddressSync(pool.tokenMints[1], args.authority, false),
    getAssociatedTokenAddressSync(pool.tokenMints[2], args.authority, false),
  ];

  const ataCreates: TransactionInstruction[] = pool.tokenMints.map((mint, i) =>
    createAssociatedTokenAccountIdempotentInstruction(
      args.authority,
      authorityAtas[i],
      args.authority,
      mint
    )
  );

  const withdrawIx = ixWithdrawFees3({
    programId: pfmmProgramId,
    authority: args.authority,
    pool: args.pool,
    vaults: pool.vaults,
    treasuryTokens: authorityAtas,
    amounts: args.amounts,
  });

  const cuPrice = args.priorityMicroLamports ?? FALLBACK_PRIORITY_MICRO_LAMPORTS;
  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
    ...ataCreates,
    withdrawIx,
  ];

  const { blockhash } = await args.conn.getLatestBlockhash('confirmed');
  const attempt = tryCompileV0(args.authority, blockhash, ixs, []);
  if (!attempt.ok) {
    throw new Error(
      `WithdrawFees tx failed to compile (estimated ${attempt.bytes ?? '?'} bytes; ` +
        `static keys ${attempt.staticKeys ?? '?'}). Underlying error: ${attempt.error}`
    );
  }

  return {
    versionedTx: new VersionedTransaction(attempt.message),
    authorityBasketAtas: authorityAtas,
    amounts: args.amounts,
    ixCount: ixs.length,
    txBytes: attempt.bytes,
  };
}
