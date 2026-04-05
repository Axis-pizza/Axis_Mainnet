import { useMemo, useCallback } from 'react';
import type { FC, ReactNode } from 'react';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import {
  registerMwa,
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-standard-mobile';
import { ConnectionContext } from './context/ConnectionContext';
import { setupMwaHostObserver } from './utils/setupMwaHostObserver';
import { isAndroidChrome, isIOSBrowser } from './utils/seekerDetect';
import '@solana/wallet-adapter-react-ui/styles.css';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'cmmty4ru802060cjplthsx04y';
const IS_ANDROID_MWA = isAndroidChrome();
const IS_IOS_BROWSER = isIOSBrowser();
const DESKTOP_WALLET_LIST = ['phantom', 'solflare', 'backpack', 'detected_solana_wallets'] as const;
const IOS_WALLET_LIST = ['phantom', 'solflare', 'backpack', 'jupiter'] as const;
const PRIVY_WALLET_LIST = IS_IOS_BROWSER ? IOS_WALLET_LIST : DESKTOP_WALLET_LIST;

// --- Register MWA only for Android Chrome / TWA ---

function getUriForAppIdentity() {
  const location = globalThis.location;
  if (!location) return undefined;
  return `${location.protocol}//${location.host}`;
}

if (IS_ANDROID_MWA) {
  setupMwaHostObserver();
  registerMwa({
    appIdentity: {
      name: 'Axis',
      uri: getUriForAppIdentity(),
      icon: '/icon.png',
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:mainnet'],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });
}

const MobileProviders: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(
    () => import.meta.env.VITE_RPC_URL || 'https://rpc.ankr.com/solana',
    []
  );
  const onError = useCallback((err: WalletError) => {
    console.error('[Wallet]', err.name, err.message);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={[]} autoConnect onError={onError}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

const PrivyProviders: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(
    () => import.meta.env.VITE_RPC_URL || 'https://rpc.ankr.com/solana',
    []
  );
  const connection = useMemo(() => new Connection(endpoint, 'confirmed'), [endpoint]);

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          showWalletLoginFirst: true,
          walletChainType: 'solana-only',
          walletList: [...PRIVY_WALLET_LIST],
          theme: 'dark',
          accentColor: '#D97706',
          logo: '/AxisLogoo.png',
        },
        loginMethods: ['wallet'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
      }}
    >
      <ConnectionContext.Provider value={{ connection }}>
        {children}
      </ConnectionContext.Provider>
    </PrivyProvider>
  );
};

export const Providers: FC<{ children: ReactNode }> = ({ children }) => {
  if (IS_ANDROID_MWA) {
    return <MobileProviders>{children}</MobileProviders>;
  }

  return <PrivyProviders>{children}</PrivyProviders>;
};
