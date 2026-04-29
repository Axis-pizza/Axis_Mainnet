import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import { useConnection, useWallet } from '../../hooks/useWallet';
import { useAxisVaultWallet } from '../../hooks/useAxisVaultWallet';
import {
  buildBareMintAccountIxs,
  buildBareTokenAccountIxs,
  buildDepositSolPlan,
  explorerTx,
  findEtfState,
  ixCreateEtf,
  ixDeposit,
  sendTx,
  sendVersionedTx,
  truncatePubkey,
  type ClusterConfig,
} from '../../protocol/axis-vault';
import { JupiterSeedPreviewCard } from './JupiterSeedPreviewCard';

interface BasketRow {
  mint: string;
  weight: number;
}

export function CreateEtfPanel({
  selectedMints,
  onClearSelection,
  config,
  onCreated,
}: {
  selectedMints: string[];
  onClearSelection: () => void;
  config: ClusterConfig;
  onCreated?: (etfStatePda: string, etfMint: string, name: string) => void;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const wallet = useAxisVaultWallet();

  const [name, setName] = useState(
    () => `AX${Date.now().toString(36).toUpperCase().slice(-6)}`
  );
  const [ticker, setTicker] = useState(
    () => `AX${Date.now().toString(36).toUpperCase().slice(-3)}`
  );
  const [rows, setRows] = useState<BasketRow[]>([]);
  const [depositBase, setDepositBase] = useState<number>(1_000_000_000);
  const [solSeed, setSolSeed] = useState<number>(0.02);
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [doDepositAfter, setDoDepositAfter] = useState(true);
  const [stage, setStage] = useState<'idle' | 'alloc' | 'create' | 'deposit' | 'ok' | 'err'>('idle');
  const [log, setLog] = useState<string[]>([]);

  const selKey = selectedMints.join(',');
  const axisVault = config.programs.find((p) => p.name === 'axis-vault')!.address;

  useEffect(() => {
    if (selectedMints.length === 0) {
      setRows([]);
      return;
    }
    const merged = selectedMints.map((m) => ({ mint: m, weight: 0 }));
    const base = Math.floor(10_000 / merged.length);
    const remainder = 10_000 - base * merged.length;
    setRows(
      merged.map((r, i) => ({
        ...r,
        weight: base + (i === merged.length - 1 ? remainder : 0),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  const sumWeights = rows.reduce((s, r) => s + r.weight, 0);
  const weightsOk = rows.length >= 2 && rows.length <= 5 && sumWeights === 10_000;

  function pushLog(line: string) {
    setLog((l) => [...l, line]);
  }

  function setRowWeight(i: number, w: number) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, weight: w } : r)));
  }

  async function run() {
    if (!publicKey || !wallet) return;
    if (!weightsOk) return;
    setStage('alloc');
    setLog([]);
    pushLog(
      `Building basket with ${rows.length} mints, weights=${rows.map((r) => r.weight).join('/')}`
    );

    try {
      const basketMints = rows.map((r) => new PublicKey(r.mint));
      const treasury = config.protocolTreasury;
      const [etfState] = findEtfState(axisVault, publicKey, name);
      pushLog(`ETF state PDA: ${etfState.toBase58()}`);
      pushLog(`Treasury: ${treasury.toBase58()}`);

      const etfMint = await buildBareMintAccountIxs(connection, publicKey);
      const vaults = await buildBareTokenAccountIxs(
        connection,
        publicKey,
        basketMints.length
      );
      setStage('create');
      const createIx = ixCreateEtf({
        programId: axisVault,
        payer: publicKey,
        etfState,
        etfMint: etfMint.pubkey,
        treasury,
        basketMints,
        vaults: vaults.pubkeys,
        weightsBps: rows.map((r) => r.weight),
        ticker,
        name,
      });
      pushLog(`Tx1: alloc ETF mint + ${basketMints.length} vaults + CreateEtf "${name}"`);
      const sig2 = await sendTx(
        connection,
        wallet,
        [...etfMint.ixs, ...vaults.ixs, createIx],
        [etfMint.signer, ...vaults.signers]
      );
      pushLog(`✓ create_etf: ${sig2.slice(0, 12)}…`);
      pushLog(`ETF mint: ${etfMint.pubkey.toBase58()}`);
      pushLog(`See: ${explorerTx(sig2, config.explorerCluster)}`);
      onCreated?.(etfState.toBase58(), etfMint.pubkey.toBase58(), name);
      const fresh = Date.now().toString(36).toUpperCase();
      setName(`AX${fresh.slice(-6)}`);
      setTicker(`AX${fresh.slice(-3)}`);

      if (doDepositAfter && (config.jupiterEnabled ? solSeed > 0 : depositBase > 0)) {
        setStage('deposit');
        const userEtfAta = getAssociatedTokenAddressSync(etfMint.pubkey, publicKey);
        const treasuryEtfAta = getAssociatedTokenAddressSync(etfMint.pubkey, treasury, true);
        if (config.jupiterEnabled) {
          const plan = await buildDepositSolPlan({
            conn: connection,
            user: publicKey,
            programId: axisVault,
            etfName: name,
            etfState,
            etfMint: etfMint.pubkey,
            treasury,
            treasuryEtfAta,
            basketMints,
            weights: rows.map((r) => r.weight),
            vaults: vaults.pubkeys,
            solIn: BigInt(Math.floor(solSeed * 1_000_000_000)),
            minEtfOut: 0n,
            slippageBps,
          });
          pushLog(
            `Tx2: Jupiter SOL-in seed (${solSeed} SOL) + Deposit; mode=${plan.mode}; ix=${plan.ixCount}; tx=${plan.txBytes}b`
          );
          const bottleneck = plan.seedPreview.legs[plan.seedPreview.bottleneckIndex];
          pushLog(
            `Jupiter floor: ${plan.depositAmount.toString()} base; bottleneck=${truncatePubkey(
              bottleneck.mint.toBase58(),
              6,
              6
            )}`
          );
          pushLog(
            `Expected out: ${plan.seedPreview.legs
              .map((leg) => `${truncatePubkey(leg.mint.toBase58(), 4, 4)}=${leg.expectedOut}`)
              .join(' / ')}`
          );
          if (plan.mode === 'single') {
            const sig3 = await sendVersionedTx(connection, wallet, plan.versionedTx);
            pushLog(`✓ jupiter_seed_deposit: ${sig3.slice(0, 12)}…`);
            pushLog(`See: ${explorerTx(sig3, config.explorerCluster)}`);
          } else {
            pushLog('split: signing tx0 (swaps) then tx1 (deposit)…');
            const sig3a = await sendVersionedTx(connection, wallet, plan.versionedTx);
            pushLog(`✓ swaps: ${sig3a.slice(0, 12)}…`);
            pushLog(`See: ${explorerTx(sig3a, config.explorerCluster)}`);
            if (!plan.depositTx) throw new Error('split plan missing depositTx — internal bug');
            const sig3b = await sendVersionedTx(connection, wallet, plan.depositTx);
            pushLog(`✓ deposit: ${sig3b.slice(0, 12)}…`);
            pushLog(`See: ${explorerTx(sig3b, config.explorerCluster)}`);
          }
        } else {
          const userBasketAtas = basketMints.map((m) =>
            getAssociatedTokenAddressSync(m, publicKey)
          );
          const ataIxs = [
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              userEtfAta,
              publicKey,
              etfMint.pubkey
            ),
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              treasuryEtfAta,
              treasury,
              etfMint.pubkey
            ),
          ];
          const depositIx = ixDeposit({
            programId: axisVault,
            payer: publicKey,
            etfState,
            etfMint: etfMint.pubkey,
            userEtfAta,
            treasuryEtfAta,
            userBasketAccounts: userBasketAtas,
            vaults: vaults.pubkeys,
            amount: BigInt(depositBase),
            minMintOut: 0n,
            name,
          });
          pushLog(`Tx2: create ETF ATAs + Deposit(${depositBase} base)`);
          const sig3 = await sendTx(connection, wallet, [...ataIxs, depositIx]);
          pushLog(`✓ deposit: ${sig3.slice(0, 12)}…`);
          pushLog(`See: ${explorerTx(sig3, config.explorerCluster)}`);
        }
      }

      setStage('ok');
      pushLog('DONE — clearing selection');
      onClearSelection();
    } catch (e) {
      setStage('err');
      pushLog(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const enabled =
    !!publicKey &&
    !!wallet &&
    weightsOk &&
    name.length >= 1 &&
    ticker.length >= 2 &&
    ticker.length <= 16 &&
    /^[A-Z0-9]+$/.test(ticker) &&
    stage !== 'alloc' &&
    stage !== 'create' &&
    stage !== 'deposit';

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Create ETF (axis-vault)</h2>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
          {truncatePubkey(axisVault.toBase58(), 6, 6)}
        </span>
      </header>

      {!publicKey ? (
        <p className="text-sm text-slate-400">Connect a wallet first.</p>
      ) : rows.length < 2 ? (
        <p className="text-sm text-slate-400">
          Pick 2–5 tokens from the Tokens panel to build a basket.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col">
              <span className="mb-1 text-slate-400">Name (≤32 bytes)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded bg-slate-800 px-2 py-1 font-mono text-slate-100"
              />
            </label>
            <label className="flex flex-col">
              <span className="mb-1 text-slate-400">Ticker (A-Z 0-9, 2..16)</span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="rounded bg-slate-800 px-2 py-1 font-mono text-slate-100"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-xs text-slate-400">
              Weights (bps, must sum to 10000) — current sum:{' '}
              <span className={sumWeights === 10000 ? 'text-emerald-400' : 'text-rose-400'}>
                {sumWeights}
              </span>
            </p>
            <ul className="space-y-1 text-xs">
              {rows.map((r, i) => (
                <li key={r.mint} className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-slate-300">
                    {truncatePubkey(r.mint, 6, 6)}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={r.weight}
                    onChange={(e) => setRowWeight(i, Number(e.target.value))}
                    className="w-24 rounded bg-slate-800 px-2 py-1 text-right font-mono text-slate-100"
                  />
                  <span className="w-10 text-right text-slate-500">
                    {(r.weight / 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={doDepositAfter}
                  onChange={(e) => setDoDepositAfter(e.target.checked)}
                />
                <span className="text-slate-300">also Deposit after create</span>
              </label>
              {doDepositAfter && config.jupiterEnabled ? (
                <>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">SOL seed via Jupiter:</span>
                    <input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={solSeed}
                      onChange={(e) => setSolSeed(Number(e.target.value))}
                      className="w-28 rounded bg-slate-800 px-2 py-1 font-mono text-slate-100"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">Jup slippage bps:</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={slippageBps}
                      onChange={(e) => setSlippageBps(Number(e.target.value))}
                      className="w-20 rounded bg-slate-800 px-2 py-1 font-mono text-slate-100"
                    />
                  </label>
                  <span className="text-[11px] text-slate-500">
                    First deposit must yield ≥ 1.0 ETF (1_000_000 base units); plan-builder rejects
                    smaller seeds before sending.
                  </span>
                </>
              ) : (
                doDepositAfter && (
                  <label className="flex items-center gap-1">
                    <span className="text-slate-400">
                      base amount (≥ 1_000_000; per-leg = amount × weight ÷ 10000):
                    </span>
                    <input
                      type="number"
                      min={1_000_000}
                      step={1_000_000}
                      value={depositBase}
                      onChange={(e) => setDepositBase(Number(e.target.value))}
                      className="w-40 rounded bg-slate-800 px-2 py-1 font-mono text-slate-100"
                    />
                  </label>
                )
              )}
              {doDepositAfter && !config.jupiterEnabled && depositBase < 1_000_000 && (
                <span className="text-xs text-rose-400">
                  ✗ amount &lt; MIN_FIRST_DEPOSIT (1_000_000) — first Deposit will revert
                </span>
              )}
            </div>

            {doDepositAfter && config.jupiterEnabled && (
              <JupiterSeedPreviewCard
                basket={rows}
                weightsOk={weightsOk}
                solSeed={solSeed}
                slippageBps={slippageBps}
              />
            )}
          </div>

          <button
            onClick={run}
            disabled={!enabled}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage === 'alloc'
              ? 'alloc tx…'
              : stage === 'create'
                ? 'create_etf tx…'
                : stage === 'deposit'
                  ? 'deposit tx…'
                  : 'Run flow'}
          </button>

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
