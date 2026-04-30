import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '../../hooks/useWallet';
import {
  fetchWalletTokens,
  getClusterConfig,
  truncatePubkey,
  type ClusterConfig,
} from '../../protocol/axis-vault';
import { ScopeNote } from './ScopeNote';
import { TokensPanel } from './TokensPanel';
import { PfmmPanel } from './PfmmPanel';

/// PFMM-only entry point. Stripped-down version of AxisVaultView that
/// drops the Overview / Create ETF / Deposit / Withdraw tabs because
/// the only flow surfaced in the main nav is the pfda-amm-3 batch
/// auction — Init → AddLiquidity → SwapRequest → ClearBatch → Claim,
/// plus the Jupiter SOL-seed helpers that fund those flows.
export function PfmmShell() {
  const config = getClusterConfig('mainnet');

  return <Shell config={config} />;
}

function Shell({ config }: { config: ClusterConfig }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [selectedMints, setSelectedMints] = useState<string[]>([]);
  const toggleMint = useCallback((mint: string) => {
    setSelectedMints((cur) =>
      cur.includes(mint) ? cur.filter((m) => m !== mint) : [...cur, mint]
    );
  }, []);

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
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              PFMM <span className="text-slate-400">— pfda-amm-3 batch auction</span>
            </h1>
            <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-xs uppercase tracking-wider text-slate-400">
              {config.label}
            </span>
          </div>
          <p className="text-sm text-slate-400">
            3-token batch-auction AMM. Pick exactly 3 mints (order matters — pool PDA
            is keyed by mint0/mint1/mint2 in selection order). Wallet:{' '}
            {publicKey ? (
              <span className="font-mono text-slate-300">
                {truncatePubkey(publicKey.toBase58(), 6, 6)}
              </span>
            ) : (
              <span className="text-slate-500">not connected</span>
            )}
          </p>
        </header>

        <ScopeNote cluster={config.cluster} />

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
    </main>
  );
}
