import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ShieldCheck, Pause, Play, Coins, Download } from 'lucide-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  buildJupiterBasketSellPlan,
  buildPfmmWithdrawFeesPlan,
  fetchPoolState3,
  ixSetPaused3,
  PFDA_AMM3_PROGRAM_ID,
  sendTx,
  sendVersionedTx,
  truncatePubkey,
  type PoolState3Data,
} from '../../protocol/axis-vault';
import { useConnection, useWallet } from '../../hooks/useWallet';
import { useAxisVaultWallet } from '../../hooks/useAxisVaultWallet';
import { useToast } from '../../context/ToastContext';
import type { Strategy } from '../../types';

type Stage = 'idle' | 'loading' | 'recovering' | 'cashout' | 'pausing' | 'ok' | 'err';

interface CreatorConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  strategy: Strategy;
}

export const CreatorConsole = ({ isOpen, onClose, strategy }: CreatorConsoleProps) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const axisWallet = useAxisVaultWallet();
  const { showToast } = useToast();

  const [stage, setStage] = useState<Stage>('idle');
  const [pool, setPool] = useState<PoolState3Data | null>(null);
  const [step, setStep] = useState<string>('');

  const poolPubkey = useMemo(() => {
    if (!strategy.address) return null;
    try {
      return new PublicKey(strategy.address);
    } catch {
      return null;
    }
  }, [strategy.address]);

  useEffect(() => {
    if (!isOpen || !poolPubkey) return;
    let cancelled = false;
    (async () => {
      setStage('loading');
      try {
        const data = await fetchPoolState3(connection, poolPubkey);
        if (cancelled) return;
        setPool(data);
        setStage('idle');
      } catch (e) {
        if (cancelled) return;
        setPool(null);
        setStage('err');
        showToast(`Pool fetch failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, poolPubkey, connection, showToast, stage === 'ok']);

  const totalReserves = useMemo(() => {
    if (!pool) return 0n;
    return pool.reserves.reduce((sum, r) => sum + r, 0n);
  }, [pool]);

  const isAuthority = useMemo(() => {
    if (!pool || !wallet.publicKey) return false;
    return pool.authority.equals(wallet.publicKey);
  }, [pool, wallet.publicKey]);

  const isBusy = stage === 'recovering' || stage === 'cashout' || stage === 'pausing';

  async function handleRecoverAll() {
    if (!wallet.publicKey || !axisWallet || !pool || !poolPubkey) return;
    if (!isAuthority) {
      showToast('Only the pool authority can recover seed', 'error');
      return;
    }
    if (totalReserves === 0n) {
      showToast('Pool already empty', 'info');
      return;
    }

    try {
      setStage('recovering');
      setStep('Withdrawing seed from pool…');
      const wfPlan = await buildPfmmWithdrawFeesPlan({
        conn: connection,
        authority: wallet.publicKey,
        pool: poolPubkey,
        poolState: pool,
        amounts: pool.reserves,
      });
      await sendVersionedTx(connection, axisWallet, wfPlan.versionedTx);

      setStage('cashout');
      setStep('Converting basket → SOL via Jupiter…');
      const inputs = pool.tokenMints
        .map((mint, i) => ({ mint, amount: pool.reserves[i] }))
        .filter((leg) => leg.amount > 0n);
      const sellPlan = await buildJupiterBasketSellPlan({
        conn: connection,
        user: wallet.publicKey,
        inputs,
        slippageBps: 100,
        maxAccounts: 14,
        closeWsolAtEnd: true,
      });
      await sendVersionedTx(connection, axisWallet, sellPlan.versionedTx);

      const expectedSol = Number(sellPlan.totalExpectedSolOut) / LAMPORTS_PER_SOL;
      showToast(`Recovered seed — ~${expectedSol.toFixed(4)} SOL back`, 'success');
      setStage('ok');
      setTimeout(() => setStage('idle'), 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg.slice(0, 200), 'error');
      setStage('err');
      setTimeout(() => setStage('idle'), 2000);
    }
  }

  async function handleTogglePause() {
    if (!wallet.publicKey || !axisWallet || !pool || !poolPubkey) return;
    if (!isAuthority) {
      showToast('Only the pool authority can toggle pause', 'error');
      return;
    }
    try {
      setStage('pausing');
      setStep(pool.paused ? 'Unpausing pool…' : 'Pausing pool…');
      const ix = ixSetPaused3({
        programId: PFDA_AMM3_PROGRAM_ID,
        authority: wallet.publicKey,
        pool: poolPubkey,
        paused: !pool.paused,
      });
      await sendTx(connection, axisWallet, [ix]);
      showToast(pool.paused ? 'Pool unpaused' : 'Pool paused', 'success');
      setStage('ok');
      setTimeout(() => setStage('idle'), 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg.slice(0, 200), 'error');
      setStage('err');
      setTimeout(() => setStage('idle'), 2000);
    }
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] bg-black/85 flex items-center justify-center p-4"
        onClick={() => !isBusy && onClose()}
      >
        <motion.div
          initial={{ scale: 0.94, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-[#0F0E0C] rounded-3xl border border-[rgba(184,134,63,0.15)] p-6 max-h-[88vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-normal text-[#F2E0C8] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Creator Console
            </h3>
            <button
              onClick={() => !isBusy && onClose()}
              disabled={isBusy}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors disabled:opacity-30"
            >
              <X className="w-4 h-4 text-[#A8A29E]" />
            </button>
          </div>
          <p className="text-[11px] text-[#B89860] mb-4">
            Authority-only PFMM pool management.{' '}
            {poolPubkey ? `Pool: ${truncatePubkey(poolPubkey.toBase58())}` : ''}
          </p>

          {stage === 'loading' && (
            <div className="flex items-center gap-2 py-8 justify-center text-[#A8A29E] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading pool state…
            </div>
          )}

          {pool && (
            <>
              <div className="rounded-2xl bg-[#1C1A18] border border-[rgba(184,134,63,0.1)] p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-wider text-[#B89860]">
                    Vault reserves
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      pool.paused
                        ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {pool.paused ? 'PAUSED' : 'LIVE'}
                  </span>
                </div>
                <ul className="space-y-2 text-sm">
                  {pool.tokenMints.map((mint, i) => (
                    <li key={mint.toBase58()} className="flex items-center justify-between">
                      <span className="font-mono text-[#A8A29E] text-xs">
                        {truncatePubkey(mint.toBase58(), 4, 4)}
                      </span>
                      <span className="font-mono text-[#F2E0C8]">
                        {pool.reserves[i].toString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {!isAuthority && (
                <div className="rounded-xl bg-amber-900/20 border border-amber-700/30 px-3 py-2.5 mb-4 text-[11px] text-amber-200">
                  Connected wallet is not the pool authority — actions will fail on-chain.
                  Authority: {truncatePubkey(pool.authority.toBase58())}
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={handleRecoverAll}
                  disabled={isBusy || !isAuthority || totalReserves === 0n}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#B8863F] text-black text-sm font-normal hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {stage === 'recovering' || stage === 'cashout' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Recover all seed → SOL
                </button>

                <button
                  onClick={handleTogglePause}
                  disabled={isBusy || !isAuthority}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#1C1A18] border border-[rgba(184,134,63,0.15)] text-[#F2E0C8] text-sm font-normal hover:bg-[#241F1A] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {stage === 'pausing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : pool.paused ? (
                    <Play className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Pause className="w-4 h-4 text-amber-400" />
                  )}
                  {pool.paused ? 'Unpause pool' : 'Pause pool'}
                </button>
              </div>

              {isBusy && step && (
                <div className="mt-4 flex items-center gap-2 text-xs text-[#B89860]">
                  <Coins className="w-3.5 h-3.5" />
                  {step}
                </div>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
