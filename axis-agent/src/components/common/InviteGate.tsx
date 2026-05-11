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
// 'tos'      — terms agreement (must complete first, legal gate)
// 'auth'     — wallet connect AND invite code shown side-by-side; users pick
//              whichever path applies to them
// 'checking' — transient whitelist lookup after wallet connect (no UI)
type Step = 'tos' | 'auth' | 'checking';

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
  // Tracks whether we've already auto-run the whitelist check for the
  // currently-connected wallet on this gate render. Without this guard the
  // effect would re-fire every render and DOS the API.
  const [autoCheckedWallet, setAutoCheckedWallet] = useState<string | null>(null);
  const [walletNotWhitelisted, setWalletNotWhitelisted] = useState(false);

  const allAgreed = agreed.tos && agreed.geo && agreed.risk;

  // ── checking step のみが自動遷移する
  useEffect(() => {
    if (step !== 'checking') return;
    if (!publicKey) {
      setStep('auth');
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
        // Not on the whitelist — stay on the auth screen, surface the
        // invite-code section as the next thing for the user to try.
        setWalletNotWhitelisted(true);
        setStep('auth');
      }
    }).catch(() => {
      setWalletNotWhitelisted(true);
      setStep('auth');
    });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-trigger the whitelist lookup the moment a wallet connects on the
  // auth screen. Skips re-running for the same pubkey.
  useEffect(() => {
    if (step !== 'auth' || !publicKey) return;
    const pk = publicKey.toBase58();
    if (autoCheckedWallet === pk) return;
    setAutoCheckedWallet(pk);
    setWalletNotWhitelisted(false);
    setStep('checking');
  }, [step, publicKey, autoCheckedWallet]);

  // ── TOS accept → auth step (combined wallet + code)
  const handleTosAccept = () => {
    if (!allAgreed) return;
    setStep('auth');
  };

  // ── Wallet 接続トリガー（モーダルを開くだけ。接続成功は useEffect 監視）
  const handleConnectWallet = () => {
    openLogin(true);
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

  // Step indicator dots: tos → auth
  const STEP_DOTS = ['tos', 'auth'] as const;
  const currentDotStep: 'tos' | 'auth' = step === 'tos' ? 'tos' : 'auth';

  // ─── Render ────────────────────────────────────────────────────────────────
  // Layout: full-screen dim overlay + a bottom-sheet card that slides up from
  // below. Near-full-width on mobile (`inset-x-2`), capped at `max-w-md` on
  // desktop. Internal content scrolls when it overflows so the sheet itself
  // never grows beyond 92vh.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[10000]"
      style={{ background: 'rgba(3,2,0,0.92)' }}
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

      {/* Bottom-sheet card — extends from a few px below the top edge down to
          the bottom edge on mobile so it's effectively a full-height sheet
          (still slides up from below for the bottom-sheet feel). On desktop
          it caps at max-w-md and gets a small frame around it. */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.7 }}
        className="absolute inset-x-2 top-3 bottom-0 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-6 sm:bottom-6 sm:w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #110C06 0%, #0A0602 100%)',
          border: '1px solid rgba(184,134,63,0.16)',
          boxShadow: '0 -32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(184,134,63,0.06)',
        }}
      >
        {/* Drag handle (mobile cue). Purely visual — sheet isn't draggable. */}
        <div className="flex justify-center pt-3 sm:hidden shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/15" />
        </div>

        {/* Logo header inside the sheet — replaces the floating logo that
            was hidden once we extended the sheet to the top of the screen. */}
        <div className="flex items-center gap-3 px-5 pt-3 sm:px-7 sm:pt-6 shrink-0">
          <img src="/logo.webp" alt="Axis" className="h-6 w-auto" />
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
        </div>

        {/* Inner glow top */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse, rgba(184,134,63,0.15) 0%, transparent 70%)',
            filter: 'blur(16px)',
          }}
        />

        <div className="relative px-5 pt-5 pb-6 sm:px-7 sm:pt-6 sm:pb-7 overflow-y-auto flex-1 min-h-0">
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
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-[#B8863F]" />
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#B8863F]">
                    Step 1 of 3
                  </p>
                </div>
                <h2 className="font-serif text-[26px] font-normal text-[#F2E0C8] leading-tight tracking-tight mb-2">
                  Before you continue
                </h2>
                <p className="text-white/55 text-[13px] mb-5 leading-snug">
                  Three things you should know. Full details on the{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#E8C890] underline underline-offset-2 hover:text-[#F2E0C8]"
                  >
                    Terms page
                  </a>
                  .
                </p>

                {/* Three risk bullets. Each is a card so the eye can scan
                    them, with readable white-on-dark text instead of the
                    previous dark-amber-on-dark which was nearly invisible. */}
                <div className="space-y-2.5 mb-5">
                  <div className="flex gap-3 rounded-xl px-3.5 py-3 bg-white/[0.03] border border-white/[0.06]">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#F2E0C8] font-normal mb-0.5 leading-snug">
                        Real money, beta software
                      </p>
                      <p className="text-[12px] text-white/55 leading-snug">
                        Mainnet. Smart contracts are unaudited and may have bugs that lose funds.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-xl px-3.5 py-3 bg-white/[0.03] border border-white/[0.06]">
                    <AlertTriangle className="w-4 h-4 text-rose-400/80 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#F2E0C8] font-normal mb-0.5 leading-snug">
                        Restricted regions
                      </p>
                      <p className="text-[12px] text-white/55 leading-snug">
                        Not for U.S. persons or residents of Cuba, Iran, North Korea, Syria, Russia, or Belarus.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-xl px-3.5 py-3 bg-white/[0.03] border border-white/[0.06]">
                    <FileText className="w-4 h-4 text-[#B8863F] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#F2E0C8] font-normal mb-0.5 leading-snug">
                        Not financial advice
                      </p>
                      <p className="text-[12px] text-white/55 leading-snug">
                        Nothing here is investment advice. ETF tokens are not registered securities.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Checkboxes — white text on dark for legibility (was
                    dark-amber-on-dark before, basically unreadable). */}
                {(
                  [
                    {
                      key: 'tos' as const,
                      label: (
                        <>
                          I've read the{' '}
                          <a
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#E8C890] underline underline-offset-2 hover:text-[#F2E0C8]"
                          >
                            Terms of Service
                          </a>{' '}
                          and accept this is unaudited beta software.
                        </>
                      ),
                    },
                    {
                      key: 'geo' as const,
                      label:
                        'I am not a U.S. person and not in a restricted jurisdiction.',
                    },
                    {
                      key: 'risk' as const,
                      label:
                        'I accept I may lose all funds and take full responsibility.',
                    },
                  ] as const
                ).map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-start gap-2.5 mb-2.5 cursor-pointer select-none"
                  >
                    <div
                      className="mt-0.5 w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center transition-all duration-150"
                      style={{
                        background: agreed[key]
                          ? 'rgba(184,134,63,0.85)'
                          : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${agreed[key] ? '#B8863F' : 'rgba(255,255,255,0.18)'}`,
                      }}
                      onClick={() => toggle(key)}
                    >
                      {agreed[key] && (
                        <svg width="10" height="8" viewBox="0 0 9 7" fill="none">
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
                      className="text-[12.5px] text-white/75 leading-relaxed"
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
                  className="w-full mt-3 flex items-center justify-center gap-2 py-[14px] rounded-2xl font-normal text-[15px] transition-all duration-300 disabled:opacity-35"
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

            {/* ── Step 2: Auth (wallet + invite code together) ───────── */}
            {step === 'auth' && (
              <motion.div
                key="auth"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-[#B8863F]" />
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#B8863F]">
                    Step 2 of 3
                  </p>
                </div>
                <h2 className="font-serif text-[26px] font-normal text-[#F2E0C8] leading-tight tracking-tight mb-2">
                  Connect your wallet
                </h2>
                <p className="text-white/55 text-[13px] mb-5 leading-snug">
                  We'll check it against the early-access list.
                </p>

                {/* DevnetMVP notice */}
                <div className="flex gap-2.5 items-start rounded-xl px-3.5 py-3 mb-4 bg-white/[0.03] border border-white/[0.06]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#B8863F]" />
                  <span className="text-[12.5px] text-white/70 leading-snug">
                    Use the wallet you had on the{' '}
                    <strong className="text-[#E8C890] font-normal">Axis Devnet MVP</strong>. If
                    it's on the early-access list you'll skip the invite step.
                  </span>
                </div>

                {/* ── Wallet section ───────────────────────────────────── */}
                {publicKey ? (
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-4"
                    style={{
                      background: 'rgba(52,211,153,0.06)',
                      border: '1px solid rgba(52,211,153,0.2)',
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-emerald-400/70 uppercase tracking-widest font-mono mb-0.5">
                        Wallet connected
                      </p>
                      <p className="text-[13px] font-mono text-[#F2E0C8] truncate">
                        {publicKey.toBase58().slice(0, 6)}…{publicKey.toBase58().slice(-6)}
                      </p>
                    </div>
                    <button
                      onClick={handleConnectWallet}
                      className="text-[10px] text-white/45 hover:text-white/70 transition-colors px-2 py-1 shrink-0"
                    >
                      change
                    </button>
                  </div>
                ) : (
                  <>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleConnectWallet}
                      className="w-full group relative flex items-center gap-4 px-5 py-4 rounded-2xl overflow-hidden transition-all duration-300 mb-2"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(153,69,255,0.10) 0%, rgba(20,241,149,0.06) 100%)',
                        border: '1px solid rgba(153,69,255,0.25)',
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
                        <p className="text-white/50 text-[12px] mt-0.5">
                          Phantom · Solflare · Backpack
                        </p>
                      </div>
                      <span className="relative text-[#9945ff]/40 group-hover:text-[#9945ff]/70 transition-colors text-lg">›</span>
                    </motion.button>
                    {isDirectAvailable && (
                      <button
                        type="button"
                        onClick={() => {
                          void connectDirect().catch((e) => {
                            console.warn('[axis] direct phantom connect failed', e);
                          });
                        }}
                        disabled={isDirectConnecting}
                        className="w-full text-center text-[11.5px] text-white/45 hover:text-white/70 transition-colors py-1 disabled:opacity-50"
                      >
                        {isDirectConnecting
                          ? 'connecting Phantom…'
                          : 'Privy not loading? → Connect Phantom directly'}
                      </button>
                    )}
                  </>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-white/[0.08]" />
                  <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                    or use invite code
                  </span>
                  <div className="flex-1 h-px bg-white/[0.08]" />
                </div>

                {/* ── Invite code section ──────────────────────────────── */}
                {walletNotWhitelisted && publicKey && (
                  <p className="text-[11.5px] text-amber-300/80 mb-2 leading-snug">
                    This wallet isn't on the early-access list. Enter an invite code to continue.
                  </p>
                )}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-2 transition-all duration-200 bg-white/[0.03]"
                  style={{
                    border: codeError
                      ? '1px solid rgba(239,68,68,0.45)'
                      : '1px solid rgba(255,255,255,0.10)',
                  }}
                >
                  <KeyRound className="w-4 h-4 text-white/35 shrink-0" />
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setCodeError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleCodeSubmit()}
                    placeholder="AXIS-XXXX"
                    className="flex-1 min-w-0 bg-transparent text-[#F2E0C8] placeholder-white/30 text-[15px] outline-none tracking-widest font-mono"
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
                  disabled={!code.trim() || codeLoading || !publicKey}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-[14px] rounded-2xl font-normal text-[15px] transition-all duration-300 disabled:opacity-35"
                  style={{
                    background:
                      'linear-gradient(135deg, #B8863F 0%, #D97706 50%, #F59E0B 100%)',
                    color: '#0C0A09',
                    boxShadow: '0 4px 24px rgba(184,134,63,0.22)',
                  }}
                  title={!publicKey ? 'Connect a wallet first' : undefined}
                >
                  {codeLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {publicKey ? 'Verify & Enter' : 'Connect wallet first'}{' '}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </motion.button>

                <p className="text-center text-[11.5px] text-white/45 mt-5">
                  Don't have a code?{' '}
                  <a
                    href="https://x.com/Axis_xyz_"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#E8C890]/80 hover:text-[#F2E0C8] transition-colors underline underline-offset-2"
                  >
                    Request access →
                  </a>
                </p>
              </motion.div>
            )}

            {/* ── Checking (transient spinner overlay) ────────────────── */}
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
                <p className="text-white/55 text-[12px] tracking-widest uppercase">
                  Verifying access…
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
