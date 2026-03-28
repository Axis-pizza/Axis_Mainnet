import { useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { Buffer } from 'buffer';
import { PublicKey, Transaction } from '@solana/web3.js';
import ReactGA from 'react-ga4';
import { useWallet as useWA, useConnection as useWAConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-standard-mobile';
import { useConnectWallet, usePrivy } from '@privy-io/react-auth';
import {
  useWallets as usePrivySolanaWallets,
  useSignTransaction as usePrivySignTransaction,
} from '@privy-io/react-auth/solana';
import { ConnectionContext } from '../context/ConnectionContext';
import { isAndroidChrome } from '../utils/seekerDetect';

const FORCE_LOGOUT_KEY = 'axis_force_logged_out';
const IS_ANDROID_MWA = isAndroidChrome();

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

function useWalletAndroid(): WalletContextState {
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
    isMWA: wa.wallet?.adapter?.name === SolanaMobileWalletAdapterWalletName,
    mwaConnecting: wa.connecting,
  };
}

function useWalletPrivy(): WalletContextState {
  const { authenticated, ready: privyReady, logout, user } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { wallets: solanaWallets } = usePrivySolanaWallets();
  const { signTransaction: privySignTransaction } = usePrivySignTransaction();

  const isForceLoggedOut =
    typeof window !== 'undefined' && localStorage.getItem(FORCE_LOGOUT_KEY) === 'true';

  const targetAddress = useMemo(() => {
    if (isForceLoggedOut) return null;

    const linkedWallets = ((user?.linkedAccounts ?? []).filter(
      (account) => account.type === 'wallet' && account.chainType === 'solana'
    ) as any[]);
    const externalWallet = linkedWallets.find((wallet: any) => wallet.walletClientType !== 'privy');
    if (externalWallet) return externalWallet.address as string;

    const embeddedWallet = linkedWallets.find((wallet: any) => wallet.walletClientType === 'privy');
    if (embeddedWallet) return embeddedWallet.address as string;

    return solanaWallets[0]?.address ?? null;
  }, [isForceLoggedOut, solanaWallets, user]);

  const wallet = useMemo(() => {
    if (!targetAddress) return null;
    return solanaWallets.find((candidate: any) => candidate.address === targetAddress) ?? solanaWallets[0] ?? null;
  }, [solanaWallets, targetAddress]);

  const publicKey = useMemo(() => {
    if (!targetAddress) return null;
    try {
      return new PublicKey(targetAddress);
    } catch {
      return null;
    }
  }, [targetAddress]);

  const privyConnected = authenticated && !!publicKey && !isForceLoggedOut;

  const signTransaction = useMemo(() => {
    if (!wallet) return undefined;

    return async (tx: Transaction): Promise<Transaction> => {
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await privySignTransaction({
        transaction: serialized,
        wallet,
        chain: 'solana:mainnet',
      });

      return Transaction.from(Buffer.from(signedTransaction));
    };
  }, [privySignTransaction, wallet]);

  const disconnect = useCallback(async () => {
    localStorage.setItem(FORCE_LOGOUT_KEY, 'true');
    try {
      await logout();
    } catch (error) {
      console.warn('[Privy] logout failed, forcing local reset', error);
    }
    window.location.reload();
  }, [logout]);

  const openPrivyWalletConnect = useCallback(async () => {
    localStorage.removeItem(FORCE_LOGOUT_KEY);
    connectWallet();
  }, [connectWallet]);

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
    connectMWA: openPrivyWalletConnect,
    isMWA: false,
    mwaConnecting: false,
  };
}

function useConnectionPrivy() {
  const { connection } = useContext(ConnectionContext);
  return { connection };
}

function useLoginModalAndroid() {
  const { setVisible: showModal } = useWalletModal();
  const wa = useWA();

  const setVisible = useCallback((open: boolean) => {
    if (!open) {
      showModal(false);
      return;
    }

    if (wa.wallet?.adapter.name === SolanaMobileWalletAdapterWalletName && !wa.connected) {
      wa.connect().catch(() => {});
      return;
    }

    const mwa = wa.wallets.find(
      (wallet) => wallet.adapter.name === SolanaMobileWalletAdapterWalletName
    );
    if (mwa) {
      wa.select(mwa.adapter.name as any);
      mwa.adapter.connect().catch(() => {});
      return;
    }

    showModal(true);
  }, [showModal, wa]);

  return { setVisible, visible: false };
}

function useLoginModalPrivy() {
  const { ready } = usePrivy();
  const { connectWallet } = useConnectWallet();

  const setVisible = useCallback((visible: boolean) => {
    if (!visible || !ready) return;
    localStorage.removeItem(FORCE_LOGOUT_KEY);
    connectWallet();
  }, [connectWallet, ready]);

  return { setVisible, visible: false };
}

export function useWallet(): WalletContextState {
  if (IS_ANDROID_MWA) return useWalletAndroid(); // eslint-disable-line react-hooks/rules-of-hooks
  return useWalletPrivy(); // eslint-disable-line react-hooks/rules-of-hooks
}

export function useConnection() {
  if (IS_ANDROID_MWA) return useWAConnection(); // eslint-disable-line react-hooks/rules-of-hooks
  return useConnectionPrivy(); // eslint-disable-line react-hooks/rules-of-hooks
}

export function useLoginModal() {
  if (IS_ANDROID_MWA) return useLoginModalAndroid(); // eslint-disable-line react-hooks/rules-of-hooks
  return useLoginModalPrivy(); // eslint-disable-line react-hooks/rules-of-hooks
}
