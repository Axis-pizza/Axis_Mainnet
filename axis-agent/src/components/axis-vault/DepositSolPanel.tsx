import { useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { useConnection, useWallet } from '../../hooks/useWallet';
import { useAxisVaultWallet } from '../../hooks/useAxisVaultWallet';
import {
  buildDepositSolPlanWithRetry,
  explorerAddr,
  explorerTx,
  fetchEtfState,
  preflightDepositSol,
  signDepositSolPlan,
  truncatePubkey,
  type ClusterConfig,
  type DepositSolPlan,
  type EtfStateData,
} from '../../protocol/axis-vault';

const ETF_DECIMALS = 6;

/// Standalone Deposit panel — invoke against an existing ETF state PDA.
/// Mirrors `WithdrawSolPanel` shape. Reuses the same Jupiter SOL-in plan
/// builder used inside `CreateEtfPanel`'s same-tx-as-create branch, but
/// passes `existingEtfTotalSupply` so the first-deposit floor only fires
/// when the ETF is genuinely empty.
export function DepositSolPanel({
  config,
  presetEtfState,
}: {
  config: ClusterConfig;
  presetEtfState?: string;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const wallet = useAxisVaultWallet();
  const axisVault = useMemo(
    () => config.programs.find((p) => p.name === 'axis-vault')!.address,
    [config]
  );

  const [etfStateAddr, setEtfStateAddr] = useState(presetEtfState ?? '');
  const [etf, setEtf] = useState<EtfStateData | null>(null);
  const [etfLoadErr, setEtfLoadErr] = useState<string | null>(null);
  const [userEtfBalance, setUserEtfBalance] = useState<bigint | null>(null);

  const [solSeedUi, setSolSeedUi] = useState<string>('0.05');
  const [slippageBps, setSlippageBps] = useState<number>(50);

  const [plan, setPlan] = useState<DepositSolPlan | null>(null);
  const [stage, setStage] = useState<'idle' | 'loading' | 'preview' | 'send' | 'ok' | 'err'>('idle');
  const [log, setLog] = useState<string[]>([]);

  function pushLog(line: string) {
    setLog((l) => [...l, line]);
  }

  async function loadEtfState() {
    setEtf(null);
    setEtfLoadErr(null);
    setUserEtfBalance(null);
    setPlan(null);
    if (!etfStateAddr) return;
    try {
      const pubkey = new PublicKey(etfStateAddr);
      setStage('loading');
      const data = await fetchEtfState(connection, pubkey);
      setEtf(data);
      setStage('idle');
      if (publicKey) {
        const userAta = getAssociatedTokenAddressSync(data.etfMint, publicKey, false);
        try {
          const bal = await connection.getTokenAccountBalance(userAta, 'confirmed');
          setUserEtfBalance(BigInt(bal.value.amount));
        } catch {
          setUserEtfBalance(0n);
        }
      }
    } catch (e) {
      setEtfLoadErr(e instanceof Error ? e.message : String(e));
      setStage('err');
    }
  }

  useEffect(() => {
    if (!etfStateAddr) return;
    if (etfStateAddr.length < 32 || etfStateAddr.length > 44) return;
    void loadEtfState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etfStateAddr, publicKey?.toBase58()]);

  const solSeedLamports = useMemo(() => {
    const n = Number(solSeedUi);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.floor(n * 1_000_000_000));
  }, [solSeedUi]);

  const canPreview =
    !!publicKey &&
    !!etf &&
    !etf.paused &&
    solSeedLamports > 0n &&
    stage !== 'loading' &&
    stage !== 'preview' &&
    stage !== 'send';

  async function previewPlan() {
    if (!publicKey || !etf) return;
    const pre = preflightDepositSol({
      basketSize: etf.tokenMints.length,
      weights: etf.weightsBps,
      solIn: solSeedLamports,
    });
    if (!pre.ok) {
      setStage('err');
      setLog([]);
      pushLog('✗ preflight failed:');
      for (const e of pre.errors) pushLog(`  · ${e}`);
      return;
    }
    setStage('preview');
    setLog([]);
    setPlan(null);
    for (const w of pre.warnings) pushLog(`⚠ ${w}`);
    try {
      const treasuryEtfAta = getAssociatedTokenAddressSync(etf.etfMint, etf.treasury, true);
      const built = await buildDepositSolPlanWithRetry(
        {
          conn: connection,
          user: publicKey,
          programId: axisVault,
          etfName: etf.name,
          etfState: new PublicKey(etfStateAddr),
          etfMint: etf.etfMint,
          treasury: etf.treasury,
          treasuryEtfAta,
          basketMints: etf.tokenMints,
          weights: etf.weightsBps,
          vaults: etf.tokenVaults,
          solIn: solSeedLamports,
          minEtfOut: 0n,
          slippageBps,
          existingEtfTotalSupply: etf.totalSupply,
        },
        undefined,
        ({ previousMaxAccounts, nextMaxAccounts }) =>
          pushLog(
            `↻ tx blew 1232 b at maxAccounts=${previousMaxAccounts}; retrying at ${nextMaxAccounts}…`
          )
      );
      const next = built.plan;
      setPlan(next);
      pushLog(
        `preview: deposit floor ${next.depositAmount.toString()} base; mode=${next.mode}; tx ${next.txBytes}/1232 b · ix=${next.ixCount} · CU ${next.computeUnitLimit} @ ${next.computeUnitPrice} μL/CU · maxAccounts=${built.chosen.maxAccounts}`
      );
      const seed = next.seedPreview;
      pushLog(
        `bottleneck leg: ${truncatePubkey(seed.legs[seed.bottleneckIndex].mint.toBase58(), 6, 6)}`
      );
      for (const leg of seed.legs) {
        pushLog(
          `  ${truncatePubkey(leg.mint.toBase58(), 4, 4)}: ${(Number(leg.solLamports) / 1e9).toFixed(6)} SOL → expect ${leg.expectedOut.toString()} (min ${leg.minOut.toString()}) · ${leg.routeLabel}`
        );
      }
      if (next.mode === 'split') {
        pushLog('split mode: tx0 = swaps; tx1 = axis Deposit. Wallet signs twice in sequence.');
      }
      setStage('idle');
    } catch (e) {
      setStage('err');
      pushLog(`✗ preview: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function runPlan() {
    if (!publicKey || !plan || !wallet) return;
    setStage('send');
    try {
      if (plan.mode === 'split') {
        pushLog('split: signing tx0 (swaps) then tx1 (deposit)…');
      }
      await signDepositSolPlan(connection, wallet, plan, {
        onStepDone: (step, sig) => {
          const label = step === 'single' ? 'deposit_sol' : step === 'swap' ? 'swaps' : 'deposit';
          pushLog(`✓ ${label}: ${sig.slice(0, 12)}…`);
          pushLog(`See: ${explorerTx(sig, config.explorerCluster)}`);
        },
      });
      setStage('ok');
      try {
        if (etf && publicKey) {
          const userAta = getAssociatedTokenAddressSync(etf.etfMint, publicKey, false);
          const bal = await connection.getTokenAccountBalance(userAta, 'confirmed');
          setUserEtfBalance(BigInt(bal.value.amount));
        }
      } catch {
        /* ignore */
      }
      setPlan(null);
    } catch (e) {
      setStage('err');
      pushLog(`✗ deposit_sol: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const isFirstDeposit = etf !== null && etf.totalSupply === 0n;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Deposit → ETF (axis-vault + Jupiter)</h2>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
          {truncatePubkey(axisVault.toBase58(), 6, 6)}
        </span>
      </header>

      {!publicKey ? (
        <p className="text-sm text-slate-400">Connect a wallet first.</p>
      ) : !config.jupiterEnabled ? (
        <p className="text-sm text-amber-300">
          Jupiter is disabled on {config.label}. Switch to Mainnet + Jupiter to use this flow.
        </p>
      ) : (
        <div className="space-y-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">ETF state PDA (paste from Explorer or Create flow)</span>
            <input
              value={etfStateAddr}
              onChange={(e) => setEtfStateAddr(e.target.value.trim())}
              placeholder="EtfState PDA address (base58)"
              className="rounded bg-slate-800 px-2 py-1 font-mono text-slate-100"
            />
          </label>

          {etfLoadErr && <p className="break-all text-rose-400">✗ {etfLoadErr}</p>}

          {etf && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Metric label="ticker / name" value={`${etf.ticker} · ${etf.name}`} />
                <Metric label="basket size" value={`${etf.tokenCount}`} />
                <Metric
                  label="total supply"
                  value={`${(Number(etf.totalSupply) / 10 ** ETF_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: ETF_DECIMALS })}`}
                />
                <Metric label="fee (bps)" value={`${etf.feeBps}`} />
                <Metric label="status" value={etf.paused ? 'PAUSED' : 'active'} />
                <Metric label="treasury" value={truncatePubkey(etf.treasury.toBase58(), 4, 4)} />
              </div>
              <ul className="mt-3 space-y-1">
                {etf.tokenMints.map((m, i) => (
                  <li key={m.toBase58()} className="flex items-center gap-2">
                    <span className="font-mono text-slate-300">
                      {truncatePubkey(m.toBase58(), 6, 6)}
                    </span>
                    <span className="text-slate-500">{(etf.weightsBps[i] / 100).toFixed(1)}%</span>
                    <a
                      href={explorerAddr(etf.tokenVaults[i].toBase58(), config.explorerCluster)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-slate-500 underline hover:text-slate-300"
                    >
                      vault
                    </a>
                  </li>
                ))}
              </ul>
              {userEtfBalance !== null && (
                <p className="mt-2 text-slate-400">
                  Your ETF balance:{' '}
                  <span className="font-mono text-slate-200">
                    {(Number(userEtfBalance) / 10 ** ETF_DECIMALS).toLocaleString(undefined, {
                      maximumFractionDigits: ETF_DECIMALS,
                    })}
                  </span>
                </p>
              )}
              {isFirstDeposit && (
                <p className="mt-2 rounded bg-amber-950/30 px-2 py-1 text-amber-300">
                  ⚠ ETF empty — first deposit must yield ≥ 1.0 ETF (1_000_000 base units). Plan
                  builder rejects smaller seeds before signing.
                </p>
              )}
            </div>
          )}

          {etf && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">SOL spend</span>
                <input
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={solSeedUi}
                  onChange={(e) => setSolSeedUi(e.target.value)}
                  className="rounded bg-slate-800 px-2 py-1 font-mono text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Jupiter slippage (bps)</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(Number(e.target.value))}
                  className="rounded bg-slate-800 px-2 py-1 font-mono text-slate-100"
                />
              </label>
            </div>
          )}

          {etf?.paused && (
            <p className="text-amber-400">⚠ ETF is paused — deposit is disabled.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={previewPlan}
              disabled={!canPreview}
              className="rounded-lg border border-sky-700 px-3 py-1.5 font-medium text-sky-200 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stage === 'preview' ? 'previewing…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={runPlan}
              disabled={!plan || stage === 'send' || !wallet}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stage === 'send' ? 'sending…' : 'Run deposit'}
            </button>
            {plan && (
              <span className="text-slate-400">
                deposit floor{' '}
                <span className="font-mono text-emerald-300">
                  {plan.depositAmount.toString()} base
                </span>{' '}
                · mode <span className="font-mono text-amber-300">{plan.mode}</span>
              </span>
            )}
          </div>

          {log.length > 0 && (
            <pre className="max-h-64 overflow-auto rounded bg-slate-950/80 p-3 text-[11px] text-slate-300">
              {log.join('\n')}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-mono text-slate-200">{value}</p>
    </div>
  );
}
