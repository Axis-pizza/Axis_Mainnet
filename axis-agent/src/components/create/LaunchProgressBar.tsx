import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DEPLOY_STEPS,
  STEP_LABELS,
  type DeployProgress,
  type DeployStepId,
} from '../../hooks/useDeploymentResume';
import { DeploymentStepList } from './DeploymentStepList';

interface LaunchProgressBarProps {
  progress: DeployProgress | null;
  activeStep: DeployStepId | null;
  explorerCluster: 'devnet' | '';
  /** Optional title row above the bar. Defaults to "Launching…". */
  title?: string;
}

/// Compact, animated progress for the deploy flow. Replaces the verbose
/// `DeploymentStepList` as the default view — exposes the full list via a
/// "View details" toggle so power users / debuggers can still see per-step
/// status + tx links.
///
/// Renders three rows:
///   1. current step title (transitions on change)
///   2. gradient bar that animates smoothly via framer-motion
///   3. "step N of M" subtitle + details toggle
export function LaunchProgressBar({
  progress,
  activeStep,
  explorerCluster,
  title = 'Launching…',
}: LaunchProgressBarProps) {
  const [showDetails, setShowDetails] = useState(false);

  const stepCount = DEPLOY_STEPS.length;
  const doneCount = DEPLOY_STEPS.filter((id) => progress?.steps[id]?.status === 'done').length;
  // Running step counts as 0.5 so the bar visibly inches forward when a step
  // starts rather than only when it lands.
  const runningIndex = activeStep
    ? DEPLOY_STEPS.indexOf(activeStep)
    : DEPLOY_STEPS.findIndex((id) => progress?.steps[id]?.status === 'running');
  const errorStep = DEPLOY_STEPS.find((id) => progress?.steps[id]?.status === 'error') ?? null;
  const hasError = errorStep !== null;

  // Progress fraction in [0, 1]. We bias the running step to 0.5 so the bar
  // moves on step-start, not just on step-done.
  const progressFrac = hasError
    ? doneCount / stepCount
    : runningIndex >= 0
      ? (doneCount + 0.5) / stepCount
      : doneCount / stepCount;
  const progressPct = Math.round(progressFrac * 100);

  // Active step for the title row. Falls back to first pending, then first
  // done in error state, then the final step when complete.
  const headStepId: DeployStepId | null = errorStep
    ? errorStep
    : activeStep
      ? activeStep
      : (DEPLOY_STEPS.find((id) => progress?.steps[id]?.status === 'running') ??
        DEPLOY_STEPS.find((id) => progress?.steps[id]?.status !== 'done') ??
        DEPLOY_STEPS[DEPLOY_STEPS.length - 1]);
  const headLabel = headStepId ? STEP_LABELS[headStepId] : null;
  const headIndex = headStepId ? DEPLOY_STEPS.indexOf(headStepId) + 1 : doneCount;

  const isComplete = doneCount === stepCount;

  return (
    <div className="mb-5">
      <div className="text-[11px] uppercase tracking-widest text-[#B89860]/60 mb-2">
        {title}
      </div>

      {/* Current step name. Animated on change so the swap reads as a beat
          rather than a flicker. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={headStepId ?? 'idle'}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="text-[15px] font-normal text-[#F2E0C8] mb-2"
        >
          {isComplete
            ? 'Done — your ETF is live'
            : hasError
              ? `Stopped at: ${headLabel?.title ?? '—'}`
              : `${headLabel?.title ?? '…'}`}
        </motion.div>
      </AnimatePresence>

      {/* Gradient bar. transform-origin via framer-motion's scaleX gives us
          GPU-accelerated, jitter-free animation on mobile. */}
      <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 22, mass: 0.6 }}
          className={`absolute inset-y-0 left-0 rounded-full ${
            hasError
              ? 'bg-gradient-to-r from-rose-700 to-rose-400'
              : isComplete
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-200'
                : 'bg-gradient-to-r from-emerald-700 via-emerald-500 to-emerald-300'
          }`}
        />
        {/* Subtle shimmer over the active segment while a step is running. */}
        {!hasError && !isComplete && runningIndex >= 0 && (
          <motion.div
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
            style={{ willChange: 'transform' }}
          />
        )}
      </div>

      <div className="flex items-center justify-between mt-2.5">
        <div className="text-[10px] text-[#B89860]/60 font-mono tabular-nums">
          step {headIndex} of {stepCount}
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="text-[10px] text-[#B89860]/70 hover:text-[#F2E0C8] underline-offset-2 hover:underline"
        >
          {showDetails ? 'Hide details' : 'View details'}
        </button>
      </div>

      {/* Expandable full step list. Kept behind the toggle so the default
          view stays clean. */}
      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3">
              <DeploymentStepList
                progress={progress}
                activeStep={activeStep}
                explorerCluster={explorerCluster}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
