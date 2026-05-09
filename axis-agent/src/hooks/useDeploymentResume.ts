import { useCallback, useEffect, useState } from 'react';

/// Persistent deployment progress so a user can reload, switch tabs, or come
/// back tomorrow and see exactly where their strategy creation stalled.
/// Each step's "done" status is also derivable from on-chain reads, but we
/// cache them here so the UI doesn't flash "step 0" while RPCs settle.

export type DeployStepId =
  | 'createEtf'
  | 'initPool'
  | 'seed'
  | 'addLiquidity'
  | 'etfDeposit';

export const DEPLOY_STEPS: DeployStepId[] = [
  'createEtf',
  'initPool',
  'seed',
  'addLiquidity',
  'etfDeposit',
];

export interface DeployStepRecord {
  status: 'pending' | 'running' | 'done' | 'error';
  /** First successful tx sig for this step (for explorer link). */
  sig?: string;
  /** Last error message — only set when status === 'error'. */
  error?: string;
  /** Last update unix ms. */
  ts: number;
}

export interface DeployProgress {
  /** Owner pubkey (base58). */
  owner: string;
  /** Strategy name (PDA seed). */
  strategyName: string;
  /** Deployed pool address (PFMM). */
  poolAddress?: string;
  /** axis-vault EtfState PDA. */
  etfStatePda?: string;
  /** axis-vault ETF mint. */
  etfMint?: string;
  /** Per-step state. */
  steps: Record<DeployStepId, DeployStepRecord>;
  /** Created at (ms). */
  createdAt: number;
  /** Updated at (ms). */
  updatedAt: number;
}

const STORAGE_PREFIX = 'axis:deploy:v1:';

function makeKey(owner: string, strategyName: string): string {
  return `${STORAGE_PREFIX}${owner}:${strategyName}`;
}

function emptyProgress(owner: string, strategyName: string): DeployProgress {
  const ts = Date.now();
  const steps = DEPLOY_STEPS.reduce(
    (acc, id) => ({ ...acc, [id]: { status: 'pending' as const, ts } }),
    {} as Record<DeployStepId, DeployStepRecord>,
  );
  return {
    owner,
    strategyName,
    steps,
    createdAt: ts,
    updatedAt: ts,
  };
}

function readProgress(owner: string, strategyName: string): DeployProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(makeKey(owner, strategyName));
    if (!raw) return null;
    return JSON.parse(raw) as DeployProgress;
  } catch {
    return null;
  }
}

function writeProgress(p: DeployProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(makeKey(p.owner, p.strategyName), JSON.stringify(p));
  } catch {
    // localStorage quota — non-fatal.
  }
}

export interface UseDeploymentResumeArgs {
  owner: string | null | undefined;
  strategyName: string | null | undefined;
}

export interface UseDeploymentResumeResult {
  progress: DeployProgress | null;
  /** Set or update step status + sig + error. */
  updateStep: (id: DeployStepId, patch: Partial<DeployStepRecord>) => void;
  /** Stash the strategy's known PDAs so we can resume even if the URL changes. */
  setAddresses: (patch: Partial<Pick<DeployProgress, 'poolAddress' | 'etfStatePda' | 'etfMint'>>) => void;
  /** Wipe local progress (e.g. after successful "Done & continue"). */
  clear: () => void;
  /** True if any step is recorded. */
  hasProgress: boolean;
}

/// Track per-strategy deploy progress in localStorage, scoped to (owner,name).
/// Returns null progress until the wallet + name are known so callers can
/// render a clean placeholder.
export function useDeploymentResume(args: UseDeploymentResumeArgs): UseDeploymentResumeResult {
  const { owner, strategyName } = args;
  const [progress, setProgress] = useState<DeployProgress | null>(() => {
    if (!owner || !strategyName) return null;
    return readProgress(owner, strategyName) ?? null;
  });

  // Hydrate when (owner, name) changes — handles the "user pasted in a name"
  // race where the constructor saw nulls. Async to keep us out of the
  // synchronous-effect-setState lint trap.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!owner || !strategyName) {
        setProgress(null);
        return;
      }
      const stored = readProgress(owner, strategyName);
      setProgress(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [owner, strategyName]);

  const ensureProgress = useCallback(
    (existing: DeployProgress | null): DeployProgress => {
      if (existing) return existing;
      if (!owner || !strategyName) {
        throw new Error('owner + strategyName required before recording progress');
      }
      return emptyProgress(owner, strategyName);
    },
    [owner, strategyName],
  );

  const updateStep = useCallback(
    (id: DeployStepId, patch: Partial<DeployStepRecord>) => {
      setProgress((curr) => {
        const base = ensureProgress(curr);
        const prev = base.steps[id];
        const next: DeployProgress = {
          ...base,
          updatedAt: Date.now(),
          steps: {
            ...base.steps,
            [id]: {
              ...prev,
              ...patch,
              ts: Date.now(),
            },
          },
        };
        writeProgress(next);
        return next;
      });
    },
    [ensureProgress],
  );

  const setAddresses = useCallback(
    (patch: Partial<Pick<DeployProgress, 'poolAddress' | 'etfStatePda' | 'etfMint'>>) => {
      setProgress((curr) => {
        const base = ensureProgress(curr);
        const next: DeployProgress = {
          ...base,
          ...patch,
          updatedAt: Date.now(),
        };
        writeProgress(next);
        return next;
      });
    },
    [ensureProgress],
  );

  const clear = useCallback(() => {
    if (!owner || !strategyName) return;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(makeKey(owner, strategyName));
    }
    setProgress(null);
  }, [owner, strategyName]);

  return {
    progress,
    updateStep,
    setAddresses,
    clear,
    hasProgress: progress !== null,
  };
}

export const STEP_LABELS: Record<DeployStepId, { title: string; help: string }> = {
  createEtf: {
    title: 'Open your ETF',
    help: 'Creates the on-chain account that wraps your basket as a single token.',
  },
  initPool: {
    title: 'Set up the trading pool',
    help: 'Spins up the batch-auction pool that lets others trade between your basket tokens.',
  },
  seed: {
    title: 'Buy the basket',
    help: 'Uses your SOL to buy the underlying tokens at the best Jupiter price.',
  },
  addLiquidity: {
    title: 'Fund the pool',
    help: 'Deposits the basket tokens into the pool so traders have something to swap against.',
  },
  etfDeposit: {
    title: 'Mint your first ETF tokens',
    help: 'Locks in your share. After this you hold actual ETF tokens you can trade or burn.',
  },
};
