import { motion } from 'framer-motion';
import { Check, AlertCircle, Loader2, Circle } from 'lucide-react';
import {
  DEPLOY_STEPS,
  STEP_LABELS,
  type DeployProgress,
  type DeployStepId,
} from '../../hooks/useDeploymentResume';
import { explorerTx } from '../../protocol/axis-vault';

interface DeploymentStepListProps {
  progress: DeployProgress | null;
  /** When set, this step is currently in-flight (overrides the saved 'pending' state). */
  activeStep: DeployStepId | null;
  explorerCluster: 'devnet' | '';
}

/// Visual checklist mapping the 5 deploy steps to plain-English labels +
/// status icon + (when known) a link to the on-chain tx. Replaces the
/// previous freeform "deployStep" string + log dump.
export function DeploymentStepList({
  progress,
  activeStep,
  explorerCluster,
}: DeploymentStepListProps) {
  return (
    <ol className="space-y-2 mb-4">
      {DEPLOY_STEPS.map((id, idx) => {
        const record = progress?.steps[id];
        const isActive = activeStep === id;
        const status = isActive ? 'running' : record?.status ?? 'pending';
        const meta = STEP_LABELS[id];
        return (
          <li
            key={id}
            className={`flex gap-3 rounded-xl p-3 border transition-colors ${
              status === 'running'
                ? 'bg-amber-900/15 border-amber-500/30'
                : status === 'done'
                  ? 'bg-emerald-900/10 border-emerald-700/20'
                  : status === 'error'
                    ? 'bg-rose-900/15 border-rose-700/30'
                    : 'bg-white/[0.02] border-white/[0.05]'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              <StatusIcon status={status} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[13px] text-white/90">
                <span className="font-mono text-[10px] text-white/30">{idx + 1}.</span>
                <span className="font-normal">{meta.title}</span>
              </div>
              <p className="text-[11px] text-white/50 mt-0.5 leading-snug">{meta.help}</p>
              {record?.sig && status !== 'pending' && (
                <a
                  href={explorerTx(record.sig, explorerCluster)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[10px] text-amber-300/70 hover:text-amber-200 mt-1 font-mono break-all"
                >
                  tx {record.sig.slice(0, 8)}…
                </a>
              )}
              {status === 'error' && record?.error && (
                <p className="text-[11px] text-rose-300 mt-1 leading-snug">
                  {humanizeStepError(record.error)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StatusIcon({
  status,
}: {
  status: 'pending' | 'running' | 'done' | 'error';
}) {
  if (status === 'done') return <Check className="w-4 h-4 text-emerald-400" />;
  if (status === 'error') return <AlertCircle className="w-4 h-4 text-rose-400" />;
  if (status === 'running') {
    return (
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: 'linear', duration: 1.4 }}>
        <Loader2 className="w-4 h-4 text-amber-300" />
      </motion.div>
    );
  }
  return <Circle className="w-4 h-4 text-white/20" />;
}

/// Strip technical jargon out of common errors so the user sees something
/// they can act on instead of a raw RPC string.
function humanizeStepError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('insufficient') && lower.includes('sol')) {
    return 'Not enough SOL. Top up the wallet and tap "Resume from here".';
  }
  if (lower.includes('user rejected') || lower.includes('rejected')) {
    return 'You cancelled the wallet prompt. Tap "Resume from here" to try again.';
  }
  if (lower.includes('1232') || lower.includes('encoding overruns')) {
    return 'Trade route is unusually crowded — try again in a few seconds.';
  }
  if (lower.includes('blockhash') || lower.includes('expired')) {
    return 'Network confirmation timed out. Retry should fix it.';
  }
  // Truncate so a 600-char rpc dump doesn't blow out the layout.
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}
