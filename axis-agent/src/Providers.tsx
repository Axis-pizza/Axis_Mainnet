import { useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { Connection } from '@solana/web3.js';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { isIOSBrowser } from './utils/seekerDetect';
import { ConnectionContext } from './context/ConnectionContext';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'cmmty4ru802060cjplthsx04y';
const IS_IOS_BROWSER = isIOSBrowser();
const DESKTOP_WALLET_LIST = ['phantom', 'solflare', 'backpack', 'detected_solana_wallets'] as const;
const IOS_WALLET_LIST = ['phantom', 'solflare', 'backpack', 'jupiter'] as const;
const PRIVY_WALLET_LIST = IS_IOS_BROWSER ? IOS_WALLET_LIST : DESKTOP_WALLET_LIST;

export const Providers: FC<{ children: ReactNode }> = ({ children }) => {
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
