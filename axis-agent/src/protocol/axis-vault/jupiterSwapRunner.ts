import { Connection } from '@solana/web3.js';
import {
  buildDepositSolMultiTxPlan,
  buildDepositSolPlan,
  SOLANA_MAX_TX_BYTES,
  type DepositSolPlan,
  type DepositSolPlanArgs,
} from './depositSolPlan';
import {
  buildWithdrawSolMultiTxPlan,
  buildWithdrawSolPlan,
  type WithdrawSolPlan,
  type WithdrawSolPlanArgs,
} from './withdrawSolPlan';
import { sendVersionedTx, type AxisVaultWallet } from './tx';

/// Default ladder of `maxAccounts` values to try when a Jupiter-backed plan
/// blows the 1232-byte wire cap. Starts at the Jupiter default (16, dense
/// routing, best price) and steps down to ever-tighter routes. Stops at 10 —
/// at 8 most mid/small-cap mints fall off Jupiter's route graph entirely
/// (`NO_ROUTES_FOUND`). When the ladder is exhausted the runner falls back
/// to per-leg multi-tx mode, which gets full maxAccounts per leg without
/// sharing the 1232-byte budget.
export const DEFAULT_MAX_ACCOUNTS_LADDER: readonly number[] = Object.freeze([
  16, 14, 12, 10,
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

export type JupiterSwapStep =
  | 'single'
  | 'swap'
  | 'deposit'
  | 'withdraw'
  | 'setup'
  | 'leg'
  | 'cleanup';

/// Optional per-leg context for the `leg` step in multi-tx mode.
export interface JupiterLegStepContext {
  /// Index into the plan's `legTxs` (zero-based).
  legIndex: number;
  /// Total number of leg txs in the plan.
  legCount: number;
  /// `maxAccounts` Jupiter used for this leg's quote.
  maxAccounts: number;
}

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
  /// fits in one tx; `swap`/`deposit`/`withdraw` fire in split mode;
  /// `setup`/`leg`/`cleanup` + `deposit`/`withdraw` fire in multi mode.
  onStepStart?: (step: JupiterSwapStep, leg?: JupiterLegStepContext) => void;
  /// Called after each tx is confirmed.
  onStepDone?: (step: JupiterSwapStep, sig: string, leg?: JupiterLegStepContext) => void;
  /// Called once before each retry attempt at a smaller `maxAccounts`. Useful
  /// for surfacing "Jupiter routes too dense, retrying with simpler routes…"
  /// to the user.
  onRetry?: (info: JupiterSwapRetryInfo) => void;
  /// Fires once if the bundled plan exhausted the ladder and the runner
  /// fell back to per-leg multi-tx mode. Use for telemetry / breadcrumbs.
  onMultiTxFallback?: (info: MultiTxFallbackInfo) => void;
}

export type DepositSwapCallbacks = JupiterSwapCallbacksFor<DepositSolPlan>;
export type WithdrawSwapCallbacks = JupiterSwapCallbacksFor<WithdrawSolPlan>;
/// Back-compat alias kept for any caller importing the old union name.
export type JupiterSwapCallbacks = JupiterSwapCallbacksFor<DepositSolPlan | WithdrawSolPlan>;

const TX_SIZE_RX = /1232|exceeds?.*size|too\s+large|bytes\s*>\s*\d+\s*cap|encoding overruns/i;
function isTxSizeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TX_SIZE_RX.test(msg);
}

const NO_ROUTES_RX = /NO_ROUTES_FOUND|No\s+routes\s+found/i;
function isNoRoutesError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return NO_ROUTES_RX.test(msg);
}

/// Returns true when the failure is one we can recover from by falling
/// back to multi-tx (per-leg) mode. Both 1232-byte overflow and Jupiter
/// NO_ROUTES_FOUND share the same root cause: the bundled plan is too
/// constrained. Splitting per-leg gives each swap the full 1232 budget
/// and full maxAccounts headroom.
export function isMultiTxRecoverable(err: unknown): boolean {
  return isTxSizeError(err) || isNoRoutesError(err);
}

/// Attached to the throw when the ladder runs out so callers (the deposit
/// + withdraw runners) can recognise the signal and fall back to multi-tx
/// mode. The wrapper text stays the same so existing log scrapers keep
/// matching, but `cause` carries the structured marker.
class LadderExhaustedError extends Error {
  readonly ladderExhausted = true;
  readonly attempts: PlanAttempt[];
  constructor(message: string, attempts: PlanAttempt[]) {
    super(message);
    this.name = 'LadderExhaustedError';
    this.attempts = attempts;
  }
}

