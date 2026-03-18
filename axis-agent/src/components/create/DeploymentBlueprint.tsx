import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ShieldCheck, Wallet, Loader2 } from 'lucide-react';
import { useConnection } from '../../hooks/useWallet';
import { Transaction } from '@solana/web3.js';
import { useWallet } from '../../hooks/useWallet';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import { SERVER_WALLET_PUBKEY } from '../../config/constants';
import { getOrCreateUsdcAta, createUsdcTransferIx, getUsdcBalance } from '../../services/usdc';
import { Buffer } from 'buffer';

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
  // Default values handle the null case; no early return needed
  if (!tokens) {
    // logging or handling if needed
  }

  const { connection } = useConnection();
  const wallet = useWallet();
  const { showToast } = useToast();

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('0');
  const [depositAsset, setDepositAsset] = useState<'SOL' | 'USDC'>('USDC');
  const [isDeploying, setIsDeploying] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  // Fetch balance when modal opens
  const handleInitialDeployClickWithBalance = async () => {
    setIsDepositModalOpen(true);
    if (wallet.publicKey) {
      const bal = await getUsdcBalance(connection, wallet.publicKey);
      setUsdcBalance(bal);
    }
  };

  const safeSymbol = info?.symbol || 'ETF';
  const safeTokens = Array.isArray(tokens) ? tokens : [];


  const handleConfirmDeploy = async () => {
    if (!depositAmount) return;
    if (!wallet.publicKey || !wallet.signTransaction) {
      showToast('Wallet not connected', 'error');
      return;
    }

    setIsDeploying(true);

    try {
      const amountUsdc = parseFloat(depositAmount);

      // 1. Transfer USDC
      let txSignature = '';
      if (amountUsdc > 0) {
        // Pre-check balance to surface a clear error before wallet rejects
        const balance = await getUsdcBalance(connection, wallet.publicKey);
        if (balance < amountUsdc) {
          showToast(
            `Insufficient USDC: you have ${balance.toFixed(2)} but need ${amountUsdc} USDC. Use the faucet to get devnet USDC.`,
            'error'
          );
          setIsDeploying(false);
          return;
        }

        showToast(`Sending ${amountUsdc} USDC to Vault...`, 'info');

        // Derive ATA addresses
        const { ata: fromAta, instruction: createFromIx } = await getOrCreateUsdcAta(
          connection, wallet.publicKey, wallet.publicKey
        );
        const { ata: toAta, instruction: createToIx } = await getOrCreateUsdcAta(
          connection, wallet.publicKey, SERVER_WALLET_PUBKEY
        );

        // Check ATA existence — only add create instruction if missing
        const [fromAtaInfo, toAtaInfo] = await Promise.all([
          connection.getAccountInfo(fromAta),
          connection.getAccountInfo(toAta),
        ]);

        if (!fromAtaInfo) {
          throw new Error(
            'USDC token account not found. Please get Axis devnet USDC from the faucet first.\n' +
            `(USDC mint: Gh9ZwEmd...)`
          );
        }

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

        const transaction = new Transaction();
        transaction.recentBlockhash = blockhash;
        // 一時的にユーザーを feePayer に設定（シリアライズに必要）
        transaction.feePayer = wallet.publicKey;

        // Only add ATA creation if it doesn't exist yet
        if (!toAtaInfo) transaction.add(createToIx);
        void createFromIx; // fromAta already exists

        transaction.add(createUsdcTransferIx(fromAta, toAta, wallet.publicKey, amountUsdc));

        // 運営ウォレットにガス代を委任
        let txToSign = transaction;
        try {
          const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
          const { transaction: feePayerSignedBase64 } = await api.signAsFeePayer(
            Buffer.from(serialized).toString('base64')
          );
          txToSign = Transaction.from(Buffer.from(feePayerSignedBase64, 'base64'));
        } catch {
          // バックエンドが失敗した場合はユーザーがガス代を負担するフォールバック
        }

        const signed = await wallet.signTransaction(txToSign);

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const sim = await connection.simulateTransaction(signed);
        if (sim.value.err) {
          const logs = sim.value.logs?.join('\n') ?? '(no logs)';
          console.error('[Simulation failed]', sim.value.err, '\nLogs:\n', logs);
          throw new Error(`Preflight failed: ${JSON.stringify(sim.value.err)}\n\n${logs}`);
        }
        console.log('[Simulation passed]', sim.value.logs);

        txSignature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: true,
          maxRetries: 5,
        });
        showToast('Confirming transaction...', 'info');
        const confirmation = await connection.confirmTransaction(
          { signature: txSignature, blockhash, lastValidBlockHeight },
          'confirmed'
        );
        if (confirmation.value.err) {
          console.error('[Transaction failed on-chain]', confirmation.value.err);
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
        }
      }

      // 2. API call
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
                onClick={() => setIsDepositModalOpen(false)}
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

              {/* USDC残高表示 */}
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs text-[#B89860]">Your USDC Balance</span>
                <span className={`text-xs font-mono font-normal ${usdcBalance === 0 ? 'text-red-400' : 'text-[#F2E0C8]'}`}>
                  {usdcBalance === null ? '...' : `${usdcBalance.toFixed(2)} USDC`}
                </span>
              </div>

              <div className="mb-4">
                <label className="text-xs text-[#B89860] mb-1 block">Deposit Amount (USDC)</label>
                <input
                  type="number"
                  min="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full p-4 bg-[#080503] border border-[rgba(184,134,63,0.15)] rounded-xl text-xl font-normal text-[#F2E0C8] focus:border-[#B8863F] outline-none transition-colors"
                />
                <p className="text-[11px] text-white/30 mt-1.5 px-1">
                  You can mint with 0 USDC and deposit later.
                </p>
              </div>

              {usdcBalance === 0 && (
                <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  No devnet USDC found. Mint with 0 USDC or get some from the faucet first.
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
