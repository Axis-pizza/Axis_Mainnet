import { useMemo, useCallback } from 'react';
import type { FC, ReactNode } from 'react';
import { clusterApiUrl } from '@solana/web3.js';
import { WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { AxisWalletModalProvider } from './components/common/WalletModal';
import {
  registerMwa,
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-standard-mobile';

// --- Register MWA (handles non-Android gracefully) ---

function getUriForAppIdentity() {
  const location = globalThis.location;
  if (!location) return undefined;
  return `${location.protocol}//${location.host}`;
}

registerMwa({
  appIdentity: {
    name: 'Axis',
    uri: getUriForAppIdentity(),
    icon: '/icon.png',
  },
  authorizationCache: createDefaultAuthorizationCache(),
  chains: ['solana:devnet', 'solana:mainnet'],
  chainSelector: createDefaultChainSelector(),
  onWalletNotFound: createDefaultWalletNotFoundHandler(),
});

// --- Single unified provider (same approach as Perena) ---

export const Providers: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(
    () => import.meta.env.VITE_RPC_URL || clusterApiUrl('devnet'),
    []
  );
  const onError = useCallback((err: WalletError) => {
    console.error('[Wallet]', err.name, err.message);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={[]} autoConnect onError={onError}>
        <AxisWalletModalProvider>
          {children}
        </AxisWalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
