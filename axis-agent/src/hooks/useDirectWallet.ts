import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

/// Phantom-direct wallet fallback. Bypasses Privy entirely so the app
/// can keep working when the Privy auth iframe is blocked (CSP /
/// `frame-ancestors` mismatch on a domain that isn't in the Privy app's
/// allowed origins). Only Phantom-compatible providers exposing
/// `window.solana` / `window.phantom.solana` are supported — that's
/// Phantom, Solflare, Backpack, OKX, Brave wallet, etc.

interface PhantomLikeProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions?<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
  on?: (event: 'connect' | 'disconnect' | 'accountChanged', cb: (...args: unknown[]) => void) => void;
  off?: (event: 'connect' | 'disconnect' | 'accountChanged', cb: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    solana?: PhantomLikeProvider;
    phantom?: { solana?: PhantomLikeProvider };
  }
}

function getProvider(): PhantomLikeProvider | null {
  if (typeof window === 'undefined') return null;
  return window.phantom?.solana ?? window.solana ?? null;
}

const STORAGE_KEY = 'axis-direct-wallet-v1';

export interface DirectWalletState {
  publicKey: PublicKey | null;
  connecting: boolean;
  /** True if a Phantom-compatible provider is detected on `window`. */
  isAvailable: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
}

export function useDirectWallet(): DirectWalletState {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  /// Ref so the event handlers below can reach the latest setters without
  /// re-subscribing every render.
  const setStateRef = useRef({ setPublicKey });
  setStateRef.current.setPublicKey = setPublicKey;

  useEffect(() => {
    const provider = getProvider();
    if (!provider) {
      setIsAvailable(false);
      return;
    }
    setIsAvailable(true);

    const handleConnect = () => {
      const pk = provider.publicKey;
      if (pk) {
        const next = new PublicKey(pk.toString());
        setStateRef.current.setPublicKey(next);
        try {
          localStorage.setItem(STORAGE_KEY, next.toBase58());
        } catch {
          /* private mode etc */
        }
      }
    };
    const handleDisconnect = () => {
      setStateRef.current.setPublicKey(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    };
    const handleAccountChanged = () => {
      const pk = provider.publicKey;
      if (pk) {
        const next = new PublicKey(pk.toString());
        setStateRef.current.setPublicKey(next);
      } else {
        setStateRef.current.setPublicKey(null);
      }
    };

    // Trusted reconnect: if we connected before, Phantom will return the
    // saved authorization without showing the popup. If the user revoked
    // permission, this rejects silently and we clear the stale flag.
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored) {
      provider
        .connect({ onlyIfTrusted: true })
        .then(handleConnect)
        .catch(() => {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* ignore */
          }
        });
    } else if (provider.isConnected && provider.publicKey) {
      handleConnect();
    }

    provider.on?.('connect', handleConnect);
    provider.on?.('disconnect', handleDisconnect);
    provider.on?.('accountChanged', handleAccountChanged);
    return () => {
      provider.off?.('connect', handleConnect);
      provider.off?.('disconnect', handleDisconnect);
      provider.off?.('accountChanged', handleAccountChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      throw new Error(
        'No Phantom-compatible wallet found. Install Phantom, Solflare, or Backpack and reload.'
      );
    }
    setConnecting(true);
    try {
      const res = await provider.connect();
      const next = new PublicKey(res.publicKey.toString());
      setPublicKey(next);
      try {
        localStorage.setItem(STORAGE_KEY, next.toBase58());
      } catch {
        /* ignore */
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const provider = getProvider();
    try {
      await provider?.disconnect?.();
    } catch {
      /* ignore */
    }
    setPublicKey(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const signTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      const provider = getProvider();
      if (!provider) {
        throw new Error('Phantom-compatible wallet not available');
      }
      return await provider.signTransaction(tx);
    },
    []
  );

  return { publicKey, connecting, isAvailable, connect, disconnect, signTransaction };
}
