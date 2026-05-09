import {
  Connection,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  findHistory3,
  findQueue3,
  findTicket3,
  ixClaim3,
  ixClearBatch3,
  ixSwapRequest3,
} from './ix';
import type { PoolState3Data } from './pfmmState';
import { fetchPoolState3 } from './pfmmState';

/// PFMM swap-request → clear-batch → claim helpers.
/// The flow is: user submits a SwapRequest in batch N (creates a Ticket PDA),
/// waits ≥ window_slots for the batch to close, then someone (anyone) calls
/// ClearBatch which produces a History account, and finally the user calls
/// Claim to receive their pro-rata output. Until a Jito searcher picks this
/// up the buyer self-cranks ClearBatch + Claim.

export interface PfmmTicketRecord {
  /** Pool PDA (== strategy.address for PFMM strategies). */
  pool: string;
  /** Strategy id (backend) so we can resolve it from pendingTickets later. */
  strategyId: string;
  /** Display name for banner copy. */
  strategyName: string;
  /** Batch ID at submit time (string of bigint). */
  batchId: string;
  /** Ticket PDA. */
  ticket: string;
  /** Submit-time slot estimate of when the batch window will close. */
  windowEndSlot: string;
  /** Wallet that owns the ticket (string). */
  user: string;
  /** Token mint the user is buying into (output leg of the swap). */
  outMint: string;
  /** Index 0..2 of the output token within pool.tokenMints. */
  outIdx: number;
  /** Token mint the user paid in (always SOL/wSOL today). */
  inMint: string;
  /** Display amount the user spent (UI units, not lamports). */
  amountInUi: number;
  /** Submit unix ts (ms) for "X minutes ago" labels. */
  submittedAt: number;
}

export interface BuildSwapRequestArgs {
  programId: PublicKey;
  user: PublicKey;
  pool: PoolState3Data;
  /** Index of the input token in pool.tokenMints (0..2). */
  inIdx: number;
  /** Index of the output token (0..2). Must differ from inIdx. */
  outIdx: number;
  /** Amount to swap, in input-token base units. */
  amountIn: bigint;
  /** Minimum acceptable output (base units). 0n disables slippage check. */
  minOut?: bigint;
}

export interface BuildSwapRequestResult {
  /** Instructions to add to the tx, in order. */
  ixs: TransactionInstruction[];
  /** Ticket PDA created by the SwapRequest (used in Claim later). */
  ticket: PublicKey;
  /** Queue PDA for the active batch. */
  queue: PublicKey;
  /** Batch ID the request will land in. */
  batchId: bigint;
  /** Slot estimate when the window closes (currentBatchId end). */
  windowEndSlot: bigint;
}

/// Build the SwapRequest tx for a single user → single output leg.
/// Caller is responsible for funding the input ATA (e.g. Jupiter swap from
/// SOL → inMint already settled, or input is already wSOL).
export function buildSwapRequest3(args: BuildSwapRequestArgs): BuildSwapRequestResult {
  if (args.inIdx === args.outIdx) {
    throw new Error('inIdx and outIdx must differ');
  }
  if (args.inIdx < 0 || args.inIdx > 2 || args.outIdx < 0 || args.outIdx > 2) {
    throw new Error('inIdx / outIdx out of range (0..2)');
  }
  const batchId = args.pool.currentBatchId;
  const [queue] = findQueue3(args.programId, args.pool.pool, batchId);
  const [ticket] = findTicket3(args.programId, args.pool.pool, args.user, batchId);
  const inMint = args.pool.tokenMints[args.inIdx];
  const userTokenIn = getAssociatedTokenAddressSync(inMint, args.user);
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    args.user,
    userTokenIn,
    args.user,
    inMint,
  );
  const swapIx = ixSwapRequest3({
    programId: args.programId,
    user: args.user,
    pool: args.pool.pool,
    queue,
    ticket,
    userTokenIn,
    vaultIn: args.pool.vaults[args.inIdx],
    inIdx: args.inIdx,
    outIdx: args.outIdx,
    amountIn: args.amountIn,
    minOut: args.minOut ?? 0n,
  });
  return {
    ixs: [ataIx, swapIx],
    ticket,
    queue,
    batchId,
    windowEndSlot: args.pool.currentWindowEnd,
  };
}

