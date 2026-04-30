import { useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import { Buffer } from 'buffer';
import { PublicKey, Transaction } from '@solana/web3.js';
import ReactGA from 'react-ga4';
import { useConnectWallet, usePrivy } from '@privy-io/react-auth';
import {
  useWallets as usePrivySolanaWallets,
  useSignTransaction as usePrivySignTransaction,
} from '@privy-io/react-auth/solana';
import { ConnectionContext } from '../context/ConnectionContext';
import { useDirectWallet } from './useDirectWallet';

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
  connectMWA: () => Promise<void>;
  isMWA: boolean;
  mwaConnecting: boolean;
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

  // authenticated だけで接続状態とみなす。publicKey が遅延取得でも UI がバグらない
  const privyConnected = authenticated && !isForceLoggedOut;

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

/// Direct Phantom-compatible fallback used when Privy's auth iframe is
/// blocked (e.g. Privy app's allowed-origins doesn't include the current
/// host). Once a direct connection lands, every consumer of `useWallet`
/// transparently gets the direct publicKey + signing path so the rest of
/// the app keeps working without further wiring.
export function useWallet(): WalletContextState {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privy = useWalletPrivy();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const direct = useDirectWallet();

  if (direct.publicKey && !privy.connected) {
    const directSign = direct.signTransaction as unknown as (tx: Transaction) => Promise<Transaction>;
    return {
      connected: true,
      connecting: direct.connecting,
      publicKey: direct.publicKey,
      signTransaction: directSign,
      signAllTransactions: undefined,
      disconnect: direct.disconnect,
      ready: true,
      authenticated: true,
      wallet: null,
      connectMWA: privy.connectMWA,
      isMWA: false,
      mwaConnecting: false,
    };
  }

  return privy;
}

export function useConnection() {
  return useConnectionPrivy(); // eslint-disable-line react-hooks/rules-of-hooks
}

/// Login modal hook with both paths. `setVisible(true)` opens the Privy
/// modal as before; `connectDirect()` skips Privy entirely and pops the
/// Phantom approval popup via window.solana. UI surfaces the second one
/// as a "fallback" affordance only when `isDirectAvailable` is true.
export function useLoginModal() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privy = useLoginModalPrivy();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const direct = useDirectWallet();
  return {
    ...privy,
    connectDirect: direct.connect,
    isDirectAvailable: direct.isAvailable,
    isDirectConnecting: direct.connecting,
  };
}
