import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  ShieldCheck,
  Wallet,
  Loader2,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import { useConnection, useWallet } from '../../hooks/useWallet';
import { useAxisVaultWallet } from '../../hooks/useAxisVaultWallet';
import { useToast } from '../../context/ToastContext';
import { api, clearStrategyCache } from '../../services/api';
import {
  AXIS_VAULT_PROGRAM_ID,
  buildBareMintAccountIxs,
  buildBareTokenAccountIxs,
  buildDepositSolPlan,
  buildJupiterSolSeedPlan,
  explorerAddr,
  explorerTx,
  fetchEtfState,
  fetchPoolState3,
  findEtfState,
  findHistory3,
  findPool3,
  findQueue3,
  findTicket3,
  getClusterConfig,
  ixAddLiquidity3,
  ixClaim3,
  ixClearBatch3,
  ixCreateEtf,
  ixInitPool3,
  ixSwapRequest3,
  MAINNET_PROTOCOL_TREASURY,
  MIN_FIRST_DEPOSIT_BASE,
  sendTx,
  sendVersionedTx,
  truncatePubkey,
  type PoolState3Data,
} from '../../protocol/axis-vault';

interface PfmmDeploymentBlueprintProps {
  strategyName: string;
  strategyType: string;
  tokens: { symbol: string; weight: number; logoURI?: string; address?: string; mint?: string }[];
  description: string;
  info?: {
    symbol: string;
    imagePreview?: string;
  };
  initialTvl?: number;

  onBack: () => void;
  onComplete: () => void;
  onDeploySuccess?: (address: string, amount: number, asset: 'SOL' | 'USDC') => void;
}

// PFMM micro-weights sum to 1_000_000. Convert each token's percentage weight
// (sum 100) into micro-units, pinning rounding drift to the last leg so the
// final array still sums exactly.
function percentToMicroWeights(percentWeights: number[]): [number, number, number] {
  if (percentWeights.length !== 3) {
    throw new Error(`expected 3 weights, got ${percentWeights.length}`);
  }
  const total = 1_000_000;
  const partial = percentWeights.slice(0, -1).map((w) => Math.floor((w / 100) * total));
  const last = total - partial.reduce((a, b) => a + b, 0);
  return [partial[0], partial[1], last] as [number, number, number];
}

// Same conversion but in bps (sum 10_000). Used for Jupiter seed legs.
function percentToBpsWeights(percentWeights: number[]): number[] {
  const partial = percentWeights.slice(0, -1).map((w) => Math.floor(w * 100));
  const last = 10_000 - partial.reduce((a, b) => a + b, 0);
  return [...partial, last];
}

type Stage =
  | 'idle'
  | 'createEtf'
  | 'firstDeposit'
  | 'init'
  | 'seed'
  | 'addLiq'
  | 'etf-deposit'
  | 'swap'
  | 'clear'
  | 'claim'
  | 'metadata'
  | 'done'
  | 'err';

