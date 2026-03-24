import { useState, useCallback, useRef } from 'react';
import {
  SolanaMobileWalletAdapter,
  createDefaultAuthorizationResultCache,
  createDefaultAddressSelector,
} from '@solana-mobile/wallet-adapter-mobile';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';

const MWA_APP_IDENTITY = {
  name: 'Axis Protocol',
  uri: 'https://axis-agent.pages.dev',
  icon: 'favicon.ico',
} as const;

export interface MWAWalletState {
  connected: boolean;
  connecting: boolean;
  publicKey: PublicKey | null;
  signTransaction: ((tx: Transaction) => Promise<Transaction>) | undefined;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useMobileWalletAdapter(connection: Connection): MWAWalletState {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  const adapterRef = useRef<SolanaMobileWalletAdapter | null>(null);

  const getAdapter = useCallback(() => {
    if (!adapterRef.current) {
      adapterRef.current = new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: MWA_APP_IDENTITY,
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: 'devnet',
        onWalletNotFound: async () => {
          throw new Error('Seeker wallet not found');
        },
      });
    }
    return adapterRef.current;
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const adapter = getAdapter();
      await adapter.connect();
      if (adapter.publicKey) {
        setPublicKey(new PublicKey(adapter.publicKey.toBytes()));
      }
    } finally {
      setConnecting(false);
    }
  }, [getAdapter]);

  const disconnect = useCallback(async () => {
    const adapter = adapterRef.current;
    if (adapter) {
      try { await adapter.disconnect(); } catch { /* ignored */ }
    }
    setPublicKey(null);
  }, []);

  const signTransaction = useCallback(
    async (tx: Transaction): Promise<Transaction> => {
      const adapter = getAdapter();
      const [signed] = await adapter.signAllTransactions([tx]);
      return signed;
    },
    [getAdapter]
  );

  return {
    connected: !!publicKey,
    connecting,
    publicKey,
    signTransaction: publicKey ? signTransaction : undefined,
    connect,
    disconnect,
  };
}
