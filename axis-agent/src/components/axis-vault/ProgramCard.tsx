import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '../../hooks/useWallet';
import { type ProgramRef, formatBytes, truncatePubkey } from '../../protocol/axis-vault';

interface ChainState {
  status: 'loading' | 'live' | 'missing' | 'error';
  authority?: string;
  dataLength?: number;
  err?: string;
}

export function ProgramCard({
  program,
  explorerCluster,
}: {
  program: ProgramRef;
  explorerCluster: 'devnet' | '';
}) {
  const { connection } = useConnection();
  const [state, setState] = useState<ChainState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const acc = await connection.getAccountInfo(program.address);
        if (cancelled) return;
        if (!acc) {
          setState({ status: 'missing' });
          return;
        }
        // BPFLoaderUpgradeable program: account.data is 36 bytes —
        // 4-byte enum tag (Program=2) + 32-byte ProgramData address.
        const programDataPk = new PublicKey(acc.data.subarray(4, 36));
        const pdAcc = await connection.getAccountInfo(programDataPk);
        if (cancelled) return;
        if (!pdAcc) {
          setState({
            status: 'live',
            dataLength: acc.data.length,
            authority: '(non-upgradeable or pre-init)',
          });
          return;
        }
        const optionTag = pdAcc.data[12];
        const authority =
          optionTag === 1
            ? new PublicKey(pdAcc.data.subarray(13, 45)).toBase58()
            : '(immutable)';
        const codeLen = pdAcc.data.length - 45;
        setState({
          status: 'live',
          authority,
          dataLength: Math.max(codeLen, 0),
        });
      } catch (e) {
        if (cancelled) return;
        setState({ status: 'error', err: e instanceof Error ? e.message : String(e) });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [connection, program.address]);

  const scopeBadge = scopeBadgeFor(program.scope);

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 shadow-sm">
      <header className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-mono text-base font-semibold text-slate-100">{program.name}</h3>
          <p className="text-xs text-slate-400">{program.role}</p>
        </div>
        <span className={scopeBadge.className}>{scopeBadge.label}</span>
      </header>

      <dl className="space-y-2 text-xs">
        <Row label="Program ID">
          <span className="font-mono text-slate-200">
            {truncatePubkey(program.address.toBase58(), 8, 8)}
          </span>
        </Row>
        <Row label="Status">
          <StatusPill state={state} />
        </Row>
        {state.authority && (
          <Row label="Upgrade authority">
            <span className="font-mono text-slate-200">{truncatePubkey(state.authority, 6, 6)}</span>
          </Row>
        )}
        {state.dataLength !== undefined && (
          <Row label="Code size">
            <span className="text-slate-200">{formatBytes(state.dataLength)}</span>
          </Row>
        )}
        {state.err && (
          <Row label="Error">
            <span className="text-rose-400">{state.err}</span>
          </Row>
        )}
      </dl>

      <a
        href={`https://explorer.solana.com/address/${program.address.toBase58()}${explorerCluster ? `?cluster=${explorerCluster}` : ''}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block text-xs text-indigo-400 hover:text-indigo-300"
      >
        View on Solana Explorer →
      </a>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function StatusPill({ state }: { state: ChainState }) {
  const map = {
    loading: { txt: 'loading…', c: 'text-slate-400' },
    live: { txt: 'live', c: 'text-emerald-400' },
    missing: { txt: 'not deployed', c: 'text-rose-400' },
    error: { txt: 'error', c: 'text-amber-400' },
  };
  const { txt, c } = map[state.status];
  return <span className={c}>{txt}</span>;
}

function scopeBadgeFor(scope: ProgramRef['scope']) {
  switch (scope) {
    case 'mainnet-v1':
      return {
        label: 'MAINNET v1',
        className:
          'rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300',
      };
    case 'research':
      return {
        label: 'RESEARCH',
        className:
          'rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300',
      };
    case 'legacy':
      return {
        label: 'LEGACY',
        className:
          'rounded-md bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300',
      };
  }
}
