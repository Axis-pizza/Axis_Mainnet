/**
 * InviteGate — Full-screen access guard.
 *
 * Flow: INVITE CODE → TERMS & DISCLOSURES → CONNECT WALLET (3-step)
 *
 * Validation is a stub; swap validateInviteCode() with a real API call
 * once the backend is ready (POST /invite/verify { code, walletAddress }).
 *
 * ToS agreement is recorded to localStorage with timestamp for legal audit trail.
 * On wallet connect, send both invite code + tos metadata to your backend.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, FileText, Loader2, CheckCircle2, ArrowRight, AlertTriangle } from 'lucide-react';

export const INVITE_GRANTED_KEY = 'axis-invite-granted-v1';
export const TOS_AGREED_KEY = 'axis-tos-agreed-v1';
export const TOS_VERSION = '0.1-beta';

// ---------------------------------------------------------------------------
// Stub validator — swap for real API call later
// ---------------------------------------------------------------------------
async function validateInviteCode(code: string): Promise<boolean> {
  // TODO: replace with POST /invite/verify { code }
  await new Promise((r) => setTimeout(r, 700));
  return code.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Step = 'code' | 'tos' | 'wallet';

interface TosAgreement {
  timestamp: string;
  version: string;
  inviteCode: string;
}

interface InviteGateProps {
  onConnectWallet: () => void;
}

// ---------------------------------------------------------------------------
// Main gate
// ---------------------------------------------------------------------------
export const InviteGate = ({ onConnectWallet }: InviteGateProps) => {
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [agreed, setAgreed] = useState({ tos: false, geo: false, risk: false });

  const allAgreed = agreed.tos && agreed.geo && agreed.risk;

  const handleVerify = async () => {
    if (!code.trim() || status === 'loading') return;
    setStatus('loading');
    const ok = await validateInviteCode(code.trim());
    if (ok) {
      localStorage.setItem(INVITE_GRANTED_KEY, code.trim());
      setStep('tos');
    } else {
      setStatus('error');
    }
  };

  const handleTosAccept = () => {
    if (!allAgreed) return;
    const agreement: TosAgreement = {
      timestamp: new Date().toISOString(),
      version: TOS_VERSION,
      inviteCode: code.trim(),
    };
    // Record agreement with timestamp for legal audit trail.
    // TODO: also POST this to your backend alongside wallet address on connect.
    localStorage.setItem(TOS_AGREED_KEY, JSON.stringify(agreement));
    setStep('wallet');
  };

  const toggle = (key: keyof typeof agreed) => {
    setAgreed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const STEPS: Step[] = ['code', 'tos', 'wallet'];

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

      {/* Logo — top */}
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
          Private Beta
        </span>
      </motion.div>

      {/* ------------------------------------------------------------------ */}
      {/* Centered modal card                                                  */}
      {/* ------------------------------------------------------------------ */}
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

            {/* ---- Step 1: Invite code ---- */}
            {step === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="w-4 h-4 text-[#B8863F]" />
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#B8863F]">
                    Invitation Required
                  </p>
                </div>
                <h2 className="font-serif text-[28px] font-normal text-[#F2E0C8] leading-tight tracking-tight mb-1">
                  Enter your<br />invite code
                </h2>
                <p className="text-[#4A2F0A] text-[13px] mb-7">
                  Access is limited to invited members.
                </p>

                <div
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-2 transition-all duration-200"
                  style={{
                    background: 'rgba(184,134,63,0.05)',
                    border: status === 'error'
                      ? '1px solid rgba(239,68,68,0.45)'
                      : '1px solid rgba(184,134,63,0.18)',
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    value={code}
                    onChange={(e) => { setCode(e.target.value); setStatus('idle'); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    placeholder="AXIS-XXXX-XXXX"
                    className="flex-1 bg-transparent text-[#F2E0C8] placeholder-[#3A2208]/70 text-[15px] outline-none tracking-widest font-mono"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>

                <AnimatePresence>
                  {status === 'error' && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-red-400/75 pl-1 mb-3"
                    >
                      Invalid code. Please check and try again.
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleVerify}
                  disabled={!code.trim() || status === 'loading'}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-[14px] rounded-2xl font-normal text-[15px] transition-all duration-300 disabled:opacity-35"
                  style={{
                    background: 'linear-gradient(135deg, #B8863F 0%, #D97706 50%, #F59E0B 100%)',
                    color: '#0C0A09',
                    boxShadow: '0 4px 24px rgba(184,134,63,0.22)',
                  }}
                >
                  {status === 'loading'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <>Verify code <ArrowRight className="w-4 h-4" /></>
                  }
                </motion.button>

                <p className="text-center text-[11px] text-[#251408] mt-5">
                  Don't have a code?&nbsp;
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

            {/* ---- Step 2: Terms & Disclosures ---- */}
            {step === 'tos' && (
              <motion.div
                key="tos"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-[#B8863F]" />
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#B8863F]">
                    Review Required
                  </p>
                </div>
                <h2 className="font-serif text-[28px] font-normal text-[#F2E0C8] leading-tight tracking-tight mb-1">
                  Terms &<br />Disclosures
                </h2>
                <p className="text-[#4A2F0A] text-[13px] mb-5">
                  Read carefully before proceeding.
                </p>

                {/* Scrollable ToS summary */}
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
                    This Protocol is unaudited beta software. Smart contracts may contain bugs or vulnerabilities resulting in partial or complete loss of funds.
                  </p>
                  <p className="mb-2">
                    <span style={{ color: 'rgba(184,134,63,0.55)' }}>GEOGRAPHIC RESTRICTIONS</span>
                    <br />
                    Not available to U.S. persons or residents of sanctioned jurisdictions (Cuba, Iran, North Korea, Syria, Russia, Belarus).
                  </p>
                  <p className="mb-2">
                    <span style={{ color: 'rgba(184,134,63,0.55)' }}>NO FINANCIAL ADVICE</span>
                    <br />
                    Nothing constitutes financial, investment, or legal advice. ETF basket tokens are not registered securities.
                  </p>
                  <p className="mb-2">
                    <span style={{ color: 'rgba(184,134,63,0.55)' }}>LIMITATION OF LIABILITY</span>
                    <br />
                    Axis Inc. shall not be liable for any loss of funds arising from use of this Protocol. Provided "as is" without warranty.
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
                  <span>U.S. persons and residents of sanctioned jurisdictions are strictly prohibited from accessing this Protocol.</span>
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
                      label: 'I confirm I am not a U.S. person and am not located in or a citizen of any restricted jurisdiction.',
                    },
                    {
                      key: 'risk' as const,
                      label: 'I acknowledge I may lose all funds and accept full responsibility for my participation.',
                    },
                  ] as const
                ).map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-start gap-2.5 mb-2.5 cursor-pointer"
                  >
                    <div
                      className="mt-0.5 w-[15px] h-[15px] rounded shrink-0 flex items-center justify-center transition-all duration-150"
                      style={{
                        background: agreed[key] ? 'rgba(184,134,63,0.85)' : 'rgba(184,134,63,0.06)',
                        border: `1px solid ${agreed[key] ? '#B8863F' : 'rgba(184,134,63,0.25)'}`,
                      }}
                      onClick={() => toggle(key)}
                    >
                      {agreed[key] && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="#0C0A09" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
                    background: 'linear-gradient(135deg, #B8863F 0%, #D97706 50%, #F59E0B 100%)',
                    color: '#0C0A09',
                    boxShadow: '0 4px 24px rgba(184,134,63,0.22)',
                  }}
                >
                  I agree — Continue <ArrowRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}

            {/* ---- Step 3: Connect wallet ---- */}
            {step === 'wallet' && (
              <motion.div
                key="wallet"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-400/80">
                    Code verified
                  </p>
                </div>
                <h2 className="font-serif text-[28px] font-normal text-[#F2E0C8] leading-tight tracking-tight mb-1">
                  Connect your<br />wallet
                </h2>
                <p className="text-[#4A2F0A] text-[13px] mb-7">
                  One last step to enter the platform.
                </p>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onConnectWallet}
                  className="w-full group relative flex items-center gap-4 px-5 py-4 rounded-2xl overflow-hidden transition-all duration-300 mb-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(153,69,255,0.08) 0%, rgba(20,241,149,0.05) 100%)',
                    border: '1px solid rgba(153,69,255,0.22)',
                  }}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(135deg, rgba(153,69,255,0.14) 0%, rgba(20,241,149,0.08) 100%)',
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
                      Continue with Solana
                    </p>
                    <p className="text-[#7A5A30] text-xs mt-0.5">
                      Phantom · Solflare · Backpack
                    </p>
                  </div>
                  <span className="relative text-[#9945ff]/40 group-hover:text-[#9945ff]/70 transition-colors text-lg">
                    ›
                  </span>
                </motion.button>

                <p className="text-center text-[11px] text-[#251408] mt-4">
                  By connecting, you agree to our&nbsp;
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B8863F]/40 hover:text-[#B8863F]/70 transition-colors underline underline-offset-2"
                  >
                    Terms of Service
                  </a>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Step indicator — bottom of card */}
        <div className="flex justify-center gap-1.5 pb-5">
          {STEPS.map((s) => (
            <div
              key={s}
              className="h-[3px] rounded-full transition-all duration-300"
              style={{
                width: step === s ? '20px' : '6px',
                background: step === s
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