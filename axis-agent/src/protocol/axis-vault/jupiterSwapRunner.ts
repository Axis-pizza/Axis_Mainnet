import { Connection } from '@solana/web3.js';
import {
  buildDepositSolPlan,
  SOLANA_MAX_TX_BYTES,
  type DepositSolPlan,
  type DepositSolPlanArgs,
} from './depositSolPlan';
import {
  buildWithdrawSolPlan,
  type WithdrawSolPlan,
  type WithdrawSolPlanArgs,
} from './withdrawSolPlan';
import { sendVersionedTx, type AxisVaultWallet } from './tx';

/// Default ladder of `maxAccounts` values to try when a Jupiter-backed plan
/// blows the 1232-byte wire cap. Starts at the Jupiter default (16, dense
/// routing, best price) and steps down to ever-tighter routes. Stops at 8 —
/// anything tighter usually means Jupiter cannot find a viable direct route.
export const DEFAULT_MAX_ACCOUNTS_LADDER: readonly number[] = Object.freeze([
  16, 14, 12, 10, 8,
]);

export interface PlanAttempt {
  maxAccounts: number;
  bytes?: number;
  error?: string;
}

export interface PlanRetryResult<TPlan> {
  plan: TPlan;
  attempts: PlanAttempt[];
  chosen: { maxAccounts: number; retryAttempt: number };
}

export type JupiterSwapStep = 'single' | 'swap' | 'deposit' | 'withdraw';

export interface JupiterPlanReadyInfo<TPlan> {
  plan: TPlan;
  maxAccounts: number;
  retryAttempt: number;
  attempts: PlanAttempt[];
}

export interface JupiterSwapRetryInfo {
  previousMaxAccounts: number;
  nextMaxAccounts: number;
  previousError: string;
}

export interface JupiterSwapCallbacksFor<TPlan> {
  /// Called once after a plan is finalised — either first try or after a retry
  /// climb. `retryAttempt` is the zero-based index into the ladder.
  onPlanReady?: (info: JupiterPlanReadyInfo<TPlan>) => void;
  /// Called before each tx is sent for signing. `single` fires when the plan
  /// fits in one tx; `swap`/`deposit`/`withdraw` fire in split mode.
  onStepStart?: (step: JupiterSwapStep) => void;
  /// Called after each tx is confirmed.
  onStepDone?: (step: JupiterSwapStep, sig: string) => void;
  /// Called once before each retry attempt at a smaller `maxAccounts`. Useful
  /// for surfacing "Jupiter routes too dense, retrying with simpler routes…"
  /// to the user.
  onRetry?: (info: JupiterSwapRetryInfo) => void;
}

export type DepositSwapCallbacks = JupiterSwapCallbacksFor<DepositSolPlan>;
export type WithdrawSwapCallbacks = JupiterSwapCallbacksFor<WithdrawSolPlan>;
/// Back-compat alias kept for any caller importing the old union name.
export type JupiterSwapCallbacks = JupiterSwapCallbacksFor<DepositSolPlan | WithdrawSolPlan>;

const TX_SIZE_RX = /1232|exceeds?.*size|too\s+large|bytes\s*>\s*\d+\s*cap/i;
function isTxSizeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TX_SIZE_RX.test(msg);
}