function isLadderExhausted(err: unknown): err is LadderExhaustedError {
  return err instanceof LadderExhaustedError;
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
      // Only retry for failures that come from too-tight bundling. For
      // tx-size: shrinking maxAccounts simplifies the route. For NO_ROUTES:
      // we want the runner to escalate to multi-tx mode, but only AFTER the
      // ladder has had a chance to size down — at low maxAccounts Jupiter
      // sometimes 400s, at higher ones the tx is too big. So treat both as
      // recoverable here and keep climbing the ladder; the final throw will
      // trigger the multi-tx fallback above.
      if (!isMultiTxRecoverable(e)) {
        throw e;
      }
    }
  }
  throw new LadderExhaustedError(
    `Jupiter swap plan exceeded ${SOLANA_MAX_TX_BYTES}-byte cap at every maxAccounts ` +
      `in ladder [${ladder.join(', ')}]. Last error: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }. Falling back to per-leg multi-tx mode.`,
    attempts
  );
}

/// Called by the deposit/withdraw retries when the bundled ladder exhausts.
/// Surfaces both the ladder attempts AND the per-leg fallback's outcome
/// to telemetry callers.
export interface MultiTxFallbackInfo {
  reason: 'ladder-exhausted' | 'no-routes';
  previousAttempts: PlanAttempt[];
  triggerError: string;
}

export async function buildDepositSolPlanWithRetry(
  args: Omit<DepositSolPlanArgs, 'maxAccounts'>,
  ladder: readonly number[] = DEFAULT_MAX_ACCOUNTS_LADDER,
  onRetry?: (info: JupiterSwapRetryInfo) => void,
  onMultiTxFallback?: (info: MultiTxFallbackInfo) => void
): Promise<PlanRetryResult<DepositSolPlan>> {
  try {
    return await buildWithLadder<DepositSolPlanArgs, DepositSolPlan>(
      buildDepositSolPlan,
      args,
      ladder,
      (p) => p.txBytes,
      onRetry
    );
  } catch (e) {
    if (!isLadderExhausted(e) && !isMultiTxRecoverable(e)) {
      throw e;
    }
    const previousAttempts = isLadderExhausted(e)
      ? e.attempts
      : [{ maxAccounts: ladder[0], error: e instanceof Error ? e.message : String(e) }];
    onMultiTxFallback?.({
      reason: isNoRoutesError(e) ? 'no-routes' : 'ladder-exhausted',
      previousAttempts,
      triggerError: e instanceof Error ? e.message : String(e),
    });
    const plan = await buildDepositSolMultiTxPlan({ ...args, maxAccounts: ladder[0] });
    return {
      plan,
      attempts: [
        ...previousAttempts,
        { maxAccounts: ladder[0], bytes: plan.txBytes },
      ],
      chosen: { maxAccounts: ladder[0], retryAttempt: previousAttempts.length },
    };
  }
}

