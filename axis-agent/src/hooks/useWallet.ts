// src/hooks/useWallet.ts — Privy-backed wallet hook
// Drop-in replacement for the old @solana/wallet-adapter-react hook
import { useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { usePrivy, useLogout } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { PublicKey, Transaction } from '@solana/web3.js';
import { ConnectionContext } from '../context/ConnectionContext';
import ReactGA from 'react-ga4';

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
}

export function useConnection() {
  const { connection } = useContext(ConnectionContext);
  return { connection };
}

/**
 * Drop-in replacement for useWalletModal from @solana/wallet-adapter-react-ui.
 * `setVisible(true)` opens the Privy login modal.
 */
export function useLoginModal() {
  const { login } = usePrivy();
  const setVisible = useCallback(
    (visible: boolean) => {
      if (visible) login();
    },
    [login]
  );
  return { setVisible, visible: false };
}

export function useWallet(): WalletContextState {
  const { authenticated, ready: privyReady } = usePrivy();
  const { logout } = useLogout();
  const { wallets } = useWallets();
  const { signTransaction: privySignTransaction } = useSignTransaction();
  const wallet = wallets[0] ?? null;

  const publicKey = useMemo(() => {
    if (!wallet?.address) return null;
    try {
      return new PublicKey(wallet.address);
    } catch {
      return null;
    }
  }, [wallet?.address]);

  const connected = authenticated && !!publicKey;

  const signTransaction = useMemo(() => {
    if (!wallet) return undefined;
    return async (tx: Transaction): Promise<Transaction> => {
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await privySignTransaction({
        transaction: serialized,
        wallet,
      });
      return Transaction.from(signedTransaction);
    };
  }, [wallet, privySignTransaction]);

  const disconnect = useCallback(async () => {
    try { await logout(); } catch { /* Privy API may 400 */ }
    // Nuclear clear — Privy uses generic storage keys, not privy-prefixed
    localStorage.clear();
    sessionStorage.clear();
    // Clear all cookies
    document.cookie.split(';').forEach((c) => {
      document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    });
    window.location.replace('/');
  }, [logout]);

  // GA tracking
  const hasTrackedRef = useRef(false);
  useEffect(() => {
    if (connected && publicKey) {
      if (!hasTrackedRef.current) {
        ReactGA.event({
          category: 'Wallet',
          action: 'Connect',
          label: publicKey.toString(),
        });
        hasTrackedRef.current = true;
      }
    }
    if (!connected) {
      hasTrackedRef.current = false;
    }
  }, [connected, publicKey]);

  return {
    connected,
    connecting: !privyReady,
    publicKey,
    signTransaction,
    signAllTransactions: undefined,
    disconnect,
    ready: privyReady,
    authenticated: connected,
    wallet,
  };
}
