import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SolanaIcon = () => (
  <svg width="22" height="22" viewBox="0 0 397.7 311.7" fill="none">
    <defs>
      <linearGradient id="sol-grad" x1="360.8" y1="351.5" x2="141.7" y2="-69.3" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#9945ff" />
        <stop offset="1" stopColor="#14f195" />
      </linearGradient>
    </defs>
    <path fill="url(#sol-grad)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7zm0-164.2c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7zm317.4-70H64.6c-3.5 0-6.8 1.4-9.2 3.8L-7.3 70.2c-4.1 4.1-1.2 11.1 4.6 11.1h317.4c3.5 0 6.8-1.4 9.2-3.8l62.7-62.7c4.1-4.1 1.2-11.1-4.6-11.1z" />
  </svg>
);

export const LoginModal = ({ isOpen, onClose }: LoginModalProps) => {
  const { login } = usePrivy();

  const handleSolana = () => { onClose(); setTimeout(() => login(), 300); };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-[9998]"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320, mass: 0.85 }}
            className="fixed bottom-0 left-0 right-0 z-[9999] overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #0F0A06 0%, #080503 100%)',
              borderTop: '1px solid rgba(184,134,63,0.18)',
              borderRadius: '28px 28px 0 0',
              paddingBottom: 'env(safe-area-inset-bottom, 24px)',
              boxShadow: '0 -20px 80px rgba(0,0,0,0.6), 0 -1px 0 rgba(184,134,63,0.12)',
            }}
          >
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, rgba(184,134,63,0.12) 0%, transparent 70%)', filter: 'blur(20px)' }} />

            {/* Handle */}
            <div className="flex justify-center pt-4 pb-0">
              <div className="w-8 h-[3px] rounded-full bg-white/15" />
            </div>

            <div className="relative px-6 pt-5 pb-8">
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-5 w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/8 text-[#7A5A30]"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="mb-7 pr-8">
                <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-[#B8863F] mb-2">
                  Axis · DeFi Strategy Hub
                </p>
                <h2 className="font-serif text-[26px] font-normal text-[#F2E0C8] leading-tight tracking-tight">
                  Connect your wallet
                </h2>
                <p className="text-[#5A3A18] text-sm mt-1.5">
                  Sign in with your Solana wallet
                </p>
              </div>

              {/* Solana Button */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSolana}
                className="w-full group relative flex items-center gap-4 px-5 py-4 rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  background: 'linear-gradient(135deg, rgba(153,69,255,0.08) 0%, rgba(20,241,149,0.05) 100%)',
                  border: '1px solid rgba(153,69,255,0.25)',
                }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: 'linear-gradient(135deg, rgba(153,69,255,0.14) 0%, rgba(20,241,149,0.08) 100%)' }} />
                <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(153,69,255,0.12)', border: '1px solid rgba(153,69,255,0.2)' }}>
                  <SolanaIcon />
                </div>
                <div className="relative text-left flex-1">
                  <p className="text-[#F2E0C8] font-normal text-[15px] leading-tight">Continue with Solana</p>
                  <p className="text-[#7A5A30] text-xs mt-0.5">Phantom · Solflare · Backpack</p>
                </div>
                <span className="relative text-[#9945ff]/40 group-hover:text-[#9945ff]/70 transition-colors text-lg">›</span>
              </motion.button>

              <p className="text-center text-[11px] text-[#3A2208]/80 mt-5 leading-relaxed">
                By signing in, you agree to our Terms of Service and Privacy Policy
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
