// src/hooks/useWallet.ts — Privy-backed wallet hook
// Based on privy-io/create-solana-next-app official example
import { useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { usePrivy } from '@privy-io/react-auth';
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
  // Matches official example: destructure logout directly from usePrivy
  const { authenticated, ready: privyReady, logout } = usePrivy();
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
    try {
      await logout();
    } catch {
      // logout() throws on 400 — still navigate to clear state
    }
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
