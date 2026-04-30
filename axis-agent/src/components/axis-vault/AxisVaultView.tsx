import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '../../hooks/useWallet';
import {
  fetchWalletTokens,
  getClusterConfig,
  truncatePubkey,
  type Cluster,
  type ClusterConfig,
} from '../../protocol/axis-vault';
import { ScopeNote } from './ScopeNote';
import { ProgramCard } from './ProgramCard';
import { TokensPanel } from './TokensPanel';
import { CreateEtfPanel } from './CreateEtfPanel';
import { DepositSolPanel } from './DepositSolPanel';
import { WithdrawSolPanel } from './WithdrawSolPanel';
import { PfmmPanel } from './PfmmPanel';

type Tab = 'overview' | 'tokens' | 'etf' | 'deposit' | 'withdraw' | 'pfmm';

/// Standalone shell that renders the axis-vault + Jupiter mainnet flows.
/// Designed to drop into either a dedicated route or a `view === 'VAULT'`
/// branch in the existing Home SPA. Connection comes from axis-agent's
/// Privy-backed `useConnection` (mainnet by default via `VITE_RPC_URL`).
export function AxisVaultView() {
  const [cluster, setCluster] = useState<Cluster>('mainnet');
  const config = getClusterConfig(cluster);

  return <Shell config={config} onClusterChange={setCluster} />;
}

function Shell({
  config,
  onClusterChange,
}: {
  config: ClusterConfig;
  onClusterChange: (c: Cluster) => void;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<Tab>('overview');
  const [lastEtfState, setLastEtfState] = useState<string | undefined>(undefined);

  const [selectedMints, setSelectedMints] = useState<string[]>([]);
  const toggleMint = useCallback((mint: string) => {
    setSelectedMints((cur) =>
      cur.includes(mint) ? cur.filter((m) => m !== mint) : [...cur, mint]
    );
  }, []);
  const clearSelection = useCallback(() => setSelectedMints([]), []);

  const [walletDecimals, setWalletDecimals] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    void fetchWalletTokens(connection, publicKey).then((tokens) => {
      if (cancelled) return;
      const map: Record<string, number> = {};
      for (const t of tokens) map[t.mint.toBase58()] = t.decimals;
      setWalletDecimals(map);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, publicKey?.toBase58(), selectedMints.join(',')]);

  return (
    <main className="relative z-10 min-h-screen px-6 py-12 text-slate-200">
      <div className="mx-auto max-w-5xl space-y-6">
        <Header config={config} publicKey={publicKey?.toBase58()} />
        <ClusterSwitch config={config} onChange={onClusterChange} />
        <ScopeNote cluster={config.cluster} />

        <Tabs current={tab} onChange={setTab} basketSize={selectedMints.length} />

        {tab === 'overview' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Deployed programs</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {config.programs.map((p) => (
                <ProgramCard
                  key={p.address.toBase58()}
                  program={p}
                  explorerCluster={config.explorerCluster}
                />
              ))}
            </div>
            {lastEtfState && (
              <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-4 text-xs text-emerald-200">
                <p className="font-semibold">Last created ETF</p>
                <p className="mt-1 break-all font-mono">EtfState: {lastEtfState}</p>
                <p className="mt-1 text-emerald-300/70">
                  Switch to Withdraw → SOL tab to redeem against this ETF.
                </p>
              </div>
            )}
          </section>
        )}

        {tab === 'tokens' && (
          <TokensPanel
            onSelect={toggleMint}
            selectedMints={selectedMints}
            cluster={config.cluster}
            explorerCluster={config.explorerCluster}
          />
        )}

        {tab === 'etf' && (
          <div className="space-y-6">
            <TokensPanel
              onSelect={toggleMint}
              selectedMints={selectedMints}
              cluster={config.cluster}
              explorerCluster={config.explorerCluster}
            />
            <CreateEtfPanel
              selectedMints={selectedMints}
              onClearSelection={clearSelection}
              config={config}
              onCreated={(etfState) => setLastEtfState(etfState)}
            />
          </div>
        )}

        {tab === 'deposit' && (
          <DepositSolPanel config={config} presetEtfState={lastEtfState} />
        )}

        {tab === 'withdraw' && (
          <WithdrawSolPanel config={config} presetEtfState={lastEtfState} />
        )}

        {tab === 'pfmm' && (
          <div className="space-y-6">
            <TokensPanel
              onSelect={toggleMint}
              selectedMints={selectedMints}
              cluster={config.cluster}
              explorerCluster={config.explorerCluster}
            />
            <PfmmPanel
              selectedMints={selectedMints}
              walletDecimals={walletDecimals}
              config={config}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function Header({ config, publicKey }: { config: ClusterConfig; publicKey?: string }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">
          Axis Vault <span className="text-slate-400">— mainnet flows</span>
        </h1>
        <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-xs uppercase tracking-wider text-slate-400">
          {config.label}
        </span>
      </div>
      <p className="text-sm text-slate-400">
        Live state of the axis-vault + pfda-amm-3 deploys. Wallet:{' '}
        {publicKey ? (
          <span className="font-mono text-slate-300">{truncatePubkey(publicKey, 6, 6)}</span>
        ) : (
          <span className="text-slate-500">not connected</span>
        )}
      </p>
    </header>
  );
}

function ClusterSwitch({
  config,
  onChange,
}: {
  config: ClusterConfig;
  onChange: (c: Cluster) => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500">RPC endpoint</p>
        <p className="break-all font-mono text-slate-200">{config.rpcUrl}</p>
      </div>
      <div className="flex rounded-lg border border-slate-700 bg-slate-950/70 p-1">
        {(['mainnet', 'devnet'] as const).map((c) => {
          const active = config.cluster === c;
          return (
            <button
              key={c}
              onClick={() => onChange(c)}
              className={
                'rounded-md px-3 py-1.5 text-xs font-semibold transition ' +
                (active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800')
              }
            >
              {c === 'mainnet' ? 'Mainnet + Jupiter' : 'Devnet'}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Tabs({
  current,
  onChange,
  basketSize,
}: {
  current: Tab;
  onChange: (t: Tab) => void;
  basketSize: number;
}) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'tokens', label: 'Tokens' },
    { id: 'etf', label: 'Create ETF' },
    { id: 'deposit', label: 'Deposit → ETF' },
    { id: 'withdraw', label: 'Withdraw → SOL' },
    { id: 'pfmm', label: 'PFMM' },
  ];
  return (
    <nav className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-1">
      {tabs.map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={
              'rounded-md px-3 py-1.5 text-xs font-medium transition ' +
              (active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800')
            }
          >
            {t.label}
          </button>
        );
      })}
      {basketSize > 0 && (
        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
          {basketSize} mint{basketSize === 1 ? '' : 's'} picked
        </span>
      )}
    </nav>
  );
}