async function buildWithLadder<TArgs extends { maxAccounts?: number }, TPlan>(
  build: (args: TArgs) => Promise<TPlan>,
  baseArgs: Omit<TArgs, 'maxAccounts'>,
  ladder: readonly number[],
  getBytes: (plan: TPlan) => number,
  onRetry?: (info: JupiterSwapRetryInfo) => void
): Promise<PlanRetryResult<TPlan>> {
  if (ladder.length === 0) {
    throw new Error('maxAccountsLadder must not be empty');
  }
  const attempts: PlanAttempt[] = [];
  let lastErr: unknown = null;
  for (let i = 0; i < ladder.length; i++) {
    const maxAccounts = ladder[i];
    if (i > 0 && lastErr) {
      onRetry?.({
        previousMaxAccounts: ladder[i - 1],
        nextMaxAccounts: maxAccounts,
        previousError: lastErr instanceof Error ? lastErr.message : String(lastErr),
      });
    }
    try {
      const plan = await build({ ...(baseArgs as TArgs), maxAccounts });
      attempts.push({ maxAccounts, bytes: getBytes(plan) });
      return { plan, attempts, chosen: { maxAccounts, retryAttempt: i } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push({ maxAccounts, error: msg });
      lastErr = e;
      if (!isTxSizeError(e)) {
        throw e;
      }
    }
  }
  throw new Error(
    `Jupiter swap plan exceeded ${SOLANA_MAX_TX_BYTES}-byte cap at every maxAccounts ` +
      `in ladder [${ladder.join(', ')}]. Last error: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }. Try a smaller basket (≤3 mints) or pick tokens with simpler Jupiter routes.`
  );
}

export async function buildDepositSolPlanWithRetry(
  args: Omit<DepositSolPlanArgs, 'maxAccounts'>,
  ladder: readonly number[] = DEFAULT_MAX_ACCOUNTS_LADDER,
  onRetry?: (info: JupiterSwapRetryInfo) => void
): Promise<PlanRetryResult<DepositSolPlan>> {
  return buildWithLadder<DepositSolPlanArgs, DepositSolPlan>(
    buildDepositSolPlan,
    args,
    ladder,
    (p) => p.txBytes,
    onRetry
  );
}

export async function buildWithdrawSolPlanWithRetry(
  args: Omit<WithdrawSolPlanArgs, 'maxAccounts'>,
  ladder: readonly number[] = DEFAULT_MAX_ACCOUNTS_LADDER,
  onRetry?: (info: JupiterSwapRetryInfo) => void
): Promise<PlanRetryResult<WithdrawSolPlan>> {
  return buildWithLadder<WithdrawSolPlanArgs, WithdrawSolPlan>(
    buildWithdrawSolPlan,
    args,
    ladder,
    (p) => p.txBytes,
    onRetry
  );
}

export async function signDepositSolPlan(
  conn: Connection,
  wallet: AxisVaultWallet,
  plan: DepositSolPlan,
  callbacks?: Pick<DepositSwapCallbacks, 'onStepStart' | 'onStepDone'>
): Promise<string[]> {
  const sigs: string[] = [];
  if (plan.mode === 'single') {
    callbacks?.onStepStart?.('single');
    const sig = await sendVersionedTx(conn, wallet, plan.versionedTx);
    sigs.push(sig);
    callbacks?.onStepDone?.('single', sig);
    return sigs;
  }
  if (!plan.depositTx) {
    throw new Error('split deposit plan missing depositTx — internal bug');
  }
  callbacks?.onStepStart?.('swap');
  const swapSig = await sendVersionedTx(conn, wallet, plan.versionedTx);
  sigs.push(swapSig);
  callbacks?.onStepDone?.('swap', swapSig);
  callbacks?.onStepStart?.('deposit');
  const depositSig = await sendVersionedTx(conn, wallet, plan.depositTx);
  sigs.push(depositSig);
  callbacks?.onStepDone?.('deposit', depositSig);
  return sigs;
}

export async function signWithdrawSolPlan(
  conn: Connection,
  wallet: AxisVaultWallet,
  plan: WithdrawSolPlan,
  callbacks?: Pick<WithdrawSwapCallbacks, 'onStepStart' | 'onStepDone'>
): Promise<string[]> {
  const sigs: string[] = [];
  if (plan.mode === 'single') {
    callbacks?.onStepStart?.('single');
    const sig = await sendVersionedTx(conn, wallet, plan.versionedTx);
    sigs.push(sig);
    callbacks?.onStepDone?.('single', sig);
    return sigs;
  }
  if (!plan.swapTx) {
    throw new Error('split withdraw plan missing swapTx — internal bug');
  }
  callbacks?.onStepStart?.('withdraw');
  const withdrawSig = await sendVersionedTx(conn, wallet, plan.versionedTx);
  sigs.push(withdrawSig);
  callbacks?.onStepDone?.('withdraw', withdrawSig);
  callbacks?.onStepStart?.('swap');
  const swapSig = await sendVersionedTx(conn, wallet, plan.swapTx);
  sigs.push(swapSig);
  callbacks?.onStepDone?.('swap', swapSig);
  return sigs;
}

export interface RunDepositSolArgs {
  conn: Connection;
  wallet: AxisVaultWallet;
  planArgs: Omit<DepositSolPlanArgs, 'maxAccounts'>;
  maxAccountsLadder?: readonly number[];
  callbacks?: DepositSwapCallbacks;
}

export interface RunDepositSolResult extends PlanRetryResult<DepositSolPlan> {
  sigs: string[];
}

export async function runDepositSolFlow(args: RunDepositSolArgs): Promise<RunDepositSolResult> {
  const built = await buildDepositSolPlanWithRetry(
    args.planArgs,
    args.maxAccountsLadder,
    args.callbacks?.onRetry
  );
  args.callbacks?.onPlanReady?.({
    plan: built.plan,
    maxAccounts: built.chosen.maxAccounts,
    retryAttempt: built.chosen.retryAttempt,
    attempts: built.attempts,
  });
  const sigs = await signDepositSolPlan(args.conn, args.wallet, built.plan, args.callbacks);
  return { ...built, sigs };
}

export interface RunWithdrawSolArgs {
  conn: Connection;
  wallet: AxisVaultWallet;
  planArgs: Omit<WithdrawSolPlanArgs, 'maxAccounts'>;
  maxAccountsLadder?: readonly number[];
  callbacks?: WithdrawSwapCallbacks;
}

export interface RunWithdrawSolResult extends PlanRetryResult<WithdrawSolPlan> {
  sigs: string[];
}

export async function runWithdrawSolFlow(args: RunWithdrawSolArgs): Promise<RunWithdrawSolResult> {
  const built = await buildWithdrawSolPlanWithRetry(
    args.planArgs,
    args.maxAccountsLadder,
    args.callbacks?.onRetry
  );
  args.callbacks?.onPlanReady?.({
    plan: built.plan,
    maxAccounts: built.chosen.maxAccounts,
    retryAttempt: built.chosen.retryAttempt,
    attempts: built.attempts,
  });
  const sigs = await signWithdrawSolPlan(args.conn, args.wallet, built.plan, args.callbacks);
  return { ...built, sigs };
}

/// Synchronous pre-flight that runs without hitting Jupiter or the chain.
/// Catches the obvious failures (bad basket size, bad weight sum, zero SOL)
/// before we burn a network round-trip — and surfaces tx-size warnings so
/// the UI can flag risky basket shapes upfront.
export interface JupiterDepositPreflight {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface PreflightDepositSolArgs {
  basketSize: number;
  weights: number[];
  solIn: bigint;
  /// Starting `maxAccounts` if no ladder is supplied — used purely for
  /// heuristic warnings ("you're likely to hit a retry").
  maxAccounts?: number;
}

export function preflightDepositSol(args: PreflightDepositSolArgs): JupiterDepositPreflight {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (args.basketSize !== args.weights.length) {
    errors.push('basket size / weights length mismatch');
  }
  if (args.basketSize < 2 || args.basketSize > 5) {
    errors.push(`basket size must be 2..5; got ${args.basketSize}`);
  }
  const sumW = args.weights.reduce((a, b) => a + b, 0);
  if (sumW !== 10_000) {
    errors.push(`weights must sum to 10_000; got ${sumW}`);
  }
  if (args.weights.some((w) => w <= 0)) {
    errors.push('weights must all be positive');
  }
  if (args.solIn <= 0n) {
    errors.push('SOL input must be > 0');
  }
  const startMaxAccounts = args.maxAccounts ?? DEFAULT_MAX_ACCOUNTS_LADDER[0];
  if (args.basketSize >= 5 && startMaxAccounts >= 14) {
    warnings.push(
      `5-mint baskets often exceed the ${SOLANA_MAX_TX_BYTES}-byte tx cap with ` +
        `maxAccounts ≥14 — runner will auto-retry at lower ladder values, which adds ` +
        `1–2s of Jupiter quote latency.`
    );
  } else if (args.basketSize >= 4 && startMaxAccounts >= 16) {
    warnings.push(
      `4-mint baskets typically need maxAccounts ≤14 — runner will fall back automatically.`
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}