export const PfmmDeploymentBlueprint = ({
  strategyName = 'Untitled Strategy',
  strategyType = 'BALANCED',
  tokens = [],
  description = '',
  info = { symbol: 'TEMP' },
  onBack,
  onComplete,
  onDeploySuccess,
}: PfmmDeploymentBlueprintProps) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const axisWallet = useAxisVaultWallet();
  const { showToast } = useToast();

  const config = useMemo(() => getClusterConfig('mainnet'), []);
  const pfmmProgramId = useMemo(
    () => config.programs.find((p) => p.name === 'pfda-amm-3')!.address,
    [config]
  );

  const safeSymbol = info?.symbol || 'ETF';
  const safeTokens = Array.isArray(tokens) ? tokens : [];

  const mintStrings = useMemo(
    () => safeTokens.map((t) => t.mint || t.address || '').filter(Boolean),
    [safeTokens]
  );

  const poolPda = useMemo(() => {
    if (mintStrings.length !== 3) return null;
    try {
      const m = mintStrings.map((s) => new PublicKey(s)) as [PublicKey, PublicKey, PublicKey];
      const [pk] = findPool3(pfmmProgramId, m[0], m[1], m[2]);
      return pk;
    } catch {
      return null;
    }
  }, [mintStrings, pfmmProgramId]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [seedSol, setSeedSol] = useState<string>('0.05');
  // Separate seed for the creator's first ETF position. Default 0.005 SOL is
  // typically enough to clear MIN_FIRST_DEPOSIT_BASE = 1_000_000 (= 1.0 ETF at
  // 6 decimals) when the basket bottleneck mint has reasonable liquidity.
  const [etfSeedSol, setEtfSeedSol] = useState<string>('0.005');
  const [feeBps, setFeeBps] = useState<number>(30);
  const [windowSlots, setWindowSlots] = useState<number>(40);
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [stage, setStage] = useState<Stage>('idle');
  const [deployStep, setDeployStep] = useState('');
  const [pool, setPool] = useState<PoolState3Data | null>(null);
  const [poolMissing, setPoolMissing] = useState<boolean>(false);
  const [log, setLog] = useState<string[]>([]);
  const [pendingVaults, setPendingVaults] = useState<
    [PublicKey, PublicKey, PublicKey] | null
  >(null);

  const isBusy =
    stage === 'createEtf' ||
    stage === 'init' ||
    stage === 'seed' ||
    stage === 'addLiq' ||
    stage === 'etf-deposit' ||
    stage === 'swap' ||
    stage === 'clear' ||
    stage === 'claim' ||
    stage === 'metadata';

  const estimatedMinSol = useMemo(() => {
    const seedNum = Math.max(0, parseFloat(seedSol) || 0);
    const etfSeedNum = Math.max(0, parseFloat(etfSeedSol) || 0);
    const TOKEN_ACCOUNT_RENT_SOL = 0.00203928;
    const FEE_BUFFER_SOL = 0.01;
    const vaultRent = pool ? 0 : TOKEN_ACCOUNT_RENT_SOL * 3;
    const seedRents =
      config.jupiterEnabled && seedNum > 0
        ? TOKEN_ACCOUNT_RENT_SOL * (1 + safeTokens.length)
        : 0;
    // Step 4 (creator ETF deposit) needs wSOL ATA + ETF ATA + treasury ETA
    // rent on top of the basket ATA rents already counted above.
    const etfDepositRents =
      config.jupiterEnabled && etfSeedNum > 0 ? TOKEN_ACCOUNT_RENT_SOL * 2 : 0;
    return seedNum + etfSeedNum + vaultRent + seedRents + etfDepositRents + FEE_BUFFER_SOL;
  }, [seedSol, etfSeedSol, pool, config.jupiterEnabled, safeTokens.length]);
  const insufficientFunds =
    solBalance !== null && solBalance > 0 && solBalance < estimatedMinSol;

  function pushLog(s: string) {
    setLog((l) => [...l, s]);
  }

  // Refresh pool state whenever the modal opens or selected mints change.
  useEffect(() => {
    if (!isModalOpen || !poolPda) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchPoolState3(connection, poolPda);
        if (cancelled) return;
        if (data) {
          setPool(data);
          setPoolMissing(false);
        } else {
          setPool(null);
          setPoolMissing(true);
        }
      } catch (e) {
        if (cancelled) return;
        setPool(null);
        setPoolMissing(true);
        pushLog(`pool fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen, poolPda, connection]);

  async function refreshPool() {
    if (!poolPda) return null;
    const data = await fetchPoolState3(connection, poolPda);
    if (data) {
      setPool(data);
      setPoolMissing(false);
      setPendingVaults(null);
    }
    return data;
  }

  async function openModal() {
    if (mintStrings.length !== 3) {
      showToast('Exactly 3 tokens required for the PFMM batch auction', 'error');
      return;
    }
    setIsModalOpen(true);
    setLog([]);
    setStage('idle');
    setDeployStep('');
    if (wallet.publicKey) {
      try {
        const lamports = await connection.getBalance(wallet.publicKey);
        setSolBalance(lamports / LAMPORTS_PER_SOL);
      } catch {
        setSolBalance(0);
      }
    }
  }

  function getVaults(): [PublicKey, PublicKey, PublicKey] | null {
    if (pool) return pool.vaults;
    return pendingVaults;
  }

  async function persistMetadata(poolAddress: string, depositSol: number, txSig: string) {
    setStage('metadata');
    setDeployStep('Saving strategy metadata…');
    const strategyData = {
      ownerPubkey: wallet.publicKey!.toBase58(),
      name: strategyName,
      ticker: safeSymbol,
      description,
      type: strategyType || 'BALANCED',
      tokens: safeTokens.map((t) => ({
        symbol: t.symbol,
        weight: t.weight,
        logoURI: t.logoURI,
        mint: t.mint || t.address,
      })),
      tvl: depositSol,
      address: poolAddress,
      protocol: 'pfda-amm-3',
    };
    const result = await api.deploy(txSig, strategyData);
    if (!result.success) throw new Error(result.error || 'Deployment metadata save failed');
    clearStrategyCache();
    return result.strategyId || poolAddress;
  }

  async function runFullFlow() {
    if (!wallet.publicKey || !axisWallet || !poolPda) {
      showToast('Wallet not connected', 'error');
      return;
    }
    if (mintStrings.length !== 3) {
      showToast('Exactly 3 tokens required', 'error');
      return;
    }

    const seedSolNum = Math.max(0, parseFloat(seedSol) || 0);
    const seedLamports = BigInt(Math.floor(seedSolNum * 1_000_000_000));
    const etfSeedSolNum = Math.max(0, parseFloat(etfSeedSol) || 0);
    const etfSeedLamports = BigInt(Math.floor(etfSeedSolNum * 1_000_000_000));

    let lastSig = '';
    let livePool = pool;
    // Captured from CreateEtf when the flow opens a fresh ETF; null when the
    // ETF already existed and we have to fetch the on-chain state in step 4.
    let createdEtfMint: PublicKey | null = null;
    let createdEtfVaults: PublicKey[] | null = null;

    try {
      const m = mintStrings.map((s) => new PublicKey(s)) as [PublicKey, PublicKey, PublicKey];
      const basketMintsForEtf = safeTokens
        .map((t) => t.mint || t.address || '')
        .filter(Boolean)
        .map((s) => new PublicKey(s));
      const basketWeightsBpsForEtf = (() => {
        const raw = safeTokens.map((t) => Math.max(0, Math.round((t.weight ?? 0) * 100)));
        const sum = raw.reduce((a, b) => a + b, 0);
        if (sum === 0) return raw.map(() => Math.floor(10_000 / Math.max(1, raw.length)));
        if (sum !== 10_000) raw[raw.length - 1] += 10_000 - sum;
        return raw;
      })();

      // ── 0. axis-vault CreateEtf — open etfState PDA + ETF mint + N vaults ─
      // The ETF wraps the strategy basket as a single SPL token. PDA is
      // derived from (program, owner, name); a second deploy with the same
      // (owner, name) pair will collide, so we reuse if already present.
      const [etfStatePda] = findEtfState(
        AXIS_VAULT_PROGRAM_ID,
        wallet.publicKey,
        strategyName,
      );
      try {
        await fetchEtfState(connection, etfStatePda);
        pushLog(`ETF already exists at ${truncatePubkey(etfStatePda.toBase58())} — skipping CreateEtf`);
      } catch {
        setStage('createEtf');
        setDeployStep('Creating ETF on axis-vault…');
        const etfMintBundle = await buildBareMintAccountIxs(connection, wallet.publicKey);
        const vaultBundle = await buildBareTokenAccountIxs(
          connection,
          wallet.publicKey,
          basketMintsForEtf.length,
        );
        const createIx = ixCreateEtf({
          programId: AXIS_VAULT_PROGRAM_ID,
          payer: wallet.publicKey,
          etfState: etfStatePda,
          etfMint: etfMintBundle.pubkey,
          treasury: MAINNET_PROTOCOL_TREASURY,
          basketMints: basketMintsForEtf,
          vaults: vaultBundle.pubkeys,
          weightsBps: basketWeightsBpsForEtf,
          ticker: safeSymbol,
          name: strategyName,
          uri: '',
        });
        const createSig = await sendTx(
          connection,
          axisWallet,
          [...etfMintBundle.ixs, ...vaultBundle.ixs, createIx],
          [etfMintBundle.signer, ...vaultBundle.signers],
        );
        lastSig = createSig;
        createdEtfMint = etfMintBundle.pubkey;
        createdEtfVaults = vaultBundle.pubkeys;
        pushLog(
          `✓ create_etf "${strategyName}" (${basketMintsForEtf.length} legs): ${createSig.slice(0, 12)}…  → ${explorerTx(createSig, config.explorerCluster)}`,
        );
        pushLog(`  ETF state: ${etfStatePda.toBase58()}`);
        pushLog(`  ETF mint:  ${etfMintBundle.pubkey.toBase58()}`);
      }

      // Why: per-leg pre-flight inside buildJupiterSolSeedPlan reads
      // getBalance('confirmed') which lags between legs, so a multi-leg
      // fallback can pass per-leg checks but still run the wallet dry on a
      // later leg. Compute the whole-deploy budget upfront and refuse early.
      const TOKEN_ACCOUNT_RENT = 2_039_280n;
      const TX_FEE_RESERVE = 10_000_000n;
      const vaultRentTotal = livePool ? 0n : TOKEN_ACCOUNT_RENT * 3n;
      const wsolRent = config.jupiterEnabled && seedLamports > 0n ? TOKEN_ACCOUNT_RENT : 0n;
      const outputAtaRentTotal =
        config.jupiterEnabled && seedLamports > 0n
          ? TOKEN_ACCOUNT_RENT * BigInt(safeTokens.length)
          : 0n;
      // Step 4 needs: wSOL ATA (idempotent — may already exist after PFMM
      // seed), basket ATAs (idempotent — same), userEtfAta, treasuryEtfAta.
      // Worst case is a fresh wallet: count wSOL + ETF + treasury. The basket
      // ATAs are already in outputAtaRentTotal above when the PFMM seed runs;
      // budget the new pair regardless to keep the floor honest.
      const etfDepositAtaRent =
        config.jupiterEnabled && etfSeedLamports > 0n ? TOKEN_ACCOUNT_RENT * 2n : 0n;
      const totalNeeded =
        seedLamports +
        etfSeedLamports +
        vaultRentTotal +
        wsolRent +
        outputAtaRentTotal +
        etfDepositAtaRent +
        TX_FEE_RESERVE;
      const balanceLamports = BigInt(
        await connection.getBalance(wallet.publicKey, 'confirmed')
      );
      if (balanceLamports < totalNeeded) {
        const fmt = (n: bigint) => (Number(n) / 1e9).toFixed(4);
        throw new Error(
          `Insufficient SOL: need ~${fmt(totalNeeded)} SOL ` +
            `(seed ${fmt(seedLamports)} + ETF seed ${fmt(etfSeedLamports)} + ` +
            `vault rent ${fmt(vaultRentTotal)} + ` +
            `wSOL rent ${fmt(wsolRent)} + ATA rent ${fmt(outputAtaRentTotal)} + ` +
            `ETF deposit ATA rent ${fmt(etfDepositAtaRent)} + ` +
            `fee buffer ${fmt(TX_FEE_RESERVE)}), have ${fmt(balanceLamports)} SOL. ` +
            `Top up the wallet and retry.`
        );
      }

      // ── 1. InitPool (idempotent — skips if already exists) ───────────────
      if (!livePool) {
        setStage('init');
        setDeployStep('Initializing pool on-chain…');
        const [queue0] = findQueue3(pfmmProgramId, poolPda, 0n);
        const vaults = await buildBareTokenAccountIxs(connection, wallet.publicKey, 3);
        setPendingVaults(vaults.pubkeys as [PublicKey, PublicKey, PublicKey]);
        pushLog(`Pool: ${poolPda.toBase58()}`);
        pushLog(`Queue0: ${queue0.toBase58()}`);
        pushLog(
          `Vaults: ${vaults.pubkeys.map((v) => truncatePubkey(v.toBase58())).join(', ')}`
        );

        const microWeights = percentToMicroWeights(safeTokens.map((t) => t.weight));
        pushLog(`Weights (micro): ${microWeights.join('/')}`);

        const initIx = ixInitPool3({
          programId: pfmmProgramId,
          payer: wallet.publicKey,
          pool: poolPda,
          queue: queue0,
          mints: m,
          vaults: vaults.pubkeys as [PublicKey, PublicKey, PublicKey],
          treasury: wallet.publicKey,
          feeBps,
          windowSlots: BigInt(windowSlots),
          weights: microWeights,
        });
        const sig = await sendTx(connection, axisWallet, [...vaults.ixs, initIx], vaults.signers);
        lastSig = sig;
        pushLog(
          `✓ init_pool: ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
        );
        livePool = await refreshPool();
        if (!livePool) {
          // RPC didn't reflect yet — synthesise minimum state so AddLiquidity can run.
          livePool = {
            pool: poolPda,
            tokenMints: m,
            vaults: vaults.pubkeys as [PublicKey, PublicKey, PublicKey],
            reserves: [0n, 0n, 0n],
            weights: microWeights,
            windowSlots: BigInt(windowSlots),
            currentBatchId: 0n,
            currentWindowEnd: 0n,
            treasury: wallet.publicKey,
            authority: wallet.publicKey,
            baseFeeBps: feeBps,
            paused: false,
          };
        }
      } else {
        pushLog(`Pool already initialized — skipping InitPool`);
      }

      // ── 2. Optional Jupiter SOL → basket seed ────────────────────────────
      if (config.jupiterEnabled && seedLamports > 0n) {
        setStage('seed');
        setDeployStep('Buying basket tokens via Jupiter…');
        const bpsWeights = percentToBpsWeights(safeTokens.map((t) => t.weight));
        pushLog(
          `Jupiter SOL → basket: ${seedSolNum} SOL split ${bpsWeights.join('/')} bps; slippage ${slippageBps} bps`
        );

        // Try a single bundled tx first. If it overflows the 1232-byte wire
        // cap (common when 3 legs each carry their own ALT routes), fall back
        // to per-leg sequential seeds — same accounting, just one signature
        // per output mint.
        let bundledFailed = false;
        try {
          const plan = await buildJupiterSolSeedPlan({
            conn: connection,
            user: wallet.publicKey,
            outputMints: livePool.tokenMints,
            weights: bpsWeights,
            solIn: seedLamports,
            slippageBps,
          });
          pushLog(
            `tx ${plan.txBytes}/1232 b · ${plan.ixCount} ix · CU ${plan.computeUnitLimit} @ ${plan.computeUnitPrice} μL/CU`
          );
          for (const leg of plan.legs) {
            pushLog(
              `  ${truncatePubkey(leg.mint.toBase58(), 4, 4)}: ${(Number(leg.solLamports) / 1e9).toFixed(6)} SOL → ${leg.expectedOut.toString()} (min ${leg.minOut.toString()}) · ${leg.routeLabel}`
            );
          }
          const sig = await sendVersionedTx(connection, axisWallet, plan.versionedTx);
          lastSig = sig;
          pushLog(
            `✓ jupiter_seed (basket): ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('1232-byte') || msg.includes('encoding overruns')) {
            bundledFailed = true;
            pushLog(`⚠ bundled seed too large — splitting into per-leg txs`);
          } else {
            throw err;
          }
        }

        if (bundledFailed) {
          // Per-leg seed: one tx per output mint. Lower maxAccounts on each
          // so even crowded routes stay under the wire cap.
          const legLamports = bpsWeights.map((w) =>
            (seedLamports * BigInt(w)) / 10_000n
          );
          const legAssigned = legLamports.reduce((a, b) => a + b, 0n);
          legLamports[legLamports.length - 1] += seedLamports - legAssigned;

          for (let i = 0; i < livePool.tokenMints.length; i++) {
            const mint = livePool.tokenMints[i];
            const lamports = legLamports[i];
            if (lamports <= 0n) continue;
            setDeployStep(
              `Buying leg ${i + 1}/${livePool.tokenMints.length} via Jupiter (${truncatePubkey(mint.toBase58(), 4, 4)})…`
            );
            const legPlan = await buildJupiterSolSeedPlan({
              conn: connection,
              user: wallet.publicKey,
              outputMints: [mint],
              weights: [10_000],
              solIn: lamports,
              slippageBps,
              maxAccounts: 14,
              closeWsolAtEnd: i === livePool.tokenMints.length - 1,
            });
            pushLog(
              `  leg ${i}: ${(Number(lamports) / 1e9).toFixed(6)} SOL → ${truncatePubkey(mint.toBase58(), 4, 4)} · ${legPlan.legs[0].expectedOut.toString()} (min ${legPlan.legs[0].minOut.toString()}) · ${legPlan.legs[0].routeLabel}`
            );
            const sig = await sendVersionedTx(connection, axisWallet, legPlan.versionedTx);
            lastSig = sig;
            pushLog(
              `  ✓ leg ${i}: ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
            );
          }
        }
      } else if (!config.jupiterEnabled && seedLamports > 0n) {
        pushLog(`Jupiter disabled on this cluster — skipping SOL seed`);
      }

      // ── 3. AddLiquidity ──────────────────────────────────────────────────
      const vaults = getVaults() ?? livePool.vaults;
      const userTokens = livePool.tokenMints.map((mint) =>
        getAssociatedTokenAddressSync(mint, wallet.publicKey!)
      ) as [PublicKey, PublicKey, PublicKey];

      // Read fresh balances after the Jupiter seed (or use whatever's there).
      setStage('addLiq');
      setDeployStep('Adding liquidity to the pool…');
      const balances: bigint[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const info2 = await connection.getTokenAccountBalance(userTokens[i], 'confirmed');
          balances.push(BigInt(info2.value.amount));
        } catch {
          balances.push(0n);
        }
      }
      pushLog(`Wallet balances (base units): ${balances.map((b) => b.toString()).join(' / ')}`);

      const allZero = balances.every((b) => b === 0n);
      if (allZero) {
        pushLog(
          'Skipping AddLiquidity — no basket balances yet. Buy basket tokens (Jupiter seed or transfer in) and re-run from this step.'
        );
      } else {
        const amounts = balances as [bigint, bigint, bigint];
        const ix = ixAddLiquidity3({
          programId: pfmmProgramId,
          payer: wallet.publicKey,
          pool: poolPda,
          vaults,
          userTokens,
          amounts,
        });
        const sig = await sendTx(connection, axisWallet, [ix]);
        lastSig = sig;
        pushLog(
          `✓ add_liquidity: ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
        );
        await refreshPool();
      }

      // ── 4. Mint creator's first ETF position ─────────────────────────────
      // Without this, the creator's wallet shows 0 ETF after the deploy and
      // the only way to get a position is to click another button — UX dead
      // end. Resolve the etfMint + vaults from CreateEtf if it just ran, or
      // fall back to fetching the on-chain etfState if the ETF preexisted.
      if (config.jupiterEnabled && etfSeedLamports > 0n) {
        setStage('etf-deposit');
        setDeployStep(`Step 4: depositing ${etfSeedSolNum} SOL to ETF for creator position…`);
        pushLog(
          `Step 4: depositing ${etfSeedSolNum} SOL to ETF for creator position`
        );

        let etfMintForDeposit: PublicKey;
        let vaultsForDeposit: PublicKey[];
        if (createdEtfMint && createdEtfVaults) {
          etfMintForDeposit = createdEtfMint;
          vaultsForDeposit = createdEtfVaults;
        } else {
          const etfStateData = await fetchEtfState(connection, etfStatePda);
          etfMintForDeposit = etfStateData.etfMint;
          vaultsForDeposit = etfStateData.tokenVaults;
        }

        const treasuryEtfAta = getAssociatedTokenAddressSync(
          etfMintForDeposit,
          MAINNET_PROTOCOL_TREASURY,
          true,
        );

        const depositPlan = await buildDepositSolPlan({
          conn: connection,
          user: wallet.publicKey,
          programId: AXIS_VAULT_PROGRAM_ID,
          etfName: strategyName,
          etfState: etfStatePda,
          etfMint: etfMintForDeposit,
          treasury: MAINNET_PROTOCOL_TREASURY,
          treasuryEtfAta,
          basketMints: basketMintsForEtf,
          weights: basketWeightsBpsForEtf,
          vaults: vaultsForDeposit,
          solIn: etfSeedLamports,
          minEtfOut: 0n,
          maxAccounts: 14,
        });
        pushLog(
          `  etf deposit plan: ${depositPlan.mode} · ${depositPlan.txBytes}/1232 b · ${depositPlan.ixCount} ix · expected ETF ${depositPlan.depositAmount.toString()} (min ${MIN_FIRST_DEPOSIT_BASE.toString()})`
        );
        let etfSig = await sendVersionedTx(connection, axisWallet, depositPlan.versionedTx);
        if (depositPlan.mode === 'split' && depositPlan.depositTx) {
          etfSig = await sendVersionedTx(connection, axisWallet, depositPlan.depositTx);
        }
        lastSig = etfSig;
        pushLog(
          `✓ etf_deposit: ${etfSig.slice(0, 12)}…  → ${explorerTx(etfSig, config.explorerCluster)}`,
        );
      } else if (etfSeedLamports > 0n && !config.jupiterEnabled) {
        pushLog(`Jupiter disabled — skipping creator ETF deposit (no router available)`);
      }

      // ── 5. Persist backend metadata ──────────────────────────────────────
      const strategyId = await persistMetadata(poolPda.toBase58(), seedSolNum, lastSig);
      setStage('done');
      setDeployStep('Pool ready. Window auctions will clear automatically.');
      pushLog('DONE — pool live, metadata saved.');
      showToast(`✅ ${safeSymbol} pool live`, 'success');

      if (onDeploySuccess) {
        onDeploySuccess(strategyId, seedSolNum, 'SOL');
      } else {
        onComplete();
      }
    } catch (e: unknown) {
      setStage('err');
      const msg = e instanceof Error ? e.message : String(e);
      pushLog(`✗ ${msg}`);
      setDeployStep('');
      showToast(`Failed: ${msg}`, 'error');
    }
  }

  // ── Manual control: ClearBatch / Claim — surfaced once pool exists ─────
  async function clearBatch() {
    if (!wallet.publicKey || !axisWallet || !pool) return;
    setStage('clear');
    try {
      const batchId = pool.currentBatchId;
      const [queue] = findQueue3(pfmmProgramId, pool.pool, batchId);
      const [history] = findHistory3(pfmmProgramId, pool.pool, batchId);
      const [nextQueue] = findQueue3(pfmmProgramId, pool.pool, batchId + 1n);
      const ix = ixClearBatch3({
        programId: pfmmProgramId,
        cranker: wallet.publicKey,
        pool: pool.pool,
        queue,
        history,
        nextQueue,
      });
      const sig = await sendTx(connection, axisWallet, [ix]);
      pushLog(
        `✓ clear_batch batch=${batchId}: ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
      );
      await refreshPool();
      setStage('idle');
    } catch (e) {
      setStage('err');
      pushLog(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function claim() {
    if (!wallet.publicKey || !axisWallet || !pool) return;
    setStage('claim');
    try {
      const batchId = pool.currentBatchId;
      const claimBatch = batchId > 0n ? batchId - 1n : 0n;
      const [history] = findHistory3(pfmmProgramId, pool.pool, claimBatch);
      const [ticket] = findTicket3(pfmmProgramId, pool.pool, wallet.publicKey, claimBatch);
      const userTokens = pool.tokenMints.map((mint) =>
        getAssociatedTokenAddressSync(mint, wallet.publicKey!)
      ) as [PublicKey, PublicKey, PublicKey];
      const ataIxs = pool.tokenMints.map((mint, i) =>
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey!,
          userTokens[i],
          wallet.publicKey!,
          mint
        )
      );
      const ix = ixClaim3({
        programId: pfmmProgramId,
        user: wallet.publicKey,
        pool: pool.pool,
        history,
        ticket,
        vaults: pool.vaults,
        userTokens,
      });
      const sig = await sendTx(connection, axisWallet, [...ataIxs, ix]);
      pushLog(
        `✓ claim batch=${claimBatch}: ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
      );
      setStage('idle');
    } catch (e) {
      setStage('err');
      pushLog(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function swapInToOut(inIdx: number, outIdx: number, amountUi: number) {
    if (!wallet.publicKey || !axisWallet || !pool) return;
    if (inIdx === outIdx) {
      pushLog('✗ in_idx == out_idx');
      return;
    }
    setStage('swap');
    try {
      const batchId = pool.currentBatchId;
      const [queue] = findQueue3(pfmmProgramId, pool.pool, batchId);
      const [ticket] = findTicket3(pfmmProgramId, pool.pool, wallet.publicKey, batchId);
      const inMint = pool.tokenMints[inIdx];
      const decimals = safeTokens[inIdx]
        ? // assume Jupiter-supplied decimals are present on the token meta;
          // fall back to 6 for unknown SPL.
          9
        : 9;
      const amountIn = BigInt(Math.round(amountUi * 10 ** decimals));
      const userTokenIn = getAssociatedTokenAddressSync(inMint, wallet.publicKey);
      const ix = ixSwapRequest3({
        programId: pfmmProgramId,
        user: wallet.publicKey,
        pool: pool.pool,
        queue,
        ticket,
        userTokenIn,
        vaultIn: pool.vaults[inIdx],
        inIdx,
        outIdx,
        amountIn,
        minOut: 0n,
      });
      const sig = await sendTx(connection, axisWallet, [ix]);
      pushLog(
        `✓ swap_request batch=${batchId} ${inIdx}→${outIdx}: ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
      );
      setStage('idle');
    } catch (e) {
      setStage('err');
      pushLog(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-8 duration-500 text-white">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-serif font-normal text-white/90 mb-1">
          This is Your ETF
        </h2>
        <p className="text-white/40 text-sm">
          Review your basket — deploys an axis-vault ETF (mint + vaults) and a PFMM
          (pfda-amm-3) pool on Solana mainnet.
        </p>
      </div>

      <div className="backdrop-blur-sm bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden mb-6">
        <div className="relative border-b border-white/[0.08] pb-5 mb-6 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-normal uppercase tracking-wide text-white">
                {strategyName}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 border border-amber-600/40 text-xs font-normal bg-amber-900/20 text-amber-400">
                  {safeSymbol}
                </span>
                <span className="text-xs font-mono text-white/30">TYPE: {strategyType}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative grid md:grid-cols-2 gap-8 mb-2">
          <div>
            <h4 className="text-xs font-normal uppercase tracking-widest border-b border-white/[0.08] pb-2 mb-3 flex items-center gap-2 text-white/40">
              <FileText className="w-3 h-3" /> Composition
            </h4>
            <ul className="space-y-2">
              {safeTokens.length > 0 ? (
                safeTokens.map((t, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="font-normal text-white/80 flex items-center gap-2">
                      {t.symbol}
                    </span>
                    <span className="font-mono text-amber-400">{t.weight}%</span>
                  </motion.li>
                ))
              ) : (
                <li className="text-sm text-white/30">No tokens selected</li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-normal uppercase tracking-widest border-b border-white/[0.08] pb-2 mb-3 flex items-center gap-2 text-white/40">
              <ShieldCheck className="w-3 h-3" /> Parameters
            </h4>
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between">
                <span className="text-white/40">Ticker</span>
                <span className="font-normal text-amber-400">${safeSymbol}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-white/40">Total Assets</span>
                <span className="font-normal text-white">{safeTokens.length}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-white/40">Pool PDA</span>
                {poolPda ? (
                  <a
                    href={explorerAddr(poolPda.toBase58(), config.explorerCluster)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-amber-300 hover:text-amber-200 inline-flex items-center gap-1"
                    title={poolPda.toBase58()}
                  >
                    {truncatePubkey(poolPda.toBase58(), 6, 6)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="font-mono text-xs text-white/30">—</span>
                )}
              </li>
              <li className="flex justify-between">
                <span className="text-white/40">Program</span>
                <span className="font-mono text-xs text-white/60" title={pfmmProgramId.toBase58()}>
                  {truncatePubkey(pfmmProgramId.toBase58(), 4, 4)}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pb-8">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={onBack}
          disabled={isBusy}
          className="px-6 py-4 backdrop-blur-sm bg-white/5 rounded-xl font-normal text-white/40 hover:text-white/70 border border-white/[0.08] transition-colors"
        >
          Modify
        </motion.button>
        <motion.button
          whileHover={
            safeTokens.length === 3 ? { scale: 1.01, boxShadow: '0 0 28px rgba(201,168,76,0.3)' } : {}
          }
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={openModal}
          disabled={isBusy || safeTokens.length !== 3}
          title={safeTokens.length !== 3 ? 'Exactly 3 tokens required' : undefined}
          className="flex-1 py-4 bg-gradient-to-r from-[#6B4420] via-[#B8863F] to-[#E8C890] text-[#080503] font-normal rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Wallet className="w-5 h-5" />
          {safeTokens.length === 3 ? 'Deploy ETF + PFMM Pool' : `${safeTokens.length}/3 tokens required`}
        </motion.button>
      </div>

      {createPortal(
        <AnimatePresence>
          {isModalOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !isBusy && setIsModalOpen(false)}
                className="fixed inset-0 bg-black/80 z-[9999]"
                style={{ willChange: 'opacity' }}
              />
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg bg-[#140E08] border border-[rgba(184,134,63,0.15)] rounded-3xl p-6 z-[10000] shadow-2xl max-h-[90vh] overflow-y-auto"
                style={{ willChange: 'transform, opacity' }}
              >
                <h3 className="text-xl font-normal text-[#F2E0C8] mb-1 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" /> ETF + PFMM Pool Deployment
                </h3>
                <p className="text-[11px] text-[#B89860] mb-4">
                  axis-vault CreateEtf → PFMM init → Jupiter seed → AddLiquidity → creator
                  ETF deposit. You receive ETF tokens at the end of the flow.
                </p>

                {poolPda && (
                  <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-900/15 border border-amber-700/20 text-[11px]">
                    <span className="text-[#B89860]">Pool PDA: </span>
                    <a
                      href={explorerAddr(poolPda.toBase58(), config.explorerCluster)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-amber-300 hover:text-amber-200 break-all"
                    >
                      {poolPda.toBase58()}
                    </a>
                    <p className="mt-1 text-[#B89860]/70">
                      Status:{' '}
                      {pool
                        ? `initialized · batch ${pool.currentBatchId.toString()} · weights ${pool.weights.join('/')}`
                        : poolMissing
                          ? 'will be created by InitPool'
                          : 'checking…'}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between mb-1 px-1">
                  <span className="text-xs text-[#B89860]">Your SOL Balance</span>
                  <span
                    className={`text-xs font-mono font-normal ${
                      solBalance === 0 || insufficientFunds ? 'text-red-400' : 'text-[#F2E0C8]'
                    }`}
                  >
                    {solBalance === null ? '...' : `${solBalance.toFixed(4)} SOL`}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[11px] text-[#B89860]/70">
                    Est. minimum needed (seed + rents + fees)
                  </span>
                  <span
                    className={`text-[11px] font-mono ${
                      insufficientFunds ? 'text-red-400' : 'text-[#B89860]/70'
                    }`}
                  >
                    ~{estimatedMinSol.toFixed(4)} SOL
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <label className="flex flex-col text-xs">
                    <span className="text-[#B89860] mb-1">SOL → basket (PFMM seed)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={seedSol}
                      onChange={(e) => setSeedSol(e.target.value)}
                      disabled={isBusy}
                      className="w-full p-2.5 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-xl text-sm font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none transition-colors"
                    />
                  </label>
                  <label className="flex flex-col text-xs">
                    <span className="text-[#B89860] mb-1">Jupiter slippage (bps)</span>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={slippageBps}
                      onChange={(e) => setSlippageBps(Number(e.target.value))}
                      disabled={isBusy}
                      className="w-full p-2.5 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-xl text-sm font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none transition-colors"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 mb-3">
                  <label className="flex flex-col text-xs">
                    <span className="text-[#B89860] mb-1">
                      Your ETF position (SOL) — mints ETF tokens to your wallet
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={etfSeedSol}
                      onChange={(e) => setEtfSeedSol(e.target.value)}
                      disabled={isBusy}
                      className="w-full p-2.5 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-xl text-sm font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none transition-colors"
                    />
                    <span className="text-[10px] text-[#B89860]/60 mt-1">
                      Step 4 deposits this on top of the PFMM seed so you receive ETF
                      tokens immediately. Minimum first deposit yields ≥ 1.0 ETF.
                    </span>
                  </label>
                </div>

                {!pool && poolMissing && (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <label className="flex flex-col text-xs">
                      <span className="text-[#B89860] mb-1">Fee (bps)</span>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={feeBps}
                        onChange={(e) => setFeeBps(Number(e.target.value))}
                        disabled={isBusy}
                        className="w-full p-2.5 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-xl text-sm font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none transition-colors"
                      />
                    </label>
                    <label className="flex flex-col text-xs">
                      <span className="text-[#B89860] mb-1">Window slots</span>
                      <input
                        type="number"
                        min="1"
                        value={windowSlots}
                        onChange={(e) => setWindowSlots(Number(e.target.value))}
                        disabled={isBusy}
                        className="w-full p-2.5 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-xl text-sm font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none transition-colors"
                      />
                    </label>
                  </div>
                )}

                {solBalance !== null && solBalance < 0.02 && (
                  <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    Low SOL balance. Keep at least ≈ 0.02 SOL for tx fees + rent on the bare vault
                    accounts created by InitPool.
                  </div>
                )}

                {isBusy && deployStep && (
                  <div className="mb-4 px-3 py-3 rounded-xl bg-amber-900/20 border border-amber-600/20 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 flex-shrink-0" />
                    <span className="text-xs text-amber-300">{deployStep}</span>
                  </div>
                )}

                <button
                  onClick={runFullFlow}
                  disabled={isBusy}
                  className="w-full py-4 bg-gradient-to-b from-[#F2E0C8] to-[#D4A261] text-[#080503] font-normal rounded-xl flex justify-center items-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {pool
                    ? 'Continue Flow (Seed + AddLiquidity + ETF Deposit)'
                    : 'Run CreateEtf + InitPool + Seed + AddLiquidity + ETF Deposit'}
                </button>

                {/* Manual stage controls — once the pool exists, surface clear/claim/swap. */}
                {pool && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={clearBatch}
                      disabled={isBusy}
                      className="rounded-lg bg-rose-700/70 hover:bg-rose-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {stage === 'clear' ? 'clearing…' : 'ClearBatch'}
                    </button>
                    <button
                      onClick={claim}
                      disabled={isBusy}
                      className="rounded-lg bg-violet-700/70 hover:bg-violet-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {stage === 'claim' ? 'claiming…' : 'Claim'}
                    </button>
                  </div>
                )}

                {pool && (
                  <div className="mt-3 rounded-lg border border-amber-700/15 bg-amber-950/20 p-3 text-[11px]">
                    <p className="font-medium text-amber-200 mb-1">Quick swap (test)</p>
                    <p className="text-[#B89860] mb-2">
                      Submit a 1-unit swap from idx 0 → idx 1 to verify the queue is wired up.
                    </p>
                    <button
                      onClick={() => void swapInToOut(0, 1, 1)}
                      disabled={isBusy}
                      className="rounded bg-amber-600/80 hover:bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      {stage === 'swap' ? 'queueing…' : 'SwapRequest 0→1 (1 unit)'}
                    </button>
                  </div>
                )}

                {log.length > 0 && (
                  <pre className="mt-4 max-h-48 overflow-auto rounded bg-black/60 p-3 text-[10px] text-amber-100/80 leading-relaxed">
                    {log.join('\n')}
                  </pre>
                )}

                {stage === 'done' && (
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      onComplete();
                    }}
                    className="mt-4 w-full py-3 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm font-medium"
                  >
                    Close & continue
                  </button>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
