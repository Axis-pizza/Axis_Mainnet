import { createContext, useContext } from 'react';
import type { Connection } from '@solana/web3.js';

interface ConnectionContextState {
  connection: Connection;
}

export const ConnectionContext = createContext<ConnectionContextState>(
  {} as ConnectionContextState
);

export const useConnectionContext = () => useContext(ConnectionContext);