export async function buildWithdrawSolPlanWithRetry(
  args: Omit<WithdrawSolPlanArgs, 'maxAccounts'>,
  ladder: readonly number[] = DEFAULT_MAX_ACCOUNTS_LADDER,
  onRetry?: (info: JupiterSwapRetryInfo) => void,
  onMultiTxFallback?: (info: MultiTxFallbackInfo) => void
): Promise<PlanRetryResult<WithdrawSolPlan>> {
  try {
    return await buildWithLadder<WithdrawSolPlanArgs, WithdrawSolPlan>(
      buildWithdrawSolPlan,
      args,
      ladder,
      (p) => p.txBytes,
      onRetry
    );
  } catch (e) {
    if (!isLadderExhausted(e) && !isMultiTxRecoverable(e)) {
      throw e;
    }
    const previousAttempts = isLadderExhausted(e)
      ? e.attempts
      : [{ maxAccounts: ladder[0], error: e instanceof Error ? e.message : String(e) }];
    onMultiTxFallback?.({
      reason: isNoRoutesError(e) ? 'no-routes' : 'ladder-exhausted',
      previousAttempts,
      triggerError: e instanceof Error ? e.message : String(e),
    });
    const plan = await buildWithdrawSolMultiTxPlan({ ...args, maxAccounts: ladder[0] });
    return {
      plan,
      attempts: [
        ...previousAttempts,
        { maxAccounts: ladder[0], bytes: plan.txBytes },
      ],
      chosen: { maxAccounts: ladder[0], retryAttempt: previousAttempts.length },
    };
  }
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
  if (plan.mode === 'split') {
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
  // multi mode: setup → per-leg swaps → deposit
  if (!plan.depositTx || !plan.legTxs || !plan.legMaxAccounts) {
    throw new Error('multi deposit plan missing legTxs/depositTx — internal bug');
  }
  callbacks?.onStepStart?.('setup');
  const setupSig = await sendVersionedTx(conn, wallet, plan.versionedTx);
  sigs.push(setupSig);
  callbacks?.onStepDone?.('setup', setupSig);
  for (let i = 0; i < plan.legTxs.length; i++) {
    const ctx: JupiterLegStepContext = {
      legIndex: i,
      legCount: plan.legTxs.length,
      maxAccounts: plan.legMaxAccounts[i] ?? 0,
    };
    callbacks?.onStepStart?.('leg', ctx);
    const legSig = await sendVersionedTx(conn, wallet, plan.legTxs[i]);
    sigs.push(legSig);
    callbacks?.onStepDone?.('leg', legSig, ctx);
  }
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
  if (plan.mode === 'split') {
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
  // multi mode: withdraw → per-leg swaps → cleanup (close wSOL, if owed)
  if (!plan.legTxs || !plan.legMaxAccounts) {
    throw new Error('multi withdraw plan missing legTxs — internal bug');
  }
  callbacks?.onStepStart?.('withdraw');
  const withdrawSig = await sendVersionedTx(conn, wallet, plan.versionedTx);
  sigs.push(withdrawSig);
  callbacks?.onStepDone?.('withdraw', withdrawSig);
  for (let i = 0; i < plan.legTxs.length; i++) {
    const ctx: JupiterLegStepContext = {
      legIndex: i,
      legCount: plan.legTxs.length,
      maxAccounts: plan.legMaxAccounts[i] ?? 0,
    };
    callbacks?.onStepStart?.('leg', ctx);
    const legSig = await sendVersionedTx(conn, wallet, plan.legTxs[i]);
    sigs.push(legSig);
    callbacks?.onStepDone?.('leg', legSig, ctx);
  }
  if (plan.cleanupTx) {
    callbacks?.onStepStart?.('cleanup');
    const cleanupSig = await sendVersionedTx(conn, wallet, plan.cleanupTx);
    sigs.push(cleanupSig);
    callbacks?.onStepDone?.('cleanup', cleanupSig);
  }
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
    args.callbacks?.onRetry,
    args.callbacks?.onMultiTxFallback
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
    args.callbacks?.onRetry,
    args.callbacks?.onMultiTxFallback
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

/// Translate a raw plan/runner error into something a non-technical user can
/// act on. Toasts call this before display; the original message still reaches
/// the dev console / log panel via the underlying error chain. Keep ordering
/// specific → generic so the wrapper "exceeded ... at every maxAccounts" wins
/// against the inner "blew the 1232-byte cap".
export function humanizeJupiterError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Per-leg fallback also failed — usually means a single mint has an
  // exotic route (Token-2022 + transfer-fee + complex DEX path) that even a
  // standalone tx can't fit. Far rarer than the bundled-cap case.
  if (/Per-leg.*failed across ladder/i.test(raw)) {
    return 'One of this basket\'s tokens has Jupiter routes too complex for a standalone transaction. Pick a simpler mint and retry.';
  }

  // Ladder-exhausted: every bundled maxAccounts step blew the wire cap.
  // The runner now auto-falls back to per-leg multi-tx — if the user sees
  // this it means they hit a non-fallback path (legacy caller).
  if (/exceeded\s+\d+-byte\s+cap\s+at\s+every\s+maxAccounts|Falling back to per-leg/i.test(raw)) {
    return 'Jupiter routes for this basket are dense — switching to per-leg signing (you\'ll sign a few more transactions).';
  }

  // Single-attempt size overflow (legacy paths without retry, or split-mode
  // overflow before the ladder escalates).
  if (/blew the \d+-byte wire cap|encoding overruns|serialized\s+\d+\s+bytes\s*>\s*\d+\s*cap/i.test(raw)) {
    return 'Jupiter routes for this basket are too dense for a single transaction. Try a smaller basket or simpler tokens.';
  }

  // Wallet ran out of SOL — already user-friendly, surface as-is.
  if (/^Insufficient SOL:/i.test(raw)) return raw;

  // First-deposit floor — already actionable, surface as-is.
  if (/First deposit must yield/i.test(raw)) return raw;

  // Preflight already speaks the user's language.
  if (/^preflight failed:/i.test(raw)) return raw;

  // Jupiter API hiccups: trim the noisy prefix.
  if (/Jupiter quote failed/i.test(raw)) {
    return `Jupiter routing unavailable — ${raw.replace(/^Jupiter quote failed:\s*/, '').slice(0, 180)}`;
  }
  if (/Jupiter swap-instructions failed/i.test(raw)) {
    return 'Jupiter route returned an error mid-swap. Retry in a moment or try a smaller basket.';
  }

  // ETF paused / no supply / basket-shape errors — these are short and clear.
  if (/(ETF is paused|ETF has no supply|basket size must be|weights must sum|burn(?:Amount)?)/i.test(raw)) {
    return raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
  }

  // Wallet-rejected signing
  if (/User rejected|user rejected|cancelled by user/i.test(raw)) {
    return 'Transaction cancelled in wallet.';
  }

  // Network / RPC noise
  if (/blockhash not found|block height exceeded|Network request failed|fetch failed/i.test(raw)) {
    return 'Network glitch — retry in a moment.';
  }

  // Default: trim ellipsis, keep enough context to debug from a screenshot.
  return raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
}
