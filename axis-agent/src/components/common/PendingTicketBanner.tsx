import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronDown, ChevronUp, ExternalLink, Hourglass } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import { useConnection, useWallet } from '../../hooks/useWallet';
import { useAxisVaultWallet } from '../../hooks/useAxisVaultWallet';
import { useToast } from '../../context/ToastContext';
import {
  PFDA_AMM3_PROGRAM_ID,
  buildClaim3,
  buildClearBatch3,
  explorerTx,
  fetchPoolState3,
  getClusterConfig,
  sendTx,
  truncatePubkey,
} from '../../protocol/axis-vault';
import {
  usePendingTickets,
  type PendingTicketWithStatus,
} from '../../hooks/usePendingTickets';

const config = getClusterConfig('mainnet');

/// Per-ticket auto-claim guard. We don't want to spam the wallet with
/// confirmation prompts every time the 5s polling tick re-renders the banner;
/// `inflight` keeps that to one prompt per status transition.
type Inflight = Map<string, 'clear' | 'claim'>;

export function PendingTicketBanner() {
  const { tickets, removeTicket, refresh } = usePendingTickets();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const axisWallet = useAxisVaultWallet();
  const { showToast } = useToast();

  const [expanded, setExpanded] = useState(false);
  const inflightRef = useRef<Inflight>(new Map());

  // Auto-advance: when a ticket flips to awaiting-clear or claimable and the
  // user is connected, kick off the matching tx. One concurrent action per
  // ticket so the wallet doesn't get flooded.
  useEffect(() => {
    if (!publicKey || !axisWallet) return;
    for (const t of tickets) {
      if (!t.status) continue;
      if (t.status.kind === 'pending') continue;
      if (t.status.kind === 'claimed') continue;
      if (inflightRef.current.has(t.ticket)) continue;
      void runStep(t);
    }
    async function runStep(t: PendingTicketWithStatus) {
      try {
        if (t.status?.kind === 'awaiting-clear') {
          inflightRef.current.set(t.ticket, 'clear');
          const ix = buildClearBatch3({
            programId: PFDA_AMM3_PROGRAM_ID,
            cranker: publicKey!,
            pool: new PublicKey(t.pool),
            batchId: BigInt(t.batchId),
          });
          const sig = await sendTx(connection, axisWallet!, [ix]);
          showToast(
            `Closed batch for ${t.strategyName} — claiming next`,
            'info',
          );
          if (import.meta.env.DEV) console.info('[pfmm] clear sig', sig);
        } else if (t.status?.kind === 'claimable') {
          inflightRef.current.set(t.ticket, 'claim');
          const pool = await fetchPoolState3(connection, new PublicKey(t.pool));
          if (!pool) throw new Error('pool state missing');
          const built = buildClaim3({
            programId: PFDA_AMM3_PROGRAM_ID,
            user: publicKey!,
            pool,
            batchId: BigInt(t.batchId),
            ticket: new PublicKey(t.ticket),
          });
          const sig = await sendTx(connection, axisWallet!, built.ixs);
          showToast(
            `Claimed ${t.strategyName} — ${explorerTx(sig, config.explorerCluster)}`,
            'success',
          );
          removeTicket(t.ticket);
        }
      } catch (e) {
        // Race: a Jito searcher (or the user from another tab) may have
        // already cleared/claimed. Treat the resulting "AlreadyCleared" /
        // missing-account error as success and let the next refresh tick
        // reconcile state.
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes('BatchAlreadyCleared') ||
          msg.includes('TicketAlreadyClaimed') ||
          msg.includes('account not found')
        ) {
          showToast(`Settled by another worker — refreshing ${t.strategyName}`, 'info');
        } else {
          console.error('[PendingTicketBanner] step failed', t, e);
          showToast(
            `Couldn't ${t.status?.kind === 'awaiting-clear' ? 'close' : 'claim'} ${t.strategyName}: ${msg.slice(0, 80)}`,
            'error',
          );
        }
      } finally {
        inflightRef.current.delete(t.ticket);
        refresh();
      }
    }
  }, [tickets, publicKey, axisWallet, connection, showToast, removeTicket, refresh]);

  const summary = useMemo(() => {
    const pending = tickets.filter((t) => t.status?.kind === 'pending').length;
    const acting = tickets.filter(
      (t) => t.status?.kind === 'awaiting-clear' || t.status?.kind === 'claimable',
    ).length;
    return { pending, acting, total: tickets.length };
  }, [tickets]);

  if (tickets.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="pending-banner"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 28 }}
        className="fixed bottom-20 inset-x-3 z-[9990] md:bottom-6 md:left-auto md:right-6 md:w-[360px]"
      >
        <div className="rounded-2xl bg-[#140E08]/95 backdrop-blur-md border border-amber-700/40 shadow-[0_8px_28px_rgba(0,0,0,0.45)] overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              {summary.acting > 0 ? (
                <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
              ) : (
                <Hourglass className="w-4 h-4 text-amber-300" />
              )}
              <div className="leading-tight">
                <p className="text-sm font-normal text-amber-100">
                  {summary.acting > 0
                    ? `Settling ${summary.acting} batch order${summary.acting > 1 ? 's' : ''}…`
                    : `Waiting on ${summary.pending} batch order${summary.pending > 1 ? 's' : ''}`}
                </p>
                <p className="text-[11px] text-amber-300/60">
                  Tap to {expanded ? 'hide' : 'see'} details
                </p>
              </div>
            </div>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-amber-300/70" />
            ) : (
              <ChevronUp className="w-4 h-4 text-amber-300/70" />
            )}
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="rows"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-amber-700/20 divide-y divide-amber-700/10"
              >
                {tickets.map((t) => (
                  <TicketRow
                    key={t.ticket}
                    ticket={t}
                    onDismiss={() => removeTicket(t.ticket)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function statusLabel(t: PendingTicketWithStatus): string {
  if (!t.status) return 'Checking…';
  switch (t.status.kind) {
    case 'pending':
      return t.status.slotsRemaining > 0
        ? `Auction closes in ~${Math.ceil((t.status.slotsRemaining * 0.4) / 1)}s`
        : 'Auction window closing…';
    case 'awaiting-clear':
      return 'Closing batch…';
    case 'claimable':
      return 'Claiming tokens…';
    case 'claimed':
      return 'Done';
  }
}

function TicketRow({
  ticket,
  onDismiss,
}: {
  ticket: PendingTicketWithStatus;
  onDismiss: () => void;
}) {
  const submitted = useMemo(() => {
    const mins = Math.max(0, Math.floor((Date.now() - ticket.submittedAt) / 60_000));
    return mins === 0 ? 'just now' : `${mins} min ago`;
  }, [ticket.submittedAt]);

  return (
    <div className="px-4 py-3 text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <div className="leading-tight min-w-0">
          <p className="text-amber-100 truncate">{ticket.strategyName}</p>
          <p className="text-amber-300/50 text-[10px] font-mono truncate">
            {ticket.amountInUi} {truncatePubkey(ticket.inMint, 3, 3)} · {submitted}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-amber-200/90">{statusLabel(ticket)}</p>
          <a
            className="text-[10px] text-amber-400/60 hover:text-amber-300 inline-flex items-center gap-1"
            href={`https://solscan.io/account/${ticket.ticket}`}
            target="_blank"
            rel="noreferrer"
          >
            ticket
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      {ticket.status?.kind === 'pending' && ticket.status.slotsRemaining === 0 && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 text-[10px] text-amber-400/40 hover:text-amber-300 underline"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
