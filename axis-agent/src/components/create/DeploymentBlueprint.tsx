import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ShieldCheck, Wallet, Loader2 } from 'lucide-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useConnection } from '../../hooks/useWallet';
import { useWallet } from '../../hooks/useWallet';
import { useToast } from '../../context/ToastContext';
import { api, clearStrategyCache } from '../../services/api';
import {
  initializeStrategyFromUI,
  depositSol,
  solToLamports,
  deriveStrategyVaultPda,
  getStrategyVault,
} from '../../protocol/kagemusha';
import type { StrategyTypeLabel } from '../../protocol/kagemusha';

interface DeploymentBlueprintProps {
  strategyName: string;
  strategyType: string;
  tokens: { symbol: string; weight: number; logoURI?: string; address?: string; mint?: string }[];
  description: string;
  settings?: Record<string, unknown>;
  info?: {
    symbol: string;
    imagePreview?: string;
  };
  initialTvl?: number;

  onBack: () => void;
  onComplete: () => void;
  onDeploySuccess?: (address: string, amount: number, asset: 'SOL' | 'USDC') => void;
}

export const DeploymentBlueprint = ({
  strategyName = 'Untitled Strategy',
  strategyType = 'BALANCED',
  tokens = [],
  description = '',
  info = { symbol: 'TEMP' },
  onBack,
  onComplete,
  onDeploySuccess,
}: DeploymentBlueprintProps) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { showToast } = useToast();

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('0');
  const [isDeploying, setIsDeploying] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [deployStep, setDeployStep] = useState<string>('');

  const safeSymbol = info?.symbol || 'ETF';
  const safeTokens = Array.isArray(tokens) ? tokens : [];

  const handleInitialDeployClickWithBalance = async () => {
    setIsDepositModalOpen(true);
    if (wallet.publicKey) {
      try {
        const lamports = await connection.getBalance(wallet.publicKey);
        setSolBalance(lamports / LAMPORTS_PER_SOL);
      } catch {
        setSolBalance(0);
      }
    }
  };

  const handleConfirmDeploy = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      showToast('Wallet not connected', 'error');
      return;
    }

    setIsDeploying(true);

    try {
      const amountSol = parseFloat(depositAmount) || 0;

      // 1. Initialize StrategyVault on-chain (idempotent — skips if already exists)
      setDeployStep('Initializing vault on-chain...');
      const [pda] = deriveStrategyVaultPda(wallet.publicKey, strategyName);
      const existingVault = await getStrategyVault(connection, pda);

      let strategyPda = pda;
      if (!existingVault) {
        const result = await initializeStrategyFromUI(connection, wallet, {
          name: strategyName,
          strategyTypeLabel: (strategyType as StrategyTypeLabel) || 'BALANCED',
          tokens: safeTokens,
        });
        strategyPda = result.strategyPda;
      }

      // 2. Deposit SOL into vault (if amount > 0)
      let txSignature = '';
      if (amountSol > 0) {
        setDeployStep('Depositing SOL into vault...');
        const { signature } = await depositSol(
          connection,
          wallet,
          strategyPda,
          solToLamports(amountSol)
        );
        txSignature = signature;
      }

      // 3. Save strategy metadata to API
      setDeployStep('Saving strategy metadata...');
      const strategyData = {
        ownerPubkey: wallet.publicKey.toBase58(),
        name: strategyName,
        ticker: safeSymbol,
        description,
        type: strategyType || 'BALANCED',
        tokens: safeTokens.map((t) => ({
          symbol: t.symbol,
          weight: t.weight,
          logoURI: t.logoURI,
          mint: t.mint,
        })),
        tvl: amountSol,
        address: strategyPda.toBase58(),
      };

      const result = await api.deploy(txSignature, strategyData);
      if (!result.success) throw new Error(result.error || 'Deployment API failed');

      clearStrategyCache();
      showToast(`✅ ${safeSymbol} Deployed Successfully!`, 'success');
      setIsDepositModalOpen(false);
      setIsDeploying(false);
      setDeployStep('');

      if (onDeploySuccess) {
        onDeploySuccess(result.strategyId || strategyPda.toBase58(), amountSol, 'SOL');
      } else {
        onComplete();
      }
    } catch (e: unknown) {
      showToast(`Failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
      setIsDeploying(false);
      setDeployStep('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-8 duration-500 text-white">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-serif font-normal text-white/90 mb-1">
          This is Your Basket Token
        </h2>
        <p className="text-white/40 text-sm">Review your basket specifications.</p>
      </div>

      <div className="backdrop-blur-sm bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden mb-6">
        <div className="relative border-b border-white/[0.08] pb-5 mb-6 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-normal uppercase tracking-wide text-white">{strategyName}</h1>
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
                    <span className="font-normal text-white/80 flex items-center gap-2">{t.symbol}</span>
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
          disabled={isDeploying}
          className="px-6 py-4 backdrop-blur-sm bg-white/5 rounded-xl font-normal text-white/40 hover:text-white/70 border border-white/[0.08] transition-colors"
        >
          Modify
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.01, boxShadow: '0 0 28px rgba(201,168,76,0.3)' }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={handleInitialDeployClickWithBalance}
          disabled={isDeploying}
          className="flex-1 py-4 bg-gradient-to-r from-[#6B4420] via-[#B8863F] to-[#E8C890] text-[#080503] font-normal rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20"
        >
          <Wallet className="w-5 h-5" /> Deposit & Mint
        </motion.button>
      </div>

      {createPortal(
        <AnimatePresence>
          {isDepositModalOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !isDeploying && setIsDepositModalOpen(false)}
                className="fixed inset-0 bg-black/80 z-[9999]"
                style={{ willChange: 'opacity' }}
              />
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-[#140E08] border border-[rgba(184,134,63,0.15)] rounded-3xl p-6 z-[10000] shadow-2xl"
                style={{ willChange: 'transform, opacity' }}
              >
                <h3 className="text-xl font-normal text-[#F2E0C8] mb-4">Initial Liquidity</h3>

                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs text-[#B89860]">Your SOL Balance</span>
                  <span className={`text-xs font-mono font-normal ${solBalance === 0 ? 'text-red-400' : 'text-[#F2E0C8]'}`}>
                    {solBalance === null ? '...' : `${solBalance.toFixed(4)} SOL`}
                  </span>
                </div>

                <div className="mb-4">
                  <label className="text-xs text-[#B89860] mb-1 block">Deposit Amount (SOL)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full p-4 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-xl text-xl font-normal text-[#F2E0C8] focus:border-[#B8863F] outline-none transition-colors"
                  />
                  <p className="text-[11px] text-white/30 mt-1.5 px-1">
                    You can mint with 0 SOL and deposit later.
                  </p>
                </div>

                {solBalance !== null && solBalance < 0.01 && (
                  <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    Low SOL balance. Keep at least 0.01 SOL for transaction fees.
                  </div>
                )}

                {isDeploying && deployStep && (
                  <div className="mb-4 px-3 py-3 rounded-xl bg-amber-900/20 border border-amber-600/20 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 flex-shrink-0" />
                    <span className="text-xs text-amber-300">{deployStep}</span>
                  </div>
                )}

                <button
                  onClick={handleConfirmDeploy}
                  disabled={isDeploying}
                  className="w-full py-4 bg-gradient-to-b from-[#F2E0C8] to-[#D4A261] text-[#080503] font-normal rounded-xl flex justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isDeploying ? <Loader2 className="animate-spin" /> : 'Confirm & Mint'}
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
