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
      // Mobile: select MWA and connect directly — no modal overlay.
      // MWA's built-in UI (LNA dialog, wallet picker) handles everything
      // at z-index 1, so we must NOT render any overlay on top of it.
      const mwa = wa.wallets.find((w) => w.adapter.name === MWA_WALLET_NAME);
      if (mwa) {
        wa.select(mwa.adapter.name as any);
        // connect() triggers MWA's full flow: LNA permission → wallet app
        wa.connect().catch(() => {});
      } else if (wa.wallet && !wa.connected) {
        wa.connect().catch(() => {});
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
