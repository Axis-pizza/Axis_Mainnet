import { useState, useCallback, useRef } from 'react';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';

const APP_IDENTITY = {
  name: 'Axis Pizza',
  uri: 'https://axs.pizza',
  icon: '/icon.png',
};

export interface MWAWalletState {
  connected: boolean;
  connecting: boolean;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | undefined;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  error: string | null;
}

let mwaRegistered = false;

/**
 * Registers MWA as a wallet standard provider using @solana-mobile/wallet-standard-mobile.
 * This is the Privy-recommended approach.
 *
 * Called ONLY when user clicks "Connect with Seeker" — not on page load.
 * After registration, Privy's login modal will show Seed Vault as a wallet option.
 */
async function ensureMwaRegistered() {
  if (mwaRegistered) return;
  const {
    registerMwa,
    createDefaultAuthorizationCache,
    createDefaultChainSelector,
    createDefaultWalletNotFoundHandler,
  } = await import('@solana-mobile/wallet-standard-mobile');

  registerMwa({
    appIdentity: APP_IDENTITY,
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:devnet'],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });
  mwaRegistered = true;
}

/**
 * MWA hook — registers the wallet standard provider on-demand,
 * then opens Privy's login modal which will now show Seed Vault.
 */
export function useMobileWalletAdapter(_connection: Connection): MWAWalletState {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      await ensureMwaRegistered();
      // After registration, Privy will detect MWA as a wallet.
      // The caller (ProfileView) should then open Privy's login modal.
      setConnecting(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Registration failed';
      setError(msg);
      setConnecting(false);
      throw e;
    }
  }, []);

  return {
    connected: false, // Privy handles the actual connection state
    connecting,
    publicKey: null,
    signTransaction: undefined,
    connect,
    disconnect: async () => {},
    error,
  };
}
