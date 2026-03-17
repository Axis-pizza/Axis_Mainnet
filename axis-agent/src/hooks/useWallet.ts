// src/hooks/useWallet.ts — Privy-backed wallet hook
// Based on privy-io examples and docs
import { useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { PublicKey, Transaction } from '@solana/web3.js';
import { ConnectionContext } from '../context/ConnectionContext';
import ReactGA from 'react-ga4';

const FORCE_LOGOUT_KEY = 'axis_force_logged_out';

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
      if (visible && ready) {
        localStorage.removeItem(FORCE_LOGOUT_KEY);
        login();
      }
    },
    [login, ready]
  );
  return { setVisible, visible: false };
}

export function useWallet(): WalletContextState {
  const { authenticated, ready: privyReady, logout, user } = usePrivy();

  // Solana wallets from /solana entry — needed for signTransaction
  const { wallets: solanaWallets } = useSolanaWallets();
  const { signTransaction: privySignTransaction } = useSignTransaction();

  const isForceLoggedOut = typeof window !== 'undefined' && localStorage.getItem(FORCE_LOGOUT_KEY) === 'true';

  // Find the right wallet address using user.linkedAccounts
  // which has walletClientType and chainType to distinguish embedded vs external
  const targetAddress = useMemo(() => {
    if (isForceLoggedOut) return null;

    // Check linked accounts for Solana wallets with walletClientType
    const linkedWallets = user?.linkedAccounts?.filter(
      (a: any) => a.type === 'wallet' && a.chainType === 'solana'
    ) ?? [];

    // Prefer external wallet over embedded
    const external = linkedWallets.find((w: any) => w.walletClientType !== 'privy');
    if (external) return (external as any).address;

    // Fall back to embedded
    const embedded = linkedWallets.find((w: any) => w.walletClientType === 'privy');
    if (embedded) return (embedded as any).address;

    // Last resort: first Solana wallet from the standard wallet hook
    return solanaWallets[0]?.address ?? null;
  }, [user, solanaWallets, isForceLoggedOut]);

  // Find the matching Solana standard wallet for signing
  const wallet = useMemo(() => {
    if (!targetAddress) return null;
    return solanaWallets.find((w) => w.address === targetAddress) ?? solanaWallets[0] ?? null;
  }, [solanaWallets, targetAddress]);

  const publicKey = useMemo(() => {
    if (!targetAddress) return null;
    try {
      return new PublicKey(targetAddress);
    } catch {
      return null;
    }
  }, [targetAddress]);

  const connected = authenticated && !!publicKey && !isForceLoggedOut;

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
    localStorage.setItem(FORCE_LOGOUT_KEY, 'true');
    try { await logout(); } catch { /* ignored */ }
    window.location.reload();
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
