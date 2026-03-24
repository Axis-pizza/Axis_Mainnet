import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => Promise<void>;
  onOpenLogin: () => void; // Opens Privy's login modal after MWA registration
  connecting: boolean;
  error: string | null;
}

export function SeekerConnectSheet({ isOpen, onClose, onConnect, onOpenLogin, connecting, error }: Props) {
  const [status, setStatus] = useState<'idle' | 'registering' | 'ready' | 'error'>('idle');

  const handleConnect = async () => {
    setStatus('registering');
    try {
      // Register MWA as wallet standard provider
      await onConnect();
      setStatus('ready');
      // Close our sheet and open Privy's login — Seed Vault will now appear as a wallet option
      setTimeout(() => {
        onClose();
        onOpenLogin();
      }, 500);
    } catch {
      setStatus('error');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            background: '#030303',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 20, right: 20,
              width: 36, height: 36, borderRadius: 18,
              background: 'rgba(184,134,63,0.08)',
              border: '1px solid rgba(184,134,63,0.15)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X style={{ width: 18, height: 18, color: '#7A5A30' }} />
          </button>

          <div style={{
            width: '100%', maxWidth: 360,
            background: 'linear-gradient(180deg, #140E08 0%, #0A0705 100%)',
            border: '1px solid rgba(184,134,63,0.15)',
            borderRadius: 24, padding: '32px 24px',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 18,
              background: 'linear-gradient(135deg, rgba(184,134,63,0.15), rgba(184,134,63,0.05))',
              border: '1px solid rgba(184,134,63,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <Smartphone style={{ width: 28, height: 28, color: '#B8863F' }} />
            </div>

            <h3 style={{ color: '#F2E0C8', fontSize: 22, fontWeight: 400, fontFamily: 'Lora, Georgia, serif', margin: '0 0 6px' }}>
              Connect Seeker
            </h3>
            <p style={{ color: '#7A5A30', fontSize: 13, margin: '0 0 20px' }}>via Seed Vault</p>

            <p style={{ color: '#78716C', fontSize: 13, lineHeight: 1.6, margin: '0 0 24px' }}>
              This will enable Seed Vault as a wallet option. You'll then select it from the wallet list to connect.
            </p>

            {status === 'error' && error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 12, marginBottom: 16,
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
              }}>
                <AlertCircle style={{ width: 14, height: 14, color: '#EF4444', flexShrink: 0 }} />
                <p style={{ color: '#EF4444', fontSize: 12, margin: 0 }}>{error}</p>
              </div>
            )}

            {status === 'ready' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 12, marginBottom: 16,
                background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)',
              }}>
                <CheckCircle style={{ width: 14, height: 14, color: '#10B981', flexShrink: 0 }} />
                <p style={{ color: '#10B981', fontSize: 12, margin: 0 }}>Seed Vault enabled — opening wallet selector...</p>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={status === 'registering' || status === 'ready'}
              style={{
                width: '100%', padding: '16px 0', borderRadius: 16,
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                opacity: (status === 'registering' || status === 'ready') ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: 'linear-gradient(135deg, #6B4420, #B8863F)',
                border: 'none', color: '#000',
              }}
            >
              {status === 'registering' ? (
                <><Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} /> Enabling Seed Vault...</>
              ) : status === 'ready' ? (
                <><CheckCircle style={{ width: 18, height: 18 }} /> Opening...</>
              ) : (
                'Enable Seed Vault'
              )}
            </button>

            {status === 'error' && (
              <button onClick={() => setStatus('idle')} style={{
                width: '100%', marginTop: 12, padding: '12px 0', borderRadius: 12,
                background: 'none', border: 'none', color: '#78716C', fontSize: 13, cursor: 'pointer',
              }}>
                Try again
              </button>
            )}
          </div>

          <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(184,134,63,0.2)', marginTop: 24 }}>
            Powered by Mobile Wallet Adapter
          </p>

          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