export type TicketStatus =
  /** Window has not closed yet — wait. */
  | { kind: 'pending'; slotsRemaining: number }
  /** Window closed but batch not cleared — caller may self-crank. */
  | { kind: 'awaiting-clear' }
  /** Batch cleared — caller may now claim. */
  | { kind: 'claimable' }
  /** Ticket already closed (claimed). */
  | { kind: 'claimed' };

export interface TicketStatusArgs {
  conn: Connection;
  programId: PublicKey;
  pool: PublicKey;
  user: PublicKey;
  batchId: bigint;
  ticket: PublicKey;
}

/// Decide what action (if any) the caller should take next for this ticket.
/// Reads pool state + history account + ticket account in parallel.
export async function checkTicketStatus(args: TicketStatusArgs): Promise<TicketStatus> {
  const [history] = findHistory3(args.programId, args.pool, args.batchId);
  const [poolData, ticketInfo, historyInfo, slot] = await Promise.all([
    fetchPoolState3(args.conn, args.pool),
    args.conn.getAccountInfo(args.ticket, 'confirmed'),
    args.conn.getAccountInfo(history, 'confirmed'),
    args.conn.getSlot('confirmed'),
  ]);
  if (!ticketInfo) return { kind: 'claimed' };
  if (historyInfo) return { kind: 'claimable' };
  if (!poolData) return { kind: 'awaiting-clear' };
  if (poolData.currentBatchId > args.batchId) return { kind: 'awaiting-clear' };
  // Same batch still active — see how many slots are left in the window.
  const remaining = Number(poolData.currentWindowEnd) - slot;
  return { kind: 'pending', slotsRemaining: Math.max(0, remaining) };
}

export interface BuildClearBatchArgs {
  programId: PublicKey;
  cranker: PublicKey;
  pool: PublicKey;
  batchId: bigint;
}

/// ClearBatch is permissionless — anyone can call it once the window has
/// closed. We pass cranker as the user wallet so they get the rent rebate
/// from the closed Queue account.
export function buildClearBatch3(args: BuildClearBatchArgs): TransactionInstruction {
  const [queue] = findQueue3(args.programId, args.pool, args.batchId);
  const [history] = findHistory3(args.programId, args.pool, args.batchId);
  const [nextQueue] = findQueue3(args.programId, args.pool, args.batchId + 1n);
  return ixClearBatch3({
    programId: args.programId,
    cranker: args.cranker,
    pool: args.pool,
    queue,
    history,
    nextQueue,
  });
}

export interface BuildClaimArgs {
  programId: PublicKey;
  user: PublicKey;
  pool: PoolState3Data;
  batchId: bigint;
  ticket: PublicKey;
}

export interface BuildClaimResult {
  ixs: TransactionInstruction[];
  history: PublicKey;
  /** ATAs we created idempotently — useful for callers wanting to compute rent. */
  userTokens: [PublicKey, PublicKey, PublicKey];
}

/// Build the Claim ix + idempotent ATA creates for the 3 output mints.
export function buildClaim3(args: BuildClaimArgs): BuildClaimResult {
  const [history] = findHistory3(args.programId, args.pool.pool, args.batchId);
  const userTokens = args.pool.tokenMints.map((mint) =>
    getAssociatedTokenAddressSync(mint, args.user),
  ) as [PublicKey, PublicKey, PublicKey];
  const ataIxs = args.pool.tokenMints.map((mint, i) =>
    createAssociatedTokenAccountIdempotentInstruction(
      args.user,
      userTokens[i],
      args.user,
      mint,
    ),
  );
  const claimIx = ixClaim3({
    programId: args.programId,
    user: args.user,
    pool: args.pool.pool,
    history,
    ticket: args.ticket,
    vaults: args.pool.vaults,
    userTokens,
  });
  return { ixs: [...ataIxs, claimIx], history, userTokens };
}
