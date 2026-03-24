import { useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { ConnectionContext } from './context/ConnectionContext';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'cmmty4ru802060cjplthsx04y';

const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// detected_solana_wallets で Seeker 含む注入済みウォレットを自動検出
const walletList = isMobile
  ? ['phantom', 'solflare', 'backpack', 'detected_solana_wallets', 'wallet_connect'] as any
  : ['phantom', 'solflare', 'backpack', 'detected_solana_wallets'] as any;

export const Providers: FC<{ children: ReactNode }> = ({ children }) => {
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
          walletList,
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
