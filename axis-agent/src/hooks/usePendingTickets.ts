import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection, useWallet } from './useWallet';
import {
  PFDA_AMM3_PROGRAM_ID,
  checkTicketStatus,
  type PfmmTicketRecord,
  type TicketStatus,
} from '../protocol/axis-vault';

const STORAGE_KEY = 'axis:pfmm:pending-tickets:v1';
const POLL_INTERVAL_MS = 5000;

interface StoredTickets {
  /** keyed by ticket pubkey to dedupe re-submits in the same batch. */
  [ticket: string]: PfmmTicketRecord;
}

/// Read the persisted ticket map. Tolerates missing / corrupt JSON so a
/// bad write never bricks the banner.
function readStorage(): StoredTickets {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as StoredTickets;
    return {};
  } catch {
    return {};
  }
}

function writeStorage(tickets: StoredTickets): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  } catch {
    // localStorage full or disabled — non-fatal.
  }
}

export interface PendingTicketWithStatus extends PfmmTicketRecord {
  status: TicketStatus | null;
}

/// Tracks the current wallet's PFMM swap-request tickets across page reloads.
/// Polls the chain every 5s to advance status (pending → awaiting-clear →
/// claimable → claimed) so a banner can offer the right action.
export function usePendingTickets(): {
  tickets: PendingTicketWithStatus[];
  addTicket: (record: PfmmTicketRecord) => void;
  removeTicket: (ticket: string) => void;
  refresh: () => void;
} {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [tickets, setTickets] = useState<PendingTicketWithStatus[]>([]);
  const refreshRef = useRef<() => void>(() => {});

  const addTicket = useCallback((record: PfmmTicketRecord) => {
    const existing = readStorage();
    existing[record.ticket] = record;
    writeStorage(existing);
    queueMicrotask(() => refreshRef.current());
  }, []);

  const removeTicket = useCallback((ticket: string) => {
    const existing = readStorage();
    if (existing[ticket]) {
      delete existing[ticket];
      writeStorage(existing);
      queueMicrotask(() => refreshRef.current());
    }
  }, []);

  // Cross-tab sync: another tab may have added/removed a ticket. We listen
  // for storage events so this hook updates without a manual refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refreshRef.current();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const refresh = useCallback(async () => {
    const stored = readStorage();
    const ownerKey = publicKey?.toBase58();
    const records = Object.values(stored).filter(
      (r) => !ownerKey || r.user === ownerKey,
    );
    if (records.length === 0) {
      setTickets([]);
      return;
    }
    const next: PendingTicketWithStatus[] = await Promise.all(
      records.map(async (r) => {
        try {
          const status = await checkTicketStatus({
            conn: connection,
            programId: PFDA_AMM3_PROGRAM_ID,
            pool: new PublicKey(r.pool),
            user: new PublicKey(r.user),
            batchId: BigInt(r.batchId),
            ticket: new PublicKey(r.ticket),
          });
          return { ...r, status };
        } catch {
          return { ...r, status: null };
        }
      }),
    );
    setTickets(next);
    // GC: prune anything that's been claimed (ticket account closed). Keep
    // failures (status === null) so a transient RPC blip doesn't drop the
    // record.
    const cleaned: StoredTickets = {};
    for (const r of next) {
      if (r.status?.kind === 'claimed') continue;
      cleaned[r.ticket] = {
        pool: r.pool,
        strategyId: r.strategyId,
        strategyName: r.strategyName,
        batchId: r.batchId,
        ticket: r.ticket,
        windowEndSlot: r.windowEndSlot,
        user: r.user,
        outMint: r.outMint,
        outIdx: r.outIdx,
        inMint: r.inMint,
        amountInUi: r.amountInUi,
        submittedAt: r.submittedAt,
      };
    }
    writeStorage(cleaned);
  }, [connection, publicKey]);

  // Ref keeps add/removeTicket pointing at the latest refresh closure
  // without forcing them to depend on the unstable `refresh` identity.
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { tickets, addTicket, removeTicket, refresh };
}
