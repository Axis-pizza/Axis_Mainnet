import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ShieldCheck, Wallet, Loader2 } from 'lucide-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { useWallet } from '../../hooks/useWallet';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import { SERVER_WALLET_PUBKEY } from '../../config/constants';
import { getOrCreateUsdcAta, createUsdcTransferIx } from '../../services/usdc';

interface DeploymentBlueprintProps {
  strategyName: string;
  strategyType: string;
  tokens: { symbol: string; weight: number; logoURI?: string; address?: string; mint?: string }[];
  description: string;
  settings?: any;
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
  settings = {},
  info = { symbol: 'TEMP' },
  initialTvl = 1.0,
  onBack,
  onComplete,
  onDeploySuccess,
}: DeploymentBlueprintProps) => {
  // tokensチェックは残しつつ、空の早期リターンはしないように修正（propsでデフォルト値を入れているため）
  if (!tokens) {
    // logging or handling if needed
  }

  const { connection } = useConnection();
  const wallet = useWallet();
  const { showToast } = useToast();

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(initialTvl ? initialTvl.toString() : '1.0');
  const [depositAsset, setDepositAsset] = useState<'SOL' | 'USDC'>('USDC');
  const [isDeploying, setIsDeploying] = useState(false);

  const safeSymbol = info?.symbol || 'ETF';
  const safeTokens = Array.isArray(tokens) ? tokens : [];

  const handleInitialDeployClick = () => {
    setIsDepositModalOpen(true);
  };

  const handleConfirmDeploy = async () => {
    if (!depositAmount) return;
    if (!wallet.publicKey || !wallet.signTransaction) {
      showToast('Wallet not connected', 'error');
      return;
    }

    setIsDeploying(true);

    try {
      const amountUsdc = parseFloat(depositAmount);

      // 1. USDC送金
      let txSignature = '';
      if (amountUsdc > 0) {
        showToast(`Sending ${amountUsdc} USDC to Vault...`, 'info');
        const transaction = new Transaction();

        const { ata: fromAta, instruction: createFromIx } = await getOrCreateUsdcAta(
          connection,
          wallet.publicKey,
          wallet.publicKey
        );
        const { ata: toAta, instruction: createToIx } = await getOrCreateUsdcAta(
          connection,
          wallet.publicKey,
          SERVER_WALLET_PUBKEY
        );
        if (createFromIx) transaction.add(createFromIx);
        if (createToIx) transaction.add(createToIx);

        transaction.add(createUsdcTransferIx(fromAta, toAta, wallet.publicKey, amountUsdc));

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        const signedTx = await wallet.signTransaction(transaction);
        txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
        showToast('Confirming Transaction...', 'info');
        await connection.confirmTransaction(
          { signature: txSignature, blockhash, lastValidBlockHeight },
          'confirmed'
        );
      }

      // 2. APIコール
      showToast('🚀 Minting ETF Tokens...', 'info');
      const strategyData = {
        ownerPubkey: wallet.publicKey.toBase58(),
        name: strategyName,
        ticker: safeSymbol,
        description: description,
        type: 'BALANCED',
        tokens: safeTokens.map((t) => ({
          symbol: t.symbol,
          weight: t.weight,
          logoURI: t.logoURI,
        })),
        tvl: amountUsdc,
      };

      const result = await api.deploy(txSignature, strategyData);

      if (!result.success) throw new Error(result.error || 'Deployment API failed');

      showToast(`✅ ${safeSymbol} Deployed Successfully!`, 'success');
      setIsDepositModalOpen(false);
      setIsDeploying(false);

      if (onDeploySuccess) {
        onDeploySuccess(result.mintAddress || result.strategyId, amountUsdc, depositAsset);
      } else {
        onComplete();
      }
    } catch (e: any) {
      showToast(`Failed: ${e.message}`, 'error');
      setIsDeploying(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-8 duration-500 text-white">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-serif font-normal text-white/90 mb-1">
          This is Your ETF-Token
        </h2>
        <p className="text-white/40 text-sm">Review your ETF specifications.</p>
      </div>

      <div className="backdrop-blur-sm bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden mb-6">
        <div className="relative border-b border-white/[0.08] pb-5 mb-6 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 border border-white/10 rounded-xl flex items-center justify-center bg-white/5 overflow-hidden">
              <img src="/ETFtoken.png" alt="Strategy Icon" className="w-full h-full object-cover" />
            </div>
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
          onClick={handleInitialDeployClick}
          disabled={isDeploying}
          className="flex-1 py-4 bg-gradient-to-r from-[#6B4420] via-[#B8863F] to-[#E8C890] text-[#080503] font-normal rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20"
        >
          <Wallet className="w-5 h-5" /> Deposit & Mint
        </motion.button>
      </div>

      <AnimatePresence>
        {isDepositModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDepositModalOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#140E08] border border-[rgba(184,134,63,0.15)] rounded-3xl p-6 z-50 shadow-2xl"
            >
              <h3 className="text-xl font-normal text-[#F2E0C8] mb-4">Initial Liquidity</h3>
              <div className="mb-6">
                <label className="text-xs text-[#B89860] mb-1 block">Deposit Amount (USDC)</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full p-4 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-xl text-xl font-normal text-[#F2E0C8] focus:border-[#B8863F] outline-none transition-colors"
                />
              </div>
              <button
                onClick={handleConfirmDeploy}
                disabled={isDeploying}
                className="w-full py-4 bg-gradient-to-b from-[#F2E0C8] to-[#D4A261] text-[#080503] font-normal rounded-xl flex justify-center gap-2 hover:brightness-110 transition-all"
              >
                {isDeploying ? <Loader2 className="animate-spin" /> : 'Confirm & Mint'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
