// src/hooks/useWallet.ts — Unified wallet hook (pure wallet-adapter, same approach as Perena)
import { useEffect, useRef, useCallback } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import ReactGA from 'react-ga4';
import { useWallet as useWA, useConnection as useWAConnection } from '@solana/wallet-adapter-react';
import { useAxisWalletModal } from '../components/common/WalletModal';
import { isAndroidChrome } from '../utils/seekerDetect';

export interface WalletContextState {
  connected: boolean;
  connecting: boolean;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | undefined;
  signAllTransactions: ((txs: Transaction[]) => Promise<Transaction[]>) | undefined;
  disconnect: () => Promise<void>;
  ready: boolean;
  authenticated: boolean;
  wallet: any;
  connectMWA: () => Promise<void>;
  isMWA: boolean;
  mwaConnecting: boolean;
}

const MWA_WALLET_NAME = 'Mobile Wallet Adapter';
const IS_MOBILE = isAndroidChrome();

export function useWallet(): WalletContextState {
  const wa = useWA();

  // Analytics
  const hasTrackedRef = useRef(false);
  useEffect(() => {
    if (wa.connected && wa.publicKey && !hasTrackedRef.current) {
      ReactGA.event({ category: 'Wallet', action: 'Connect', label: wa.publicKey.toString() });
      hasTrackedRef.current = true;
    }
    if (!wa.connected) hasTrackedRef.current = false;
  }, [wa.connected, wa.publicKey]);

  const connectMWA = useCallback(async () => {
    if (wa.wallet) await wa.connect();
  }, [wa.wallet, wa.connect]);

  const disconnect = useCallback(async () => {
    await wa.disconnect();
  }, [wa.disconnect]);

  return {
    connected: wa.connected,
    connecting: wa.connecting,
    publicKey: wa.publicKey,
    signTransaction: wa.signTransaction,
    signAllTransactions: wa.signAllTransactions,
    disconnect,
    ready: true,
    authenticated: wa.connected,
    wallet: wa.wallet,
    connectMWA,
    isMWA: wa.wallet?.adapter?.name === MWA_WALLET_NAME,
    mwaConnecting: wa.connecting,
  };
}

export function useConnection() {
  return useWAConnection();
}

export function useLoginModal() {
  const { setVisible: showModal } = useAxisWalletModal();
  const wa = useWA();

  const setVisible = useCallback((open: boolean) => {
    if (!open) { showModal(false); return; }

    if (IS_MOBILE) {
      // Mobile (Seeker/Android Chrome): trigger MWA directly — no modal overlay.
      // MWA's built-in UI (LNA dialog, Seed Vault) renders at z-index 1,
      // so we must NOT render any overlay on top of it.

      // If MWA is already the selected wallet, connect directly.
      if (wa.wallet?.adapter.name === MWA_WALLET_NAME && !wa.connected) {
        wa.connect().catch(() => {});
        return;
      }

      const mwa = wa.wallets.find((w) => w.adapter.name === MWA_WALLET_NAME);
      if (mwa) {
        wa.select(mwa.adapter.name as any);
        // IMPORTANT: wa.connect() uses a stale closure — wallet state hasn't
        // updated yet after select() due to React 18 batching. Call the adapter
        // directly to preserve the user gesture and avoid WalletNotSelectedError.
        mwa.adapter.connect().catch(() => {});
      } else {
        // MWA not detected (device not Android or Seed Vault unavailable).
        // Fall back to the wallet picker so the user sees what's happening.
        showModal(true);
      }
    } else {
      // Desktop: show wallet picker modal (Phantom, Solflare, etc.)
      if (wa.wallet && !wa.connected) {
        wa.connect().catch(() => showModal(true));
      } else if (!wa.connected) {
        showModal(true);
      }
    }
  }, [showModal, wa]);

  return { setVisible, visible: false };
}
