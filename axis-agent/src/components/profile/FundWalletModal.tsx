import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ArrowLeftRight,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowDown,
  Wallet,
  Copy,
  CheckCheck,
  ExternalLink,
} from 'lucide-react';
import { Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { useWallet, useConnection } from '../../hooks/useWallet';
import { getUsdcBalance } from '../../services/usdc';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
const USDC_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png';
const JUPITER_API = 'https://quote-api.jup.ag/v6';
const JUPITER_API_KEY = import.meta.env.VITE_JUPITER_API_KEY as string | undefined;

function jupiterHeaders(): HeadersInit {
  return JUPITER_API_KEY
    ? { 'Content-Type': 'application/json', 'x-api-key': JUPITER_API_KEY }
    : { 'Content-Type': 'application/json' };
}

type Tab = 'swap' | 'buy';
type SwapStatus = 'idle' | 'quoting' | 'ready' | 'signing' | 'processing' | 'success' | 'error';

interface FundWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const FundWalletModal = ({ isOpen, onClose, onSuccess }: FundWalletModalProps) => {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [copied, setCopied] = useState(false);

  const [tab, setTab] = useState<Tab>('swap');
  const [usdcAmount, setUsdcAmount] = useState('');
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch USDC balance when modal opens
  useEffect(() => {
    if (!isOpen || !publicKey || !connection) return;
    getUsdcBalance(connection, publicKey)
      .then(setUsdcBalance)
      .catch(() => setUsdcBalance(null));
  }, [isOpen, publicKey, connection]);

  // USDC → SOL: outAmount is in lamports
  const estimatedSol = quote
    ? (Number(quote.outAmount) / LAMPORTS_PER_SOL).toFixed(4)
    : null;
  const priceImpact = quote
    ? (Number(quote.priceImpactPct) * 100).toFixed(3)
    : null;

  const fetchQuote = useCallback(async (amount: string) => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setQuote(null); setStatus('idle'); return; }

    setStatus('quoting');
    setError(null);
    try {
      // USDC has 6 decimals
      const usdcUnits = Math.floor(parsed * 1e6);
      const res = await fetch(
        `${JUPITER_API}/quote?inputMint=${USDC_MINT}&outputMint=${SOL_MINT}&amount=${usdcUnits}&slippageBps=50`,
        { headers: jupiterHeaders() }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuote(data);
      setStatus('ready');
    } catch (e: any) {
      setStatus('error');
      setError(e.message || 'Failed to get quote');
      setQuote(null);
    }
  }, []);

  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (!usdcAmount) { setQuote(null); setStatus('idle'); return; }
    quoteTimer.current = setTimeout(() => fetchQuote(usdcAmount), 600);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [usdcAmount, fetchQuote]);

  const handleSwap = async () => {
    if (!quote || !publicKey || !signTransaction) return;
    setStatus('signing');
    setError(null);
    try {
      const swapRes = await fetch(`${JUPITER_API}/swap`, {
        method: 'POST',
        headers: jupiterHeaders(),
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          asLegacyTransaction: true,
        }),
      });
      const body = await swapRes.json();
      if (body.error) throw new Error(body.error);

      const tx = Transaction.from(Buffer.from(body.swapTransaction, 'base64'));

      setStatus('processing');
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(sig, 'confirmed');
      setTxSignature(sig);
      setStatus('success');
      onSuccess?.();
    } catch (e: any) {
      setStatus('error');
      setError(e.message?.slice(0, 200) || 'Swap failed');
    }
  };

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTab('swap');
      setUsdcAmount('');
      setQuote(null);
      setStatus('idle');
      setError(null);
      setTxSignature(null);
    }
  }, [isOpen]);

  const isSwapping = status === 'signing' || status === 'processing';
  const canSwap = !!quote && !isSwapping && status !== 'quoting';

  const handleCopy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
            style={{ background: '#0C0A09', border: '1px solid rgba(184,134,63,0.2)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="font-serif text-lg text-[#F2E0C8]">Fund Wallet</h2>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/5">
              {([['swap', ArrowLeftRight, 'Swap'], ['buy', CreditCard, 'Buy with Card']] as const).map(
                ([key, Icon, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-normal transition-colors ${
                      tab === key
                        ? 'text-[#E8C890] border-b-2 border-[#B8863F]'
                        : 'text-white/40 hover:text-white/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                )
              )}
            </div>

            {/* Swap Tab */}
            {tab === 'swap' && (
              <div className="p-5 space-y-3">
                {status === 'success' ? (
                  <div className="flex flex-col items-center py-8 gap-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                    <p className="font-serif text-xl text-[#F2E0C8]">Swap Complete</p>
                    <p className="text-white/40 text-sm text-center">SOL has been added to your wallet</p>
                    {txSignature && (
                      <a
                        href={`https://explorer.solana.com/tx/${txSignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-[#B8863F] hover:text-[#E8C890] transition-colors"
                      >
                        View on Explorer <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      onClick={onClose}
                      className="w-full py-3 rounded-xl text-sm font-normal text-[#E8C890]"
                      style={{ background: 'rgba(184,134,63,0.15)', border: '1px solid rgba(184,134,63,0.2)' }}
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    {/* USDC Input */}
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: '#140E08', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-white/40 uppercase tracking-widest">You Pay</span>
                        <div className="flex items-center gap-1.5">
                          <Wallet className="w-3 h-3 text-white/25" />
                          <span className="text-[10px] font-mono text-white/40">
                            {usdcBalance === null
                              ? <span className="inline-block w-10 h-3 bg-white/10 rounded animate-pulse" />
                              : `${usdcBalance.toFixed(2)} USDC`}
                          </span>
                          {usdcBalance !== null && usdcBalance > 0 && (
                            <button
                              onClick={() => setUsdcAmount(usdcBalance.toFixed(2))}
                              className="text-[10px] text-[#B8863F] hover:text-[#E8C890] transition-colors"
                            >
                              MAX
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <img src={USDC_LOGO} alt="USDC" className="w-6 h-6 rounded-full" />
                          <span className="text-sm font-normal text-white">USDC</span>
                        </div>
                        <input
                          type="number"
                          value={usdcAmount}
                          onChange={(e) => setUsdcAmount(e.target.value)}
                          placeholder="0.00"
                          disabled={isSwapping}
                          className="flex-1 bg-transparent text-2xl font-normal text-white text-right focus:outline-none placeholder:text-white/15 disabled:opacity-50 min-w-0"
                        />
                      </div>
                    </div>

                    {/* Arrow divider */}
                    <div className="flex justify-center">
                      <div
                        className="p-2 rounded-full"
                        style={{ background: 'rgba(184,134,63,0.08)', border: '1px solid rgba(184,134,63,0.15)' }}
                      >
                        <ArrowDown className="w-4 h-4 text-[#B8863F]/70" />
                      </div>
                    </div>

                    {/* SOL Output */}
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: '#140E08', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <span className="text-[10px] text-white/40 uppercase tracking-widest block mb-3">
                        You Receive
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <img src={SOL_LOGO} alt="SOL" className="w-6 h-6 rounded-full" />
                          <span className="text-sm font-normal text-white">SOL</span>
                        </div>
                        <div className="flex-1 text-right">
                          {status === 'quoting' ? (
                            <span className="inline-block w-20 h-7 bg-white/10 rounded animate-pulse" />
                          ) : (
                            <span className={`text-2xl font-normal ${estimatedSol ? 'text-[#F2E0C8]' : 'text-white/20'}`}>
                              {estimatedSol ?? '0.0000'}
                            </span>
                          )}
                        </div>
                      </div>
                      {priceImpact && (
                        <p className="text-[10px] text-white/25 mt-2 font-mono text-right">
                          Price impact: {priceImpact}% · Slippage: 0.5%
                        </p>
                      )}
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <span className="text-xs text-red-400 leading-relaxed">{error}</span>
                      </div>
                    )}

                    <button
                      onClick={handleSwap}
                      disabled={!canSwap}
                      className="w-full py-4 rounded-xl font-normal text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:scale-[1.01] active:enabled:scale-[0.99]"
                      style={{ background: 'linear-gradient(135deg, #6B4420, #B8863F)', color: '#0C0A09' }}
                    >
                      {isSwapping ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {status === 'signing' ? 'Sign in Wallet...' : 'Processing...'}
                        </>
                      ) : (
                        <>
                          <img src={USDC_LOGO} alt="" className="w-4 h-4 rounded-full" />
                          Swap USDC → SOL
                          <img src={SOL_LOGO} alt="" className="w-4 h-4 rounded-full" />
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Deposit Address Tab */}
            {tab === 'buy' && (
              <div className="p-6 flex flex-col gap-5">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="p-3 rounded-2xl bg-white">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${publicKey?.toBase58() ?? ''}&bgcolor=ffffff&color=0C0A09`}
                      alt="Wallet QR"
                      className="w-40 h-40 rounded-lg"
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="rounded-2xl p-4" style={{ background: '#140E08', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <img src={SOL_LOGO} alt="SOL" className="w-3 h-3 rounded-full" />
                    Solana Address
                  </p>
                  <p className="font-mono text-xs text-[#F2E0C8] break-all leading-relaxed">
                    {publicKey?.toBase58()}
                  </p>
                </div>

                {/* Copy button */}
                <button
                  onClick={handleCopy}
                  className="w-full py-4 rounded-xl font-normal text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={copied
                    ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }
                    : { background: 'linear-gradient(135deg, #6B4420, #B8863F)', color: '#0C0A09' }
                  }
                >
                  {copied ? (
                    <><CheckCheck className="w-4 h-4" />Copied!</>
                  ) : (
                    <><Copy className="w-4 h-4" />Copy Address</>
                  )}
                </button>

                <p className="text-[10px] text-white/25 text-center leading-relaxed">
                  Send SOL from any exchange or wallet to this address
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
