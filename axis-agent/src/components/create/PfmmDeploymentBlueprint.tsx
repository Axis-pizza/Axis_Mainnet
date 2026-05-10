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
  buildJupiterSeedPreview,
  buildJupiterSolSeedPlan,
  buildJupiterSolSeedSingleLegWithLadder,
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
  humanizeJupiterError,
  ixAddLiquidity3,
  ixClaim3,
  ixClearBatch3,
  ixCreateEtf,
  ixInitPool3,
  ixSwapRequest3,
  liveJupiterQuoteClient,
  MAINNET_PROTOCOL_TREASURY,
  MIN_FIRST_DEPOSIT_BASE,
  preflightDepositSol,
  runDepositSolFlow,
  sendTx,
  sendVersionedTx,
  truncatePubkey,
  type PoolState3Data,
} from '../../protocol/axis-vault';
import {
  useDeploymentResume,
  type DeployStepId,
} from '../../hooks/useDeploymentResume';
import { DeploymentStepList } from './DeploymentStepList';
import { LaunchProgressBar } from './LaunchProgressBar';

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

// Session-cached SOL/USD price. Fetched once per page load via Jupiter (the
// FE already talks to Jupiter heavily, so we piggyback on warm connections).
// Falls back to $200 if the quote fails. Used for the launch modal's USD
// display — accuracy here is cosmetic, not transactional.
let _solUsdPriceCache: number | null = null;
let _solUsdPricePromise: Promise<number> | null = null;
const SOL_USD_FALLBACK = 200;
async function fetchSolUsdPrice(): Promise<number> {
  if (_solUsdPriceCache !== null) return _solUsdPriceCache;
  if (_solUsdPricePromise) return _solUsdPricePromise;
  _solUsdPricePromise = (async () => {
    try {
      // 1 SOL → USDC quote. USDC has 6 decimals, so outAmount / 1e6 = USD value.
      const url =
        'https://lite-api.jup.ag/swap/v1/quote' +
        '?inputMint=So11111111111111111111111111111111111111112' +
        '&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' +
        '&amount=1000000000&slippageBps=50&swapMode=ExactIn';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`SOL price HTTP ${res.status}`);
      const data = (await res.json()) as { outAmount?: string };
      const usd = data.outAmount ? Number(data.outAmount) / 1e6 : 0;
      _solUsdPriceCache = usd > 0 ? usd : SOL_USD_FALLBACK;
    } catch {
      _solUsdPriceCache = SOL_USD_FALLBACK;
    }
    return _solUsdPriceCache;
  })();
  return _solUsdPricePromise;
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
  // Track whether the user typed in the input — if so, stop auto-overwriting
  // from the weight-driven default below. Initial "0.05" is treated as the
  // unedited default, not user intent.
  const [seedSolUserEdited, setSeedSolUserEdited] = useState(false);
  // Separate seed for the creator's first ETF position. The actual minimum
  // depends on basket liquidity (the bottleneck leg's SOL→token rate must
  // produce ≥ MIN_FIRST_DEPOSIT_BASE = 1_000_000 base = 1.0 ETF at 6 decimals).
  // Initial 0.005 is auto-overwritten by the weight-driven default below.
  const [etfSeedSol, setEtfSeedSol] = useState<string>('0.005');
  const [etfSeedSolUserEdited, setEtfSeedSolUserEdited] = useState(false);
  // Live SOL/USD for the launch-amount slider. Refreshes on modal open; if the
  // fetch fails we fall back to $200 (transactional values still use SOL).
  const [solUsdPrice, setSolUsdPrice] = useState<number>(SOL_USD_FALLBACK);
  const [computingEtfMin, setComputingEtfMin] = useState(false);
  const [etfMinHint, setEtfMinHint] = useState<string>('');
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
  const [activeStep, setActiveStep] = useState<DeployStepId | null>(null);

  // Persist per-strategy deploy progress so a refresh, signing rejection, or
  // mid-flow error doesn't lose the user's place. The resume hook is keyed on
  // (owner, strategyName) which is also the EtfState PDA seed — so reopening
  // the same draft picks up exactly where it left off.
  const resume = useDeploymentResume({
    owner: wallet.publicKey?.toBase58(),
    strategyName,
  });

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

  // Real-time dust-leg warning: surfaces under each SOL input the moment any
  // token weight × seed < MIN_LEG_LAMPORTS (Jupiter route floor). Mirrors
  // preflightDepositSol logic but inline so users see it before clicking Deploy.
  // Two inputs need the same check: `seedSol` (pool seed) and `etfSeedSol`
  // (creator's own ETF position). Both go through Jupiter splits by weight.
  const computeDustWarning = (
    inputSol: string,
    /** What to call this input in the warning so the user knows which field to bump. */
    inputLabel: 'pool SOL' | 'your ETF position SOL',
  ): string | null => {
    if (!config.jupiterEnabled) return null;
    const num = Math.max(0, parseFloat(inputSol) || 0);
    if (num <= 0 || safeTokens.length === 0) return null;
    const lamports = BigInt(Math.floor(num * 1_000_000_000));
    const bpsWeights = percentToBpsWeights(safeTokens.map((t) => t.weight));
    const MIN_LEG = 3_000_000n; // keep in sync with MIN_LEG_LAMPORTS
    const dust: { i: number; weightBps: number; lamports: bigint }[] = [];
    for (let i = 0; i < bpsWeights.length; i++) {
      const l = (lamports * BigInt(bpsWeights[i])) / 10_000n;
      if (l < MIN_LEG) dust.push({ i, weightBps: bpsWeights[i], lamports: l });
    }
    if (dust.length === 0) return null;
    const minW = Math.min(...bpsWeights);
    const requiredSol = (Number(MIN_LEG) * 10_000) / minW / 1e9;
    const which = dust
      .map((d) => `${safeTokens[d.i]?.symbol ?? `#${d.i + 1}`} (${(d.weightBps / 100).toFixed(2)}%)`)
      .join(', ');
    return `Seed too small for ${which}. Increase ${inputLabel} to ≥ ${requiredSol.toFixed(4)} SOL or raise the smallest token's weight.`;
  };

  const seedDustWarning = useMemo<string | null>(
    () => computeDustWarning(seedSol, 'pool SOL'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seedSol, safeTokens, config.jupiterEnabled],
  );
  const etfSeedDustWarning = useMemo<string | null>(
    () => computeDustWarning(etfSeedSol, 'your ETF position SOL'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [etfSeedSol, safeTokens, config.jupiterEnabled],
  );

  // Weight-driven defaults: as soon as the user picks tokens (and their
  // weights are known), bump seedSol / etfSeedSol so the smallest leg clears
  // the MIN_LEG_LAMPORTS floor with headroom. Pool seed gets 5× the floor for
  // healthier pool depth; ETF position gets 1.5× — it's the creator's own
  // stake, doesn't need to be huge. Skips if the user typed a value manually,
  // and never lowers below the hard-coded baseline defaults.
  useEffect(() => {
    if (!config.jupiterEnabled || safeTokens.length === 0) return;
    const bpsWeights = percentToBpsWeights(safeTokens.map((t) => t.weight));
    if (bpsWeights.length === 0) return;
    const minWeightBps = Math.min(...bpsWeights);
    if (minWeightBps <= 0) return;
    const MIN_LEG_LAMPORTS_NUM = 3_000_000;
    const minSafeInputSol = (MIN_LEG_LAMPORTS_NUM * 10_000) / minWeightBps / 1e9;
    const roundUp = (sol: number, step: number) => Math.ceil(sol / step) * step;
    const nextSeedSol = roundUp(Math.max(0.05, minSafeInputSol * 5), 0.01);
    const nextEtfSeedSol = roundUp(Math.max(0.005, minSafeInputSol * 1.5), 0.005);
    if (!seedSolUserEdited) setSeedSol(nextSeedSol.toFixed(3));
    if (!etfSeedSolUserEdited) setEtfSeedSol(nextEtfSeedSol.toFixed(4));
  }, [safeTokens, config.jupiterEnabled, seedSolUserEdited, etfSeedSolUserEdited]);

  // Fetch live SOL/USD once when the launch modal opens. Cached at the module
  // level so re-opening within the session reuses the value instantly.
  useEffect(() => {
    if (!isModalOpen) return;
    let cancelled = false;
    void fetchSolUsdPrice().then((p) => {
      if (!cancelled) setSolUsdPrice(p);
    });
    return () => {
      cancelled = true;
    };
  }, [isModalOpen]);

  // ── Slider derived values ──────────────────────────────────────────────
  // The slider drives a single "total launch SOL" number; we split 80/20
  // into the existing seedSol (pool depth) and etfSeedSol (creator position)
  // states so the deploy flow downstream doesn't need to change.
  const totalLaunchSol = useMemo(() => {
    const seed = parseFloat(seedSol) || 0;
    const etf = parseFloat(etfSeedSol) || 0;
    return seed + etf;
  }, [seedSol, etfSeedSol]);

  // Slider min: smallest amount where every leg of the 80% pool-seed split
  // clears MIN_LEG_LAMPORTS. Slider max: 10× that, capped at $500 worth.
  const sliderBounds = useMemo(() => {
    const bpsWeights =
      safeTokens.length > 0 ? percentToBpsWeights(safeTokens.map((t) => t.weight)) : [10_000];
    const minWeightBps = Math.max(1, Math.min(...bpsWeights));
    const MIN_LEG_LAMPORTS_NUM = 3_000_000;
    // 80% of total goes to pool seed; that 80% × minWeight must clear MIN_LEG.
    const minPoolSeed = (MIN_LEG_LAMPORTS_NUM * 10_000) / minWeightBps / 1e9;
    const minTotal = Math.ceil((minPoolSeed / 0.8) * 100) / 100; // round to 0.01 SOL
    const usdCap = 500;
    const maxTotal = Math.max(minTotal * 10, usdCap / solUsdPrice);
    return { min: minTotal, max: maxTotal };
  }, [safeTokens, solUsdPrice]);

  function handleSliderChange(nextTotalSol: number) {
    const clamped = Math.max(sliderBounds.min, Math.min(sliderBounds.max, nextTotalSol));
    const nextSeed = clamped * 0.8;
    const nextEtf = clamped * 0.2;
    setSeedSol(nextSeed.toFixed(4));
    setEtfSeedSol(nextEtf.toFixed(4));
    setSeedSolUserEdited(true);
    setEtfSeedSolUserEdited(true);
  }

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
      showToast('Pick exactly 3 tokens to launch a batch-auction strategy', 'error');
      return;
    }
    setIsModalOpen(true);
    setLog([]);
    // Don't reset to 'idle' if a previous attempt errored — we want the
    // step list to keep showing the failed step in red until the user
    // clicks "Resume from here".
    if (stage !== 'err') {
      setStage('idle');
      setDeployStep('');
    }
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

  // Probe the basket's bottleneck leg via a 1 SOL Jupiter preview, then back
  // out the seed needed to mint ≥ MIN_FIRST_DEPOSIT_BASE base units. Mirrors
  // the formula in depositSolPlan.ts:232-233 so the suggestion matches what
  // the pre-flight will accept, plus a 10% buffer baked into that formula.
  async function computeEtfSeedMin() {
    if (safeTokens.length === 0) return;
    setComputingEtfMin(true);
    setEtfMinHint('');
    try {
      const probeSol = 1n * BigInt(LAMPORTS_PER_SOL);
      const preview = await buildJupiterSeedPreview({
        basketMints: safeTokens.map((t) => (t.mint || t.address) as string),
        weights: percentToBpsWeights(safeTokens.map((t) => t.weight)),
        solIn: probeSol,
        slippageBps,
        quoteClient: liveJupiterQuoteClient,
      });
      if (preview.depositAmount === 0n) {
        throw new Error('basket bottleneck yields 0 ETF — check basket liquidity');
      }
      const suggestedLamports =
        (probeSol * MIN_FIRST_DEPOSIT_BASE * 11n) / (preview.depositAmount * 10n);
      const suggestedSol = Number(suggestedLamports) / 1e9;
      // Round up to 4 decimals so the displayed value is what we set.
      const rounded = Math.ceil(suggestedSol * 10000) / 10000;
      setEtfSeedSol(rounded.toFixed(4));
      // Auto-button is an explicit user intent — lock the weight-driven default
      // out from then on so we don't ping-pong the value.
      setEtfSeedSolUserEdited(true);
      setEtfMinHint(
        `min ≈ ${rounded.toFixed(4)} SOL · bottleneck ${truncatePubkey(
          preview.legs[preview.bottleneckIndex].mint.toBase58(),
          4,
          4
        )}`
      );
    } catch (e) {
      setEtfMinHint(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setComputingEtfMin(false);
    }
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
        const data = await fetchEtfState(connection, etfStatePda);
        pushLog(`ETF already exists at ${truncatePubkey(etfStatePda.toBase58())} — skipping CreateEtf`);
        resume.setAddresses({
          etfStatePda: etfStatePda.toBase58(),
          etfMint: data.etfMint.toBase58(),
        });
        resume.updateStep('createEtf', { status: 'done' });
      } catch {
        setActiveStep('createEtf');
        setStage('createEtf');
        setDeployStep('Creating ETF on axis-vault…');
        resume.updateStep('createEtf', { status: 'running' });
        try {
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
          resume.setAddresses({
            etfStatePda: etfStatePda.toBase58(),
            etfMint: etfMintBundle.pubkey.toBase58(),
          });
          resume.updateStep('createEtf', { status: 'done', sig: createSig });
        } catch (e) {
          resume.updateStep('createEtf', {
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
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
        setActiveStep('initPool');
        setStage('init');
        setDeployStep('Initializing pool on-chain…');
        resume.updateStep('initPool', { status: 'running' });
        try {
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
          resume.setAddresses({ poolAddress: poolPda.toBase58() });
          resume.updateStep('initPool', { status: 'done', sig });
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
        } catch (e) {
          resume.updateStep('initPool', {
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
      } else {
        pushLog(`Pool already initialized — skipping InitPool`);
        resume.setAddresses({ poolAddress: poolPda.toBase58() });
        resume.updateStep('initPool', { status: 'done' });
      }

      // ── 2. Optional Jupiter SOL → basket seed ────────────────────────────
      if (config.jupiterEnabled && seedLamports > 0n) {
        setActiveStep('seed');
        setStage('seed');
        setDeployStep('Buying basket tokens via Jupiter…');
        resume.updateStep('seed', { status: 'running' });
        const bpsWeights = percentToBpsWeights(safeTokens.map((t) => t.weight));
        // Reject dust legs upfront — same per-leg lamports check the ETF
        // deposit step already runs. Saves us from burning the InitPool tx
        // only to die at the first Jupiter quote with NO_ROUTES_FOUND.
        const seedPre = preflightDepositSol({
          basketSize: livePool.tokenMints.length,
          weights: bpsWeights,
          solIn: seedLamports,
        });
        if (!seedPre.ok) {
          // Same localization trick as the ETF deposit preflight — point the
          // user at the right input field instead of a generic "SOL input".
          const localizedErrors = seedPre.errors.map((m) =>
            m.replace(/Increase SOL input to /g, 'Increase "How much SOL to put in the pool" to ')
          );
          const msg = `Pool seed preflight failed: ${localizedErrors.join('; ')}`;
          resume.updateStep('seed', { status: 'error', error: msg });
          throw new Error(msg);
        }
        for (const w of seedPre.warnings) pushLog(`  ⚠ ${w}`);
        pushLog(
          `Jupiter SOL → basket: ${seedSolNum} SOL split ${bpsWeights.join('/')} bps; slippage ${slippageBps} bps`
        );

        // Try a single bundled tx first. If it overflows the 1232-byte wire
        // cap (common when 3 legs each carry their own ALT routes), fall back
        // to per-leg sequential seeds — same accounting, just one signature
        // per output mint.
        let bundledFailed = false;
        let seedSig: string | undefined;
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
          seedSig = sig;
          pushLog(
            `✓ jupiter_seed (basket): ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('1232-byte') || msg.includes('encoding overruns')) {
            bundledFailed = true;
            pushLog(`⚠ bundled seed too large — splitting into per-leg txs`);
          } else {
            resume.updateStep('seed', {
              status: 'error',
              error: msg,
            });
            throw err;
          }
        }

        if (bundledFailed) {
          try {
            // Per-leg seed: one tx per output mint. Each leg gets its own
            // maxAccounts ladder retry inside the helper so a single dense
            // route doesn't fail the whole launch.
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
              const legPlan = await buildJupiterSolSeedSingleLegWithLadder({
                conn: connection,
                user: wallet.publicKey,
                outputMint: mint,
                solIn: lamports,
                slippageBps,
                closeWsolAtEnd: i === livePool.tokenMints.length - 1,
              });
              pushLog(
                `  leg ${i}: ${(Number(lamports) / 1e9).toFixed(6)} SOL → ${truncatePubkey(mint.toBase58(), 4, 4)} · ${legPlan.legs[0].expectedOut.toString()} (min ${legPlan.legs[0].minOut.toString()}) · ${legPlan.legs[0].routeLabel}`
              );
              const sig = await sendVersionedTx(connection, axisWallet, legPlan.versionedTx);
              lastSig = sig;
              if (!seedSig) seedSig = sig;
              pushLog(
                `  ✓ leg ${i}: ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
              );
            }
          } catch (err) {
            resume.updateStep('seed', {
              status: 'error',
              error: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        }
        resume.updateStep('seed', { status: 'done', sig: seedSig });
      } else if (!config.jupiterEnabled && seedLamports > 0n) {
        pushLog(`Jupiter disabled on this cluster — skipping SOL seed`);
      } else {
        resume.updateStep('seed', { status: 'done' });
      }

      // ── 3. AddLiquidity ──────────────────────────────────────────────────
      const vaults = getVaults() ?? livePool.vaults;
      const userTokens = livePool.tokenMints.map((mint) =>
        getAssociatedTokenAddressSync(mint, wallet.publicKey!)
      ) as [PublicKey, PublicKey, PublicKey];

      // Read fresh balances after the Jupiter seed (or use whatever's there).
      setActiveStep('addLiquidity');
      setStage('addLiq');
      setDeployStep('Adding liquidity to the pool…');
      resume.updateStep('addLiquidity', { status: 'running' });
      try {
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
          resume.updateStep('addLiquidity', {
            status: 'error',
            error: 'No basket tokens to add. Increase the SOL seed amount or transfer tokens in.',
          });
          throw new Error('No basket balances to add as liquidity — increase the SOL seed amount.');
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
          resume.updateStep('addLiquidity', { status: 'done', sig });
          await refreshPool();
        }
      } catch (e) {
        // updateStep already stamped error in the no-balance branch; only
        // overwrite when it isn't already set so we keep the original cause.
        if (resume.progress?.steps.addLiquidity.status !== 'error') {
          resume.updateStep('addLiquidity', {
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          });
        }
        throw e;
      }

      // ── 4. Mint creator's first ETF position ─────────────────────────────
      // Without this, the creator's wallet shows 0 ETF after the deploy and
      // the only way to get a position is to click another button — UX dead
      // end. Resolve the etfMint + vaults from CreateEtf if it just ran, or
      // fall back to fetching the on-chain etfState if the ETF preexisted.
      if (config.jupiterEnabled && etfSeedLamports > 0n) {
        setActiveStep('etfDeposit');
        setStage('etf-deposit');
        setDeployStep(`Step 4: depositing ${etfSeedSolNum} SOL to ETF for creator position…`);
        resume.updateStep('etfDeposit', { status: 'running' });
        pushLog(
          `Step 4: depositing ${etfSeedSolNum} SOL to ETF for creator position`
        );

        try {
        // Resolve the basket from on-chain when the ETF already exists. The
        // user-supplied `basketMintsForEtf` / `basketWeightsBpsForEtf` from
        // the current UI selection can drift from the locked-in ETF state if
        // the user re-opens this modal with different tokens — the deposit ix
        // then transfers from ATA(newMint) → vault(oldMint), and the token
        // program rejects with 0x3 "Account not associated with this Mint".
        let etfMintForDeposit: PublicKey;
        let vaultsForDeposit: PublicKey[];
        let basketMintsForDeposit: PublicKey[];
        let basketWeightsForDeposit: number[];
        if (createdEtfMint && createdEtfVaults) {
          etfMintForDeposit = createdEtfMint;
          vaultsForDeposit = createdEtfVaults;
          basketMintsForDeposit = basketMintsForEtf;
          basketWeightsForDeposit = basketWeightsBpsForEtf;
        } else {
          const etfStateData = await fetchEtfState(connection, etfStatePda);
          etfMintForDeposit = etfStateData.etfMint;
          vaultsForDeposit = etfStateData.tokenVaults;
          // Trust chain over UI state — the ix args must agree with whatever
          // the program wrote when CreateEtf ran, regardless of what the user
          // has selected in the wizard right now.
          basketMintsForDeposit = etfStateData.tokenMints;
          basketWeightsForDeposit = etfStateData.weightsBps;
        }

        const treasuryEtfAta = getAssociatedTokenAddressSync(
          etfMintForDeposit,
          MAINNET_PROTOCOL_TREASURY,
          true,
        );

        const pre = preflightDepositSol({
          basketSize: basketMintsForDeposit.length,
          weights: basketWeightsForDeposit,
          solIn: etfSeedLamports,
        });
        // Rewrite the generic "Increase SOL input ..." prose so the user knows
        // which input field to bump — there are two SOL inputs in this modal
        // (pool seed vs ETF position seed) and the preflight is shared.
        const localizedErrors = pre.errors.map((m) =>
          m.replace(/Increase SOL input to /g, 'Increase "How much SOL for your own ETF position" to ')
        );
        if (!pre.ok) {
          throw new Error(`ETF position seed preflight failed: ${localizedErrors.join('; ')}`);
        }
        for (const w of pre.warnings) pushLog(`  ⚠ ${w}`);
        const depositResult = await runDepositSolFlow({
          conn: connection,
          wallet: axisWallet,
          planArgs: {
            conn: connection,
            user: wallet.publicKey,
            programId: AXIS_VAULT_PROGRAM_ID,
            etfName: strategyName,
            etfState: etfStatePda,
            etfMint: etfMintForDeposit,
            treasury: MAINNET_PROTOCOL_TREASURY,
            treasuryEtfAta,
            basketMints: basketMintsForDeposit,
            weights: basketWeightsForDeposit,
            vaults: vaultsForDeposit,
            solIn: etfSeedLamports,
            minEtfOut: 0n,
          },
          callbacks: {
            onRetry: ({ previousMaxAccounts, nextMaxAccounts }) =>
              pushLog(
                `  ↻ tx blew 1232 b at maxAccounts=${previousMaxAccounts}; retrying at ${nextMaxAccounts}…`
              ),
            onMultiTxFallback: ({ reason }) =>
              pushLog(
                `  ⇉ bundled deposit too dense (${reason}) — switching to per-leg signing`
              ),
            onPlanReady: ({ plan, maxAccounts }) => {
              if (plan.mode === 'multi') {
                const legCount = plan.legTxs?.length ?? 0;
                const legMaxes = (plan.legMaxAccounts ?? []).join('/');
                pushLog(
                  `  etf deposit plan: multi · setup+${legCount} legs+deposit · longest tx ${plan.txBytes}/1232 b · per-leg maxAccounts=[${legMaxes}] · expected ETF ${plan.depositAmount.toString()} (min ${MIN_FIRST_DEPOSIT_BASE.toString()})`
                );
              } else {
                pushLog(
                  `  etf deposit plan: ${plan.mode} · ${plan.txBytes}/1232 b · ${plan.ixCount} ix · maxAccounts=${maxAccounts} · expected ETF ${plan.depositAmount.toString()} (min ${MIN_FIRST_DEPOSIT_BASE.toString()})`
                );
              }
            },
            onStepDone: (step, sig, leg) => {
              if (step === 'setup') {
                pushLog(
                  `  ✓ setup (ATAs + wrap): ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
                );
              } else if (step === 'leg' && leg) {
                pushLog(
                  `  ✓ leg ${leg.legIndex + 1}/${leg.legCount} (maxAccounts=${leg.maxAccounts}): ${sig.slice(0, 12)}…  → ${explorerTx(sig, config.explorerCluster)}`
                );
              }
            },
          },
        });
        const etfSig = depositResult.sigs[depositResult.sigs.length - 1];
        lastSig = etfSig;
        pushLog(
          `✓ etf_deposit: ${etfSig.slice(0, 12)}…  → ${explorerTx(etfSig, config.explorerCluster)}`,
        );
        resume.updateStep('etfDeposit', { status: 'done', sig: etfSig });
        } catch (e) {
          resume.updateStep('etfDeposit', {
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
      } else if (etfSeedLamports > 0n && !config.jupiterEnabled) {
        pushLog(`Jupiter disabled — skipping creator ETF deposit (no router available)`);
        resume.updateStep('etfDeposit', { status: 'done' });
      } else {
        resume.updateStep('etfDeposit', { status: 'done' });
      }

      // ── 5. Persist backend metadata ──────────────────────────────────────
      const strategyId = await persistMetadata(poolPda.toBase58(), seedSolNum, lastSig);
      setStage('done');
      setActiveStep(null);
      setDeployStep('Pool ready. Window auctions will clear automatically.');
      pushLog('DONE — pool live, metadata saved.');
      // The strategy is on-chain + indexed; we no longer need the local
      // resume marker. Keep cached PDAs around briefly via the modal close
      // handler so the user sees the green checks before we wipe state.
      resume.clear();
      showToast(`✅ ${safeSymbol} live`, 'success');

      if (onDeploySuccess) {
        onDeploySuccess(strategyId, seedSolNum, 'SOL');
      } else {
        onComplete();
      }
    } catch (e: unknown) {
      setStage('err');
      setActiveStep(null);
      console.error('[PfmmDeploymentBlueprint] deploy failed:', e);
      const techMsg = e instanceof Error ? e.message : String(e);
      pushLog(`✗ ${techMsg}`);
      setDeployStep('');
      showToast(humanizeJupiterError(e), 'error');
    } finally {
      // The active highlight should disappear once the run finishes — the
      // step list still shows the per-step status from the resume hook.
      if (stage !== 'done') setActiveStep(null);
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
          Review and launch
        </h2>
        <p className="text-white/40 text-sm">
          We'll create your ETF, set up the trading pool, and put your first
          position in. Five quick steps — you sign each one in your wallet.
        </p>
      </div>

      {resume.hasProgress && stage !== 'done' && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-amber-900/15 border border-amber-700/30 text-[12px] text-amber-200 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-amber-300 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-normal">You have a draft for "{strategyName}".</p>
            <p className="text-amber-200/70 mt-0.5">
              Reopening the launcher will pick up where you left off. Already-done steps are skipped.
            </p>
          </div>
        </div>
      )}

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
          {safeTokens.length === 3
            ? resume.hasProgress
              ? 'Resume launch'
              : 'Launch your strategy'
            : `${safeTokens.length}/3 tokens required`}
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
                  <Layers className="w-4 h-4 text-amber-400" />{' '}
                  {isBusy || resume.hasProgress ? `Launching ${safeSymbol}` : `Launch ${safeSymbol}`}
                </h3>
                {!isBusy && !resume.hasProgress && (
                  <p className="text-[11px] text-[#B89860] mb-5">
                    Pick how much you want to start with. We'll handle the rest.
                  </p>
                )}

                {/* ── DURING LAUNCH: just the animated progress bar ─── */}
                {(isBusy || resume.hasProgress) && (
                  <LaunchProgressBar
                    progress={resume.progress}
                    activeStep={activeStep}
                    explorerCluster={config.explorerCluster}
                    title={isBusy ? `Launching ${safeSymbol}` : 'Paused — tap Continue to resume'}
                  />
                )}

                {/* ── PRE-LAUNCH: amount picker + lightweight preview ── */}
                {!isBusy && !resume.hasProgress && (
                  <>
                    <div className="text-center mb-4">
                      <div className="text-[10px] uppercase tracking-widest text-[#B89860]/60 mb-1">
                        Start with
                      </div>
                      <div className="text-4xl font-light text-[#F2E0C8] tabular-nums">
                        ${(totalLaunchSol * solUsdPrice).toFixed(0)}
                      </div>
                      <div className="text-xs text-[#B89860]/70 font-mono tabular-nums mt-1">
                        {totalLaunchSol.toFixed(4)} SOL
                      </div>
                    </div>

                    <div className="mb-5 px-1">
                      <input
                        type="range"
                        min={sliderBounds.min}
                        max={sliderBounds.max}
                        step={(sliderBounds.max - sliderBounds.min) / 200}
                        value={Math.max(sliderBounds.min, Math.min(sliderBounds.max, totalLaunchSol))}
                        onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
                        disabled={isBusy}
                        className="w-full h-2 accent-amber-400 cursor-pointer disabled:opacity-50"
                      />
                      <div className="flex justify-between text-[10px] text-[#B89860]/60 mt-1.5 font-mono tabular-nums">
                        <span>min ${(sliderBounds.min * solUsdPrice).toFixed(0)}</span>
                        <span>max ${(sliderBounds.max * solUsdPrice).toFixed(0)}</span>
                      </div>
                    </div>

                    {/* Slim one-line preview. The richer 4-line breakdown
                        was redundant for beginners — they care about "what
                        do I get" + "what's the cost". */}
                    <div className="mb-5 text-center text-[11px] text-[#B89860]">
                      You'll receive ~{safeSymbol} tokens worth{' '}
                      <span className="text-[#F2E0C8]">${(totalLaunchSol * 0.2 * solUsdPrice).toFixed(2)}</span>{' '}
                      · fees ~$2
                    </div>
                  </>
                )}

                {/* ── ADVANCED (collapsed, pre-launch only) ──────────── */}
                {!isBusy && !resume.hasProgress && (
                <details className="mb-4 group">
                  <summary className="text-[11px] text-[#B89860]/70 hover:text-[#F2E0C8] cursor-pointer select-none flex items-center gap-1.5 py-1">
                    <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                    Advanced settings
                  </summary>
                  <div className="mt-3 space-y-3 pl-1">
                    {poolPda && pool && (
                      <div className="text-[11px]">
                        <span className="text-[#B89860]">Pool address: </span>
                        <a
                          href={explorerAddr(poolPda.toBase58(), config.explorerCluster)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-amber-300 hover:text-amber-200 break-all"
                        >
                          {truncatePubkey(poolPda.toBase58(), 6, 6)}
                        </a>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col text-[10px]">
                        <span className="text-[#B89860]/70 mb-1">Pool seed (SOL)</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={seedSol}
                          onChange={(e) => {
                            setSeedSol(e.target.value);
                            setSeedSolUserEdited(true);
                          }}
                          disabled={isBusy}
                          className="w-full p-2 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-lg text-xs font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none"
                        />
                      </label>
                      <label className="flex flex-col text-[10px]">
                        <span className="text-[#B89860]/70 mb-1">Your position (SOL)</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.001"
                          value={etfSeedSol}
                          onChange={(e) => {
                            setEtfSeedSol(e.target.value);
                            setEtfSeedSolUserEdited(true);
                            setEtfMinHint('');
                          }}
                          disabled={isBusy}
                          className="w-full p-2 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-lg text-xs font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none"
                        />
                      </label>
                    </div>
                    {(seedDustWarning || etfSeedDustWarning) && (
                      <div className="text-[10px] text-rose-400">
                        ⚠ {seedDustWarning || etfSeedDustWarning}
                      </div>
                    )}
                    {etfMinHint && (
                      <div
                        className={
                          'text-[10px] ' +
                          (etfMinHint.startsWith('✗') ? 'text-rose-400' : 'text-emerald-400/80')
                        }
                      >
                        {etfMinHint}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={computeEtfSeedMin}
                      disabled={isBusy || computingEtfMin || safeTokens.length === 0}
                      className="w-full px-3 py-2 bg-[#080503] border border-[rgba(184,134,63,0.3)] rounded-lg text-[11px] text-[#B89860] hover:border-[#B8863F] disabled:opacity-50"
                    >
                      {computingEtfMin ? 'Computing…' : 'Auto-compute minimum position'}
                    </button>
                  </div>
                </details>
                )}

                {/* Pool-init only knobs (fee/window/slippage) — show only when
                    we're about to create a fresh pool. Default values are sane
                    so beginners never see this; surfaces inside an extra-nested
                    details so it stays hidden by default. */}
                {!pool && poolMissing && !isBusy && !resume.hasProgress && (
                  <details className="mb-4 group">
                    <summary className="text-[11px] text-[#B89860]/70 hover:text-[#F2E0C8] cursor-pointer select-none flex items-center gap-1.5 py-1">
                      <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                      Pool parameters (for nerds)
                    </summary>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <label className="flex flex-col text-[10px]">
                        <span className="text-[#B89860]/70 mb-1">Trade fee bps</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max="10000"
                          value={feeBps}
                          onChange={(e) => setFeeBps(Number(e.target.value))}
                          disabled={isBusy}
                          className="w-full p-2 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-lg text-xs font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none"
                        />
                      </label>
                      <label className="flex flex-col text-[10px]">
                        <span className="text-[#B89860]/70 mb-1">Window slots</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          value={windowSlots}
                          onChange={(e) => setWindowSlots(Number(e.target.value))}
                          disabled={isBusy}
                          className="w-full p-2 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-lg text-xs font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none"
                        />
                      </label>
                      <label className="flex flex-col text-[10px]">
                        <span className="text-[#B89860]/70 mb-1">Slippage bps</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="500"
                          value={slippageBps}
                          onChange={(e) => setSlippageBps(Number(e.target.value))}
                          disabled={isBusy}
                          className="w-full p-2 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-lg text-xs font-mono text-[#F2E0C8] focus:border-[#B8863F] outline-none"
                        />
                      </label>
                    </div>
                  </details>
                )}

                {/* Single, plain-English wallet warning. Only shown
                    pre-launch — once running, the progress bar carries
                    the user's attention and warnings would just add noise. */}
                {!isBusy && !resume.hasProgress &&
                  (insufficientFunds || (solBalance !== null && solBalance < 0.02)) && (
                  <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    Not enough SOL in your wallet. Add some SOL and try again.
                  </div>
                )}

                <button
                  onClick={runFullFlow}
                  disabled={isBusy || insufficientFunds}
                  className="w-full py-4 bg-gradient-to-b from-[#F2E0C8] to-[#D4A261] text-[#080503] font-normal rounded-xl flex justify-center items-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isBusy
                    ? 'Working…'
                    : stage === 'err'
                      ? 'Resume from here'
                      : resume.hasProgress && pool
                        ? 'Continue launch'
                        : `Launch ${safeSymbol}`}
                </button>

                {/* Manual + dev controls live behind "Advanced" so they
                    don't distract creators during the normal flow. */}
                {pool && (
                  <details className="mt-4 group">
                    <summary className="text-[11px] text-amber-400/60 hover:text-amber-300 cursor-pointer select-none">
                      Developer controls
                    </summary>
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
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
                      <div className="rounded-lg border border-amber-700/15 bg-amber-950/20 p-3 text-[11px]">
                        <p className="font-medium text-amber-200 mb-1">Test swap</p>
                        <button
                          onClick={() => void swapInToOut(0, 1, 1)}
                          disabled={isBusy}
                          className="rounded bg-amber-600/80 hover:bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                        >
                          {stage === 'swap' ? 'queueing…' : 'SwapRequest 0→1 (1 unit)'}
                        </button>
                      </div>
                      {log.length > 0 && (
                        <pre className="max-h-48 overflow-auto rounded bg-black/60 p-3 text-[10px] text-amber-100/80 leading-relaxed">
                          {log.join('\n')}
                        </pre>
                      )}
                    </div>
                  </details>
                )}

                {stage === 'done' && (
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      onComplete();
                    }}
                    className="mt-4 w-full py-3 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm font-medium"
                  >
                    Done — view your strategy
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
