/**
 * InviteGate — Full-screen access guard.
 *
 * Flow:
 *   1. TERMS & DISCLOSURES  (always first)
 *   2. CONNECT WALLET        (with DevnetMVP guidance)
 *   3. AUTO-CHECK            POST /invite/verify { wallet }
 *      ├─ allowed: true  →  grant access immediately
 *      └─ allowed: false →  INVITE CODE input step
 *   4. INVITE CODE           POST /invite/verify { code }
 *                            POST /invite/use     { code, wallet }
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Loader2, CheckCircle2, ArrowRight,
  AlertTriangle, Wallet, KeyRound,
} from 'lucide-react';
import { useWallet, useLoginModal } from '../../hooks/useWallet';

// ─── Constants ────────────────────────────────────────────────────────────────
export const INVITE_GRANTED_KEY = 'axis-invite-granted-v1';
export const TOS_AGREED_KEY     = 'axis-tos-agreed-v1';
export const TOS_VERSION        = '0.1-beta';

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://axis-api-mainnet.yusukekikuta-05.workers.dev';

// ─── Types ────────────────────────────────────────────────────────────────────
// 'checking' is a transient state (no UI rendered — auto-advances)
type Step = 'tos' | 'wallet' | 'checking' | 'code';

interface InviteGateProps {
  onGranted: () => void;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function checkWallet(
  wallet: string
): Promise<{ allowed: boolean; tier?: 'A' | 'B' }> {
  const res = await fetch(`${API_BASE}/invite/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) return { allowed: false };
  return res.json();
}

async function verifyCode(
  code: string
): Promise<{ valid: boolean; reason?: string }> {
  const res = await fetch(`${API_BASE}/invite/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { valid: false, reason: 'Server error' };
  return res.json();
}

async function useCode(
  code: string,
  wallet: string
): Promise<{ success: boolean; reason?: string }> {
  const res = await fetch(`${API_BASE}/invite/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, wallet }),
  });
  if (!res.ok) return { success: false };
  return res.json();
}

// ─── Main gate ────────────────────────────────────────────────────────────────
export const InviteGate = ({ onGranted }: InviteGateProps) => {
  const { publicKey } = useWallet();
  const {
    setVisible: openLogin,
    connectDirect,
    isDirectAvailable,
    isDirectConnecting,
  } = useLoginModal();

  const [step,      setStep]      = useState<Step>('tos');
  const [agreed,    setAgreed]    = useState({ tos: false, geo: false, risk: false });
  const [code,      setCode]      = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  const allAgreed = agreed.tos && agreed.geo && agreed.risk;

  // ── checking step のみが自動遷移する（wallet ステップは必ず明示的ボタン操作が必要）
  useEffect(() => {
    if (step !== 'checking') return;
    if (!publicKey) {
      // checkingに来たのにwalletが消えた → walletステップに戻す
      setStep('wallet');
      return;
    }

    checkWallet(publicKey.toBase58()).then((result) => {
      if (result.allowed) {
        localStorage.setItem(
          TOS_AGREED_KEY,
          JSON.stringify({ timestamp: new Date().toISOString(), version: TOS_VERSION })
        );
        onGranted();
      } else {
        setStep('code');
      }
    }).catch(() => setStep('code'));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TOS accept → 常に wallet ステップへ（既接続でもスキップしない）
  const handleTosAccept = () => {
    if (!allAgreed) return;
    setStep('wallet');
  };

  // ── Wallet ステップ: 未接続ならモーダルを開く、接続済みなら checking へ進む
  const handleConnectWallet = () => {
    openLogin(true);
  };

  const handleVerifyWallet = () => {
    if (!publicKey) return;
    setStep('checking');
  };

  // ── Invite code submit ────────────────────────────────────────────────────
  const handleCodeSubmit = async () => {
    if (!code.trim() || codeLoading || !publicKey) return;
    setCodeLoading(true);
    setCodeError(null);

    try {
      const v = await verifyCode(code.trim().toUpperCase());
      if (!v.valid) {
        setCodeError(v.reason || 'Invalid invite code');
        return;
      }
      const u = await useCode(code.trim().toUpperCase(), publicKey.toBase58());
      if (!u.success) {
        setCodeError(u.reason || 'Failed to redeem code');
        return;
      }
      localStorage.setItem(
        TOS_AGREED_KEY,
        JSON.stringify({ timestamp: new Date().toISOString(), version: TOS_VERSION })
      );
      onGranted();
    } catch {
      setCodeError('Network error — please try again');
    } finally {
      setCodeLoading(false);
    }
  };

  const toggle = (key: keyof typeof agreed) =>
    setAgreed((prev) => ({ ...prev, [key]: !prev[key] }));

  // Step indicator dots: tos → wallet/checking → code
  const STEP_DOTS = ['tos', 'wallet', 'code'] as const;
  const currentDotStep =
    step === 'checking' ? 'wallet' : step;

  // ─── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center"
      style={{ background: '#030200' }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(184,134,63,0.6) 1px, transparent 1px),
            linear-gradient(90deg, rgba(184,134,63,0.6) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Radial ambient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 50% at 50% 0%, rgba(184,134,63,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 50% 100%, rgba(184,134,63,0.04) 0%, transparent 60%)
          `,
        }}
      />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="absolute top-12 left-6 flex items-center gap-3"
      >
        <img src="/logo.svg" alt="Axis" className="h-7 w-auto" />
        <span
          className="text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full"
          style={{
            color: '#B8863F',
            border: '1px solid rgba(184,134,63,0.22)',
            background: 'rgba(184,134,63,0.06)',
          }}
        >
          Mainnet Beta
        </span>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[360px] mx-6 rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #110C06 0%, #0A0602 100%)',
          border: '1px solid rgba(184,134,63,0.16)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(184,134,63,0.06)',
        }}
      >
        {/* Inner glow top */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse, rgba(184,134,63,0.15) 0%, transparent 70%)',
            filter: 'blur(16px)',
          }}
        />

        <div className="relative px-7 pt-8 pb-7">
          <AnimatePresence mode="wait">

            {/* ── Step 1: Terms & Disclosures ─────────────────────────── */}
            {step === 'tos' && (
              <motion.div
                key="tos"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-[#B8863F]" />
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#B8863F]">
                    Step 1 of 3 — Review Required
                  </p>
                </div>
                <h2 className="font-serif text-[28px] font-normal text-[#F2E0C8] leading-tight tracking-tight mb-1">
                  Terms &<br />Disclosures
                </h2>
                <p className="text-[#4A2F0A] text-[13px] mb-5">
                  Read carefully before proceeding.
                </p>

                {/* Scrollable ToS */}
                <div
                  className="rounded-xl p-3 mb-3 max-h-[128px] overflow-y-auto text-[11px] leading-relaxed font-mono"
                  style={{
                    background: 'rgba(184,134,63,0.03)',
                    border: '1px solid rgba(184,134,63,0.1)',
                    color: 'rgba(74,47,10,0.9)',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(184,134,63,0.2) transparent',
                  }}
                >
                  <p className="mb-2">
                    <span style={{ color: 'rgba(184,134,63,0.55)' }}>BETA SOFTWARE DISCLAIMER</span>
                    <br />
                    This Protocol is unaudited beta software. Smart contracts may contain bugs or
                    vulnerabilities resulting in partial or complete loss of funds.
                  </p>
                  <p className="mb-2">
                    <span style={{ color: 'rgba(184,134,63,0.55)' }}>GEOGRAPHIC RESTRICTIONS</span>
                    <br />
                    Not available to U.S. persons or residents of sanctioned jurisdictions
                    (Cuba, Iran, North Korea, Syria, Russia, Belarus).
                  </p>
                  <p className="mb-2">
                    <span style={{ color: 'rgba(184,134,63,0.55)' }}>NO FINANCIAL ADVICE</span>
                    <br />
                    Nothing constitutes financial, investment, or legal advice. ETF basket tokens
                    are not registered securities.
                  </p>
                  <p className="mb-2">
                    <span style={{ color: 'rgba(184,134,63,0.55)' }}>LIMITATION OF LIABILITY</span>
                    <br />
                    Axis Inc. shall not be liable for any loss of funds arising from use of this
                    Protocol. Provided "as is" without warranty.
                  </p>
                  <p>
                    Full{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'rgba(184,134,63,0.6)', textDecoration: 'underline' }}
                    >
                      Terms of Service →
                    </a>
                  </p>
                </div>

                {/* Geo warning */}
                <div
                  className="flex gap-2 items-start rounded-xl px-3 py-2.5 mb-3 text-[11px] font-mono leading-relaxed"
                  style={{
                    background: 'rgba(139,48,16,0.08)',
                    border: '1px solid rgba(139,48,16,0.2)',
                    color: 'rgba(139,80,48,0.9)',
                  }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    U.S. persons and residents of sanctioned jurisdictions are strictly prohibited
                    from accessing this Protocol.
                  </span>
                </div>

                {/* Checkboxes */}
                {(
                  [
                    {
                      key: 'tos' as const,
                      label: (
                        <>
                          I have read and agree to the{' '}
                          <a
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'rgba(184,134,63,0.6)', textDecoration: 'underline' }}
                          >
                            Terms of Service
                          </a>{' '}
                          and understand this is unaudited beta software.
                        </>
                      ),
                    },
                    {
                      key: 'geo' as const,
                      label:
                        'I confirm I am not a U.S. person and am not located in or a citizen of any restricted jurisdiction.',
                    },
                    {
                      key: 'risk' as const,
                      label:
                        'I acknowledge I may lose all funds and accept full responsibility for my participation.',
                    },
                  ] as const
                ).map(({ key, label }) => (
                  <label key={key} className="flex items-start gap-2.5 mb-2.5 cursor-pointer">
                    <div
                      className="mt-0.5 w-[15px] h-[15px] rounded shrink-0 flex items-center justify-center transition-all duration-150"
                      style={{
                        background: agreed[key]
                          ? 'rgba(184,134,63,0.85)'
                          : 'rgba(184,134,63,0.06)',
                        border: `1px solid ${agreed[key] ? '#B8863F' : 'rgba(184,134,63,0.25)'}`,
                      }}
                      onClick={() => toggle(key)}
                    >
                      {agreed[key] && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path
                            d="M1 3.5L3.5 6L8 1"
                            stroke="#0C0A09"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span
                      className="text-[11.5px] font-mono leading-relaxed"
                      style={{ color: 'rgba(74,47,10,0.9)' }}
                      onClick={() => toggle(key)}
                    >
                      {label}
                    </span>
                  </label>
                ))}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleTosAccept}
                  disabled={!allAgreed}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-[14px] rounded-2xl font-normal text-[15px] transition-all duration-300 disabled:opacity-35"
                  style={{
                    background:
                      'linear-gradient(135deg, #B8863F 0%, #D97706 50%, #F59E0B 100%)',
                    color: '#0C0A09',
                    boxShadow: '0 4px 24px rgba(184,134,63,0.22)',
                  }}
                >
                  I agree — Continue <ArrowRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}

            {/* ── Step 2: Connect Wallet ──────────────────────────────── */}
            {step === 'wallet' && (
              <motion.div
                key="wallet"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="w-4 h-4 text-[#B8863F]" />
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#B8863F]">
                    Step 2 of 3 — Connect Wallet
                  </p>
                </div>
                <h2 className="font-serif text-[28px] font-normal text-[#F2E0C8] leading-tight tracking-tight mb-1">
                  Connect your<br />wallet
                </h2>
                <p className="text-[#4A2F0A] text-[13px] mb-5">
                  Your access will be checked against the early-access list.
                </p>

                {/* DevnetMVP notice */}
                <div
                  className="flex gap-2.5 items-start rounded-xl px-3.5 py-3 mb-4 text-[11.5px] font-mono leading-relaxed"
                  style={{
                    background: 'rgba(184,134,63,0.05)',
                    border: '1px solid rgba(184,134,63,0.18)',
                    color: 'rgba(184,134,63,0.8)',
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#B8863F]" />
                  <span>
                    Please connect the wallet you used on the{' '}
                    <strong className="text-[#E8C890]">Axis Devnet MVP</strong>.
                    If your wallet is on the early-access list, you'll enter directly — no invite code needed.
                  </span>
                </div>

                {publicKey ? (
                  /* ── Wallet already connected: show address + verify button ── */
                  <>
                    <div
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-4"
                      style={{
                        background: 'rgba(52,211,153,0.06)',
                        border: '1px solid rgba(52,211,153,0.2)',
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-[11px] text-emerald-400/70 uppercase tracking-widest font-mono mb-0.5">
                          Wallet connected
                        </p>
                        <p className="text-[13px] font-mono text-[#F2E0C8]">
                          {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-6)}
                        </p>
                      </div>
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleVerifyWallet}
                      className="w-full flex items-center justify-center gap-2 py-[14px] rounded-2xl font-normal text-[15px] transition-all duration-300"
                      style={{
                        background:
                          'linear-gradient(135deg, #B8863F 0%, #D97706 50%, #F59E0B 100%)',
                        color: '#0C0A09',
                        boxShadow: '0 4px 24px rgba(184,134,63,0.22)',
                      }}
                    >
                      Verify Access <ArrowRight className="w-4 h-4" />
                    </motion.button>

                    <button
                      onClick={handleConnectWallet}
                      className="w-full mt-2 text-center text-[11px] text-[#251408] hover:text-[#B8863F]/50 transition-colors py-1"
                    >
                      Use a different wallet
                    </button>
                  </>
                ) : (
                  /* ── Wallet not connected: show connect button ── */
                  <>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleConnectWallet}
                      className="w-full group relative flex items-center gap-4 px-5 py-4 rounded-2xl overflow-hidden transition-all duration-300 mb-3"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(153,69,255,0.08) 0%, rgba(20,241,149,0.05) 100%)',
                        border: '1px solid rgba(153,69,255,0.22)',
                      }}
                    >
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background:
                            'linear-gradient(135deg, rgba(153,69,255,0.14) 0%, rgba(20,241,149,0.08) 100%)',
                        }}
                      />
                      <div
                        className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                        style={{
                          background: 'rgba(153,69,255,0.12)',
                          border: '1px solid rgba(153,69,255,0.2)',
                        }}
                      >
                        <img src="/solanalogo.png" alt="Solana" className="w-6 h-6 object-contain" />
                      </div>
                      <div className="relative text-left flex-1">
                        <p className="text-[#F2E0C8] font-normal text-[15px] leading-tight">
                          Connect with Solana
                        </p>
                        <p className="text-[#7A5A30] text-xs mt-0.5">
                          Phantom · Solflare · Backpack
                        </p>
                      </div>
                      <span className="relative text-[#9945ff]/40 group-hover:text-[#9945ff]/70 transition-colors text-lg">›</span>
                    </motion.button>

                    <p className="text-center text-[11px] text-[#251408] mt-1">
                      By connecting, you agree to our{' '}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#B8863F]/40 hover:text-[#B8863F]/70 transition-colors underline underline-offset-2"
                      >
                        Terms of Service
                      </a>
                    </p>
                    {isDirectAvailable && (
                      <button
                        type="button"
                        onClick={() => {
                          void connectDirect().catch((e) => {
                            console.warn('[axis] direct phantom connect failed', e);
                          });
                        }}
                        disabled={isDirectConnecting}
                        className="mt-3 w-full text-center text-[11px] text-[#7A5A30] hover:text-[#B8863F] transition-colors py-2 disabled:opacity-50"
                      >
                        {isDirectConnecting
                          ? 'connecting Phantom…'
                          : 'Privy not loading? → Connect Phantom directly'}
                      </button>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ── Checking (transient spinner) ────────────────────────── */}
            {step === 'checking' && (
              <motion.div
                key="checking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center py-12 gap-4"
              >
                <Loader2 className="w-8 h-8 text-[#B8863F] animate-spin" />
                <p className="text-[#4A2F0A] text-[13px] font-mono tracking-widest uppercase">
                  Verifying access…
                </p>
              </motion.div>
            )}

            {/* ── Step 3: Invite Code (only if not whitelisted) ───────── */}
            {step === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="w-4 h-4 text-[#B8863F]" />
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#B8863F]">
                    Step 3 of 3 — Invite Code
                  </p>
                </div>
                <h2 className="font-serif text-[28px] font-normal text-[#F2E0C8] leading-tight tracking-tight mb-1">
                  Enter your<br />invite code
                </h2>
                <p className="text-[#4A2F0A] text-[13px] mb-6">
                  Your wallet wasn't found on the early-access list.
                </p>

                <div
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-2 transition-all duration-200"
                  style={{
                    background: 'rgba(184,134,63,0.05)',
                    border: codeError
                      ? '1px solid rgba(239,68,68,0.45)'
                      : '1px solid rgba(184,134,63,0.18)',
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setCodeError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleCodeSubmit()}
                    placeholder="AXIS-XXXX-XXXX"
                    className="flex-1 bg-transparent text-[#F2E0C8] placeholder-[#3A2208]/70 text-[15px] outline-none tracking-widest font-mono"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>

                <AnimatePresence>
                  {codeError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-red-400/75 pl-1 mb-3"
                    >
                      {codeError}
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCodeSubmit}
                  disabled={!code.trim() || codeLoading}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-[14px] rounded-2xl font-normal text-[15px] transition-all duration-300 disabled:opacity-35"
                  style={{
                    background:
                      'linear-gradient(135deg, #B8863F 0%, #D97706 50%, #F59E0B 100%)',
                    color: '#0C0A09',
                    boxShadow: '0 4px 24px rgba(184,134,63,0.22)',
                  }}
                >
                  {codeLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Verify &amp; Enter <ArrowRight className="w-4 h-4" /></>
                  )}
                </motion.button>

                <p className="text-center text-[11px] text-[#251408] mt-5">
                  Don't have a code?{' '}
                  <a
                    href="https://x.com/Axis_xyz_"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B8863F]/40 hover:text-[#B8863F]/70 transition-colors underline underline-offset-2"
                  >
                    Request access →
                  </a>
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Step indicator dots */}
        <div className="flex justify-center gap-1.5 pb-5">
          {STEP_DOTS.map((s) => (
            <div
              key={s}
              className="h-[3px] rounded-full transition-all duration-300"
              style={{
                width: currentDotStep === s ? '20px' : '6px',
                background:
                  currentDotStep === s
                    ? 'linear-gradient(90deg, #B8863F, #F59E0B)'
                    : 'rgba(184,134,63,0.2)',
              }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};
