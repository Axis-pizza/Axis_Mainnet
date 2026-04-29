import type { Cluster } from '../../protocol/axis-vault';

export function ScopeNote({ cluster }: { cluster: Cluster }) {
  const isMainnet = cluster === 'mainnet';

  return (
    <section
      className={`rounded-xl border p-5 text-sm ${
        isMainnet
          ? 'border-rose-900/50 bg-rose-950/20 text-rose-100/90'
          : 'border-amber-900/40 bg-amber-950/20 text-amber-100/90'
      }`}
    >
      <h2 className="mb-2 text-base font-semibold text-amber-200">
        {isMainnet ? 'Mainnet — live programs + Jupiter routes' : 'Devnet research demo'}
      </h2>
      <p className="mb-3">
        {isMainnet
          ? 'These programs are un-audited. Mainnet mode uses live program IDs and Jupiter routes. Treat every signature as real fund movement.'
          : 'These programs are un-audited and run on devnet only. Do not deposit real funds.'}{' '}
        Mainnet v1 ships the two programs marked{' '}
        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[11px] uppercase text-indigo-300">
          MAINNET v1
        </span>{' '}
        below.
      </p>
    </section>
  );
}
