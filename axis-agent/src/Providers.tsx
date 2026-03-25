import { useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { ConnectionContext } from './context/ConnectionContext';
import { isAndroidChrome } from './utils/seekerDetect';

// --- Desktop: Privy ---
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

// --- Mobile: wallet-adapter ---
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { AxisWalletModalProvider } from './components/common/WalletModal';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'cmmty4ru802060cjplthsx04y';
const IS_MOBILE_WALLET_PATH = isAndroidChrome();
const desktopWalletList = ['phantom', 'solflare', 'backpack', 'detected_solana_wallets'] as any;

// --- Mobile Providers (wallet-adapter) ---
// WalletProvider auto-detects Android and injects SolanaMobileWalletAdapter.
// No need to call registerMwa() — wallet-adapter handles it internally.
const MobileProviders: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(
    () => import.meta.env.VITE_RPC_URL || clusterApiUrl('devnet'),
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={[]} autoConnect onError={(err) => console.error('[Wallet]', err)}>
        <AxisWalletModalProvider>
          {children}
        </AxisWalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

// --- Desktop Providers (Privy) ---
const DesktopProviders: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(
    () => import.meta.env.VITE_RPC_URL || clusterApiUrl('devnet'),
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
          walletList: desktopWalletList,
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
  if (IS_MOBILE_WALLET_PATH) {
    return <MobileProviders>{children}</MobileProviders>;
  }
  return <DesktopProviders>{children}</DesktopProviders>;
};
