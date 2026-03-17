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
  disconnect: () => void;
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
  const { login, ready } = usePrivy();
  const setVisible = useCallback(
    (visible: boolean) => {
      if (visible && ready) login();
    },
    [login, ready]
  );
  return { setVisible, visible: false };
}

export function useWallet(): WalletContextState {
  const { authenticated, ready: privyReady } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction: privySignTransaction } = useSignTransaction();

  // useLogout with onSuccess callback — per official Privy docs
  const { logout } = useLogout({
    onSuccess: () => {
      console.log('[Privy] Logged out successfully');
      // Reload to fully reset UI state — shouldAutoConnect:false
      // ensures the wallet won't reconnect on the fresh page
      window.location.replace('/');
    },
  });

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

  // Per Privy docs: logout should be called directly, not wrapped in async chains.
  // The useLogout callbacks handle success/error.
  const disconnect = useCallback(() => {
    logout();
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
