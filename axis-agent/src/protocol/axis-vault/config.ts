import { PublicKey } from '@solana/web3.js';

export type Cluster = 'mainnet' | 'devnet';

export interface ProgramRef {
  name: string;
  address: PublicKey;
  role: string;
  scope: 'mainnet-v1' | 'research' | 'legacy';
}

export interface ClusterConfig {
  cluster: Cluster;
  label: string;
  rpcUrl: string;
  /** explorer query parameter — empty string means mainnet (default Explorer view). */
  explorerCluster: 'devnet' | '';
  jupiterEnabled: boolean;
  protocolTreasury: PublicKey;
  programs: ProgramRef[];
}

export const AXIS_VAULT_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_AXIS_VAULT_PROGRAM_ID ?? 'Agae3WetHx7J9CE7nP927ekzAeegSKE1KfkZDMYLDGHX'
);

export const PFDA_AMM3_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PFDA_AMM3_PROGRAM_ID ?? '3SBbfZgzAHyaijxbUbxBLt89aX6Z2d4ptL5PH6pzMazV'
);

export const MAINNET_PROTOCOL_TREASURY = new PublicKey(
  import.meta.env.VITE_AXIS_PROTOCOL_TREASURY ?? 'BtjuCMkLC9MuzagvGSS9E26XjMNTBR6isj8e1xVyeak6'
);

const MAINNET_PROGRAMS: ProgramRef[] = [
  {
    name: 'axis-vault',
    address: AXIS_VAULT_PROGRAM_ID,
    role: 'ETF lifecycle (Create / Deposit / Withdraw / Sweep / SetFee / SetCap)',
    scope: 'mainnet-v1',
  },
  {
    name: 'pfda-amm-3',
    address: PFDA_AMM3_PROGRAM_ID,
    role: '3-token PFDA batch auction with Switchboard oracle + Jito bid',
    scope: 'mainnet-v1',
  },
];

const DEVNET_PROGRAMS: ProgramRef[] = MAINNET_PROGRAMS.map((p) => ({ ...p }));

export function getClusterConfig(cluster: Cluster = 'mainnet'): ClusterConfig {
  if (cluster === 'mainnet') {
    return {
      cluster,
      label: 'mainnet-beta',
      rpcUrl:
        import.meta.env.VITE_RPC_URL ??
        import.meta.env.VITE_MAINNET_RPC_URL ??
        'https://api.mainnet-beta.solana.com',
      explorerCluster: '',
      jupiterEnabled: true,
      protocolTreasury: MAINNET_PROTOCOL_TREASURY,
      programs: MAINNET_PROGRAMS,
    };
  }

  return {
    cluster,
    label: 'devnet',
    rpcUrl:
      import.meta.env.VITE_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com',
    explorerCluster: 'devnet',
    jupiterEnabled: false,
    protocolTreasury: MAINNET_PROTOCOL_TREASURY,
    programs: DEVNET_PROGRAMS,
  };
}
