import { useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { ConnectionContext } from './context/ConnectionContext';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'cmmty4ru802060cjplthsx04y';

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: false,
});

export const Providers: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(
    () => import.meta.env.VITE_RPC_URL || clusterApiUrl('devnet'),
    []
  );
  const connection = useMemo(() => new Connection(endpoint), [endpoint]);

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#D97706',
          logo: '/AxisLogoo.png',
          walletChainType: 'solana-only',
          walletList: ['detected_solana_wallets'],
        },
        loginMethods: ['wallet', 'email'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
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
