import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthorizationResult,
  SolanaMobileWalletAdapterErrorCode,
} from '@solana-mobile/mobile-wallet-adapter-protocol';
import {
  transact,
  Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';

const APP_IDENTITY = {
  name: 'Axis Protocol',
  uri: 'https://app.axis-protocol.xyz',
  icon: 'favicon.ico',
};

const AUTH_STORAGE_KEY = 'axis_mobile_wallet_session_v1';
const SOLANA_CLUSTER = 'mainnet-beta';

type SignableTransaction = Transaction | VersionedTransaction;

type StoredWalletSession = {
  accountLabel: string | null;
  addressBase58: string;
  addressBase64: string;
  authToken: string;
  walletUriBase: string | null;
};

interface WalletContextType {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  restoring: boolean;
  walletLabel: string | null;
  walletUriBase: string | null;
  accountLabel: string | null;
  error: string | null;
  clearError: () => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends SignableTransaction>(transaction: T) => Promise<T>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

const WalletContext = createContext<WalletContextType>({} as WalletContextType);

function normalizeAccount(account: AuthorizationResult['accounts'][number]) {
  const publicKeyBytes =
    'publicKey' in account && account.publicKey
      ? Buffer.from(account.publicKey)
      : (() => {
          try {
            const decoded = Buffer.from(account.address, 'base64');
            new PublicKey(decoded);
            return decoded;
          } catch {
            return Buffer.from(new PublicKey(account.address).toBytes());
          }
        })();

  const publicKey = new PublicKey(publicKeyBytes);

  return {
    accountLabel: account.label ?? null,
    addressBase58: publicKey.toBase58(),
    addressBase64: Buffer.from(publicKey.toBytes()).toString('base64'),
  };
}

function getWalletDisplayName(walletUriBase: string | null) {
  if (!walletUriBase) return null;

  try {
    const hostname = new URL(walletUriBase).hostname.replace(/^www\./, '');
    const root = hostname.split('.')[0];
    if (!root) return hostname;
    return root.charAt(0).toUpperCase() + root.slice(1);
  } catch {
    return walletUriBase;
  }
}

function getWalletErrorMessage(error: unknown) {
  const code = (error as { code?: string | number } | null)?.code;

  switch (code) {
    case SolanaMobileWalletAdapterErrorCode.ERROR_WALLET_NOT_FOUND:
      return 'No Solana Mobile wallet was found on this device.';
    case SolanaMobileWalletAdapterErrorCode.ERROR_SESSION_TIMEOUT:
      return 'Wallet connection timed out. Try again.';
    case SolanaMobileWalletAdapterErrorCode.ERROR_SESSION_CLOSED:
      return 'The wallet session closed unexpectedly.';
    default:
      break;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Wallet connection failed.';
}

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<StoredWalletSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw || cancelled) return;

        const parsed = JSON.parse(raw) as StoredWalletSession;
        if (!parsed?.authToken || !parsed?.addressBase58 || !parsed?.addressBase64) {
          await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          return;
        }

        setSession(parsed);
      } catch {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      } finally {
        if (!cancelled) {
          setRestoring(false);
        }
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistSession = useCallback(async (nextSession: StoredWalletSession | null) => {
    if (nextSession) {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
    } else {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  const applyAuthorization = useCallback(
    async (authorization: AuthorizationResult) => {
      const primaryAccount = authorization.accounts[0];
      if (!primaryAccount) {
        throw new Error('Wallet returned no accounts.');
      }

      const normalized = normalizeAccount(primaryAccount);
      const nextSession: StoredWalletSession = {
        ...normalized,
        authToken: authorization.auth_token,
        walletUriBase: authorization.wallet_uri_base ?? null,
      };

      setSession(nextSession);
      await persistSession(nextSession);
      return nextSession;
    },
    [persistSession]
  );

  const clearSession = useCallback(async () => {
    setSession(null);
    await persistSession(null);
  }, [persistSession]);

  const authorizeWallet = useCallback(
    async (wallet: Web3MobileWallet) => {
      if (session?.authToken) {
        try {
          return await wallet.reauthorize({
            auth_token: session.authToken,
            identity: APP_IDENTITY,
          });
        } catch {
          await clearSession();
        }
      }

      return wallet.authorize({
        cluster: SOLANA_CLUSTER,
        identity: APP_IDENTITY,
      });
    },
    [clearSession, session?.authToken]
  );

  const connect = useCallback(async () => {
    if (connecting) return;

    setConnecting(true);
    setError(null);

    try {
      await transact(async (wallet) => {
        const authorization = await authorizeWallet(wallet);
        await applyAuthorization(authorization);
      });
    } catch (nextError) {
      setError(getWalletErrorMessage(nextError));
    } finally {
      setConnecting(false);
    }
  }, [applyAuthorization, authorizeWallet, connecting]);

  const disconnect = useCallback(async () => {
    const authToken = session?.authToken;

    setError(null);

    try {
      if (authToken) {
        await transact(async (wallet) => {
          await wallet.deauthorize({ auth_token: authToken });
        });
      }
    } catch {
      // Clear the local session even if the wallet-side deauthorization failed.
    } finally {
      await clearSession();
    }
  }, [clearSession, session?.authToken]);

  const signTransaction = useCallback(
    async <T extends SignableTransaction>(transaction: T): Promise<T> => {
      let signedTransaction: T | null = null;

      try {
        await transact(async (wallet) => {
          const authorization = await authorizeWallet(wallet);
          await applyAuthorization(authorization);

          const [result] = await wallet.signTransactions({
            transactions: [transaction],
          });

          signedTransaction = result as T;
        });
      } catch (nextError) {
        const message = getWalletErrorMessage(nextError);
        setError(message);
        throw nextError instanceof Error ? nextError : new Error(message);
      }

      if (!signedTransaction) {
        throw new Error('Failed to sign transaction.');
      }

      return signedTransaction;
    },
    [applyAuthorization, authorizeWallet]
  );

  const signMessage = useCallback(
    async (message: Uint8Array) => {
      if (!session?.addressBase64) {
        throw new Error('Wallet not connected.');
      }

      let signedMessage: Uint8Array | null = null;

      try {
        await transact(async (wallet) => {
          const authorization = await authorizeWallet(wallet);
          const activeSession = await applyAuthorization(authorization);
          const [result] = await wallet.signMessages({
            addresses: [activeSession.addressBase64],
            payloads: [message],
          });

          signedMessage = result;
        });
      } catch (nextError) {
        const message = getWalletErrorMessage(nextError);
        setError(message);
        throw nextError instanceof Error ? nextError : new Error(message);
      }

      if (!signedMessage) {
        throw new Error('Failed to sign message.');
      }

      return signedMessage;
    },
    [applyAuthorization, authorizeWallet, session?.addressBase64]
  );

  const publicKey = useMemo(() => {
    if (!session?.addressBase58) return null;
    try {
      return new PublicKey(session.addressBase58);
    } catch {
      return null;
    }
  }, [session?.addressBase58]);

  const walletLabel = useMemo(
    () => getWalletDisplayName(session?.walletUriBase ?? null),
    [session?.walletUriBase]
  );

  const value = useMemo(
    () => ({
      publicKey,
      connected: !!publicKey && !!session?.authToken,
      connecting,
      restoring,
      walletLabel,
      walletUriBase: session?.walletUriBase ?? null,
      accountLabel: session?.accountLabel ?? null,
      error,
      clearError: () => setError(null),
      connect,
      disconnect,
      signTransaction,
      signMessage,
    }),
    [
      connect,
      connecting,
      disconnect,
      error,
      publicKey,
      restoring,
      session?.accountLabel,
      session?.authToken,
      session?.walletUriBase,
      signMessage,
      signTransaction,
      walletLabel,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = () => useContext(WalletContext);
