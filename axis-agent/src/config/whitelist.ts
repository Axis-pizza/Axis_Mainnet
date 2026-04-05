/**
 * Protocol-level asset whitelist for Axis MVP.
 * Only these tokens are eligible for ETF basket composition.
 *
 * Criteria: strong independent reference price, on-chain execution is
 * economically meaningful, and external actors can accurately estimate
 * arbitrage profitability (required for PFDA-based rebalancing).
 */

export interface WhitelistedAsset {
  symbol: string;
  name: string;
  address: string;
  logoURI: string;
  coingeckoId?: string;
}

export const WHITELISTED_ASSETS: WhitelistedAsset[] = [
  {
    symbol: 'SOL',
    name: 'Wrapped SOL',
    address: 'So11111111111111111111111111111111111111112',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    coingeckoId: 'solana',
  },
  {
    symbol: 'JitoSOL',
    name: 'Jito Staked SOL',
    address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    logoURI: 'https://storage.googleapis.com/token-metadata/JitoSOL-256.png',
    coingeckoId: 'jito-staked-sol',
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin (Portal)',
    address: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh/logo.png',
    coingeckoId: 'wrapped-bitcoin',
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ethereum (Portal)',
    address: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png',
    coingeckoId: 'ethereum',
  },
  {
    symbol: 'BONK',
    name: 'Bonk',
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
    coingeckoId: 'bonk',
  },
  {
    symbol: 'WIF',
    name: 'dogwifhat',
    address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    logoURI: 'https://bafkreibk3covs5ltyqxa272uodhculbgn2corrjglpguq4cghk5itakfhy.ipfs.nftstorage.link',
    coingeckoId: 'dogwifcoin',
  },
  {
    symbol: 'JUP',
    name: 'Jupiter',
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    logoURI: 'https://static.jup.ag/jup/icon.png',
    coingeckoId: 'jupiter-exchange-solana',
  },
  {
    symbol: 'PYTH',
    name: 'Pyth Network',
    address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    logoURI: 'https://pyth.network/token.svg',
    coingeckoId: 'pyth-network',
  },
];

/** Set of whitelisted mint addresses for O(1) lookup */
export const WHITELIST_ADDRESS_SET = new Set(WHITELISTED_ASSETS.map((a) => a.address));
