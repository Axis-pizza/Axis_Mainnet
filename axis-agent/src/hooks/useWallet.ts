// src/hooks/useWallet.ts — Unified wallet hook (Privy on desktop, wallet-adapter on mobile)
import { useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { ConnectionContext } from '../context/ConnectionContext';
import { isAndroidChrome } from '../utils/seekerDetect';
import ReactGA from 'react-ga4';

// Platform-conditional imports — both are always bundled but only one path executes
import { useWallet as useWA, useConnection as useWAConnection } from '@solana/wallet-adapter-react';
import { useAxisWalletModal } from '../components/common/WalletModal';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';

const FORCE_LOGOUT_KEY = 'axis_force_logged_out';
const IS_MOBILE_WALLET_PATH = isAndroidChrome();

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

// ─── Mobile: wallet-adapter ───────────────────────────────────────────────────

function useWalletMobile(): WalletContextState {
  const wa = useWA();

  const hasTrackedRef = useRef(false);
  useEffect(() => {
    if (wa.connected && wa.publicKey && !hasTrackedRef.current) {
      ReactGA.event({ category: 'Wallet', action: 'Connect', label: wa.publicKey.toString() });
      hasTrackedRef.current = true;
    }
    if (!wa.connected) hasTrackedRef.current = false;
  }, [wa.connected, wa.publicKey]);

  const connectMWA = useCallback(async () => {
    if (wa.wallet) {
      await wa.connect();
    }
  }, [wa]);

  const disconnect = useCallback(async () => {
    await wa.disconnect();
  }, [wa]);

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
    isMWA: wa.wallet?.adapter?.name?.toLowerCase().includes('mobile') ?? false,
    mwaConnecting: wa.connecting,
  };
}

function useConnectionMobile() {
  return useWAConnection();
}

function useLoginModalMobile() {
  const { setVisible } = useAxisWalletModal();
  return { setVisible, visible: false };
}

// ─── Desktop: Privy ───────────────────────────────────────────────────────────

function useWalletDesktop(): WalletContextState {
  const { authenticated, ready: privyReady, logout, user, login } = usePrivy();
  const { wallets: solanaWallets } = useSolanaWallets();
  const { signTransaction: privySignTransaction } = useSignTransaction();

  const isForceLoggedOut = typeof window !== 'undefined' && localStorage.getItem(FORCE_LOGOUT_KEY) === 'true';

  const targetAddress = useMemo(() => {
    if (isForceLoggedOut) return null;
    const linkedWallets = user?.linkedAccounts?.filter(
      (a: any) => a.type === 'wallet' && a.chainType === 'solana'
    ) ?? [];
    const external = linkedWallets.find((w: any) => w.walletClientType !== 'privy');
    if (external) return (external as any).address;
    const embedded = linkedWallets.find((w: any) => w.walletClientType === 'privy');
    if (embedded) return (embedded as any).address;
    return solanaWallets[0]?.address ?? null;
  }, [user, solanaWallets, isForceLoggedOut]);

  const wallet = useMemo(() => {
    if (!targetAddress) return null;
    return solanaWallets.find((w: any) => w.address === targetAddress) ?? solanaWallets[0] ?? null;
  }, [solanaWallets, targetAddress]);

  const publicKey = useMemo(() => {
    if (!targetAddress) return null;
    try { return new PublicKey(targetAddress); } catch { return null; }
  }, [targetAddress]);

  const privyConnected = authenticated && !!publicKey && !isForceLoggedOut;

  const signTransaction = useMemo(() => {
    if (!wallet) return undefined;
    return async (tx: Transaction): Promise<Transaction> => {
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await privySignTransaction({ transaction: serialized, wallet });
      return Transaction.from(signedTransaction);
    };
  }, [wallet, privySignTransaction]);

  const disconnect = useCallback(async () => {
    localStorage.setItem(FORCE_LOGOUT_KEY, 'true');
    try { await logout(); } catch {}
    window.location.reload();
  }, [logout]);

  const hasTrackedRef = useRef(false);
  useEffect(() => {
    if (privyConnected && publicKey && !hasTrackedRef.current) {
      ReactGA.event({ category: 'Wallet', action: 'Connect', label: publicKey.toString() });
      hasTrackedRef.current = true;
    }
    if (!privyConnected) hasTrackedRef.current = false;
  }, [privyConnected, publicKey]);

  return {
    connected: privyConnected,
    connecting: !privyReady,
    publicKey,
    signTransaction,
    signAllTransactions: undefined,
    disconnect,
    ready: privyReady,
    authenticated: privyConnected,
    wallet,
    connectMWA: async () => { login(); },
    isMWA: false,
    mwaConnecting: false,
  };
}

function useConnectionDesktop() {
  const { connection } = useContext(ConnectionContext);
  return { connection };
}

function useLoginModalDesktop() {
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

// ─── Exports (branch by platform) ────────────────────────────────────────────
// IS_MOBILE_WALLET_PATH is constant per page load (based on userAgent),
// so the hook call order is stable — safe to branch.

export function useWallet(): WalletContextState {
  if (IS_MOBILE_WALLET_PATH) return useWalletMobile(); // eslint-disable-line react-hooks/rules-of-hooks
  return useWalletDesktop(); // eslint-disable-line react-hooks/rules-of-hooks
}

export function useConnection() {
  if (IS_MOBILE_WALLET_PATH) return useConnectionMobile(); // eslint-disable-line react-hooks/rules-of-hooks
  return useConnectionDesktop(); // eslint-disable-line react-hooks/rules-of-hooks
}

export function useLoginModal() {
  if (IS_MOBILE_WALLET_PATH) return useLoginModalMobile(); // eslint-disable-line react-hooks/rules-of-hooks
  return useLoginModalDesktop(); // eslint-disable-line react-hooks/rules-of-hooks
}
