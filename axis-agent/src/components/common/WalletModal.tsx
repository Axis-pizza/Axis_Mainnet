import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { FC, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wallet } from 'lucide-react';
import { useWallet as useWA } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';

// ─── Context ──────────────────────────────────────────────────────────────────

interface WalletModalContextState {
  visible: boolean;
  setVisible: (open: boolean) => void;
}

const WalletModalContext = createContext<WalletModalContextState>({
  visible: false,
  setVisible: () => {},
});

export const useAxisWalletModal = () => useContext(WalletModalContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AxisWalletModalProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);

  return (
    <WalletModalContext.Provider value={{ visible, setVisible }}>
      {children}
      <WalletModal visible={visible} onClose={() => setVisible(false)} />
    </WalletModalContext.Provider>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

function WalletModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { wallets, select, connect, connected, connecting, wallet } = useWA();
  const [pendingConnect, setPendingConnect] = useState(false);

  // Close modal once connected
  useEffect(() => {
    if (connected && visible) onClose();
  }, [connected, visible, onClose]);

  // After select() sets the wallet, connect() once the adapter is ready
  useEffect(() => {
    if (pendingConnect && wallet) {
      setPendingConnect(false);
      connect().catch((err) => {
        console.error('Wallet connect error:', err);
      });
    }
  }, [pendingConnect, wallet, connect]);

  const handleSelect = useCallback((walletName: WalletName) => {
    select(walletName);
    setPendingConnect(true);
    onClose();
  }, [select, onClose]);

  const installed = wallets.filter((w) => w.readyState === 'Installed');
  const loadable = wallets.filter((w) => w.readyState === 'Loadable');
  const available = [...installed, ...loadable];
  const other = wallets.filter((w) => w.readyState !== 'Installed' && w.readyState !== 'Loadable');

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            style={{ zIndex: 200000 }}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320, mass: 0.85 }}
            className="fixed bottom-0 left-0 right-0 overflow-hidden"
            style={{
              zIndex: 200001,
              background: 'linear-gradient(180deg, #0F0A06 0%, #080503 100%)',
              borderTop: '1px solid rgba(184,134,63,0.18)',
              borderRadius: '28px 28px 0 0',
              paddingBottom: 'env(safe-area-inset-bottom, 24px)',
              boxShadow: '0 -20px 80px rgba(0,0,0,0.6), 0 -1px 0 rgba(184,134,63,0.12)',
              maxHeight: '70vh',
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
              <div className="mb-6 pr-8">
                <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-[#B8863F] mb-2">
                  Axis · Connect
                </p>
                <h2 className="font-serif text-[24px] font-normal text-[#F2E0C8] leading-tight tracking-tight">
                  Select a wallet
                </h2>
                {connecting && (
                  <p className="text-[#7A5A30] text-xs mt-1.5">Connecting...</p>
                )}
              </div>

              {/* Wallet list */}
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '45vh' }}>
                {available.map((w) => (
                  <WalletButton
                    key={w.adapter.name}
                    name={w.adapter.name}
                    icon={w.adapter.icon}
                    tag={w.readyState === 'Installed' ? 'Detected' : undefined}
                    onClick={() => handleSelect(w.adapter.name as WalletName)}
                  />
                ))}

                {other.length > 0 && available.length > 0 && (
                  <div className="pt-3 pb-1">
                    <p className="text-[10px] uppercase tracking-widest text-[#5A3A18]">Other wallets</p>
                  </div>
                )}

                {other.map((w) => (
                  <WalletButton
                    key={w.adapter.name}
                    name={w.adapter.name}
                    icon={w.adapter.icon}
                    onClick={() => handleSelect(w.adapter.name as WalletName)}
                  />
                ))}

                {wallets.length === 0 && (
                  <div className="text-center py-8">
                    <Wallet className="w-8 h-8 mx-auto mb-3 text-[#5A3A18]" />
                    <p className="text-[#7A5A30] text-sm">No wallets detected</p>
                    <p className="text-[#3A2208] text-xs mt-1">Install a Solana wallet to continue</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Wallet Button ────────────────────────────────────────────────────────────

function WalletButton({ name, icon, tag, onClick }: {
  name: string;
  icon: string;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'linear-gradient(135deg, rgba(184,134,63,0.04) 0%, rgba(184,134,63,0.02) 100%)',
        border: '1px solid rgba(184,134,63,0.12)',
      }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200"
        style={{ background: 'rgba(184,134,63,0.06)' }} />
      <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
        style={{ background: 'rgba(184,134,63,0.08)', border: '1px solid rgba(184,134,63,0.12)' }}>
        <img src={icon} alt={name} className="w-7 h-7 rounded-lg" />
      </div>
      <div className="relative text-left flex-1">
        <p className="text-[#F2E0C8] font-normal text-[15px] leading-tight">{name}</p>
      </div>
      {tag && (
        <span className="relative text-[10px] uppercase tracking-wider text-[#B8863F]/60 bg-[rgba(184,134,63,0.08)] px-2 py-0.5 rounded-full">
          {tag}
        </span>
      )}
      <span className="relative text-[#B8863F]/30 text-lg">›</span>
    </motion.button>
  );
}
