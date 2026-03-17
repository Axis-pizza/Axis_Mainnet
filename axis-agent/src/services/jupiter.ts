import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { api } from './api';

export interface JupiterToken {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string;
  tags: string[];
  isVerified?: boolean;
  price?: number;
  balance?: number;
  source?: string;
  dailyVolume?: number;
  marketCap?: number;
  isMock?: boolean;
  predictionMeta?: {
    eventId: string;
    eventTitle: string;
    marketId: string;
    marketQuestion: string;
    side: 'YES' | 'NO';
    expiry: string;
  };
}

// Minimum fallback token list
const CRITICAL_FALLBACK: JupiterToken[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    chainId: 101,
    decimals: 9,
    name: 'Wrapped SOL',
    symbol: 'SOL',
    logoURI:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    tags: ['verified'],
    isVerified: true,
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    chainId: 101,
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    tags: ['verified'],
    isVerified: true,
  },
];

// Client-side memory cache
let liteCache: JupiterToken[] | null = null;
let pendingListPromise: Promise<JupiterToken[]> | null = null;

export const JupiterService = {
  getLiteList: async (): Promise<JupiterToken[]> => {
    if (liteCache) return liteCache;
    if (pendingListPromise) return pendingListPromise;

    pendingListPromise = (async () => {
      try {
        const response = await api.get('/jupiter/tokens');
        if (response && response.tokens && Array.isArray(response.tokens)) {
          const tokens: JupiterToken[] = response.tokens.map((t: JupiterToken) => ({
            ...t,
            isVerified: t.isVerified ?? (Array.isArray(t.tags) && t.tags.includes('verified')),
          }));
          liteCache = tokens;
          return tokens;
        }
        throw new Error('Invalid token list format');
      } catch (e) {
        console.warn('Axis API token list fetch failed, using fallback', e);
        return CRITICAL_FALLBACK;
      }
    })();

    try {
      return await pendingListPromise;
    } finally {
      pendingListPromise = null;
    }
  },

  getTrendingTokens: async (): Promise<JupiterToken[]> => {
    try {
      const response = await api.get('/jupiter/trending?category=toptrending&interval=24h&limit=50');
      if (response && response.tokens && Array.isArray(response.tokens)) {
        return response.tokens.map((t: JupiterToken) => ({
          ...t,
          isVerified: t.isVerified ?? (Array.isArray(t.tags) && t.tags.includes('verified')),
        }));
      }
      return [];
    } catch {
      return [];
    }
  },

  getPrices: async (mintAddresses: string[]): Promise<Record<string, number>> => {
    const validMints = mintAddresses.filter((m) => m && m.length > 30);
    if (validMints.length === 0) return {};
    try {
      const idsParam = validMints.join(',');
      const response = await api.get(`/jupiter/prices?ids=${idsParam}`);
      if (response && response.prices) return response.prices;
      return {};
    } catch (e) {
      console.error('Axis API price fetch failed:', e);
      return {};
    }
  },

  searchTokens: async (query: string): Promise<JupiterToken[]> => {
    const q = query.trim();
    if (!q) return [];

    // 1. CA (Contract Address) lookup
    if (q.length > 30) {
      const lowerQ = q.toLowerCase();
      if (liteCache) {
        const match = liteCache.find((t) => t.address === lowerQ || t.address.toLowerCase() === lowerQ);
        if (match) return [match];
      }
      const fetched = await JupiterService.fetchTokenByMint(q);
      return fetched ? [fetched] : [];
    }

    let results: JupiterToken[] = [];
    
    // 2. Try backend BFF Search
    try {
      const response = await api.get(`/jupiter/search?q=${encodeURIComponent(q)}`);
      if (response && response.tokens && Array.isArray(response.tokens) && response.tokens.length > 0) {
        results = response.tokens.map((t: JupiterToken) => ({
          ...t,
          isVerified: t.isVerified ?? (Array.isArray(t.tags) && t.tags.includes('verified')),
        }));
      }
    } catch {
      console.warn('Axis API search failed. Trying fallback...');
    }

    // 3. Fallback: DexScreener search for new meme coins (Jupiter avoids listing these initially)
    if (results.length === 0) {
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
        if (dexRes.ok) {
          const dexData = await dexRes.json();
          if (dexData.pairs && dexData.pairs.length > 0) {
            // Extract token data DIRECTLY from search results — no second API round-trip
            const seen = new Set<string>();
            results = dexData.pairs
              .filter((p: any) => p.chainId === 'solana')
              .filter((p: any) => {
                const addr = p.baseToken?.address;
                if (!addr || seen.has(addr)) return false;
                seen.add(addr);
                return true;
              })
              .slice(0, 8)
              .map((p: any): JupiterToken => ({
                address: p.baseToken.address,
                chainId: 101,
                decimals: p.baseToken.decimals ?? 6,
                name: p.baseToken.name || p.baseToken.symbol,
                symbol: p.baseToken.symbol,
                logoURI: p.info?.imageUrl || '',
                tags: ['unverified', 'dexscreener'],
                isVerified: false,
                dailyVolume: p.volume?.h24,
                marketCap: p.fdv ?? p.marketCap,
              }));
          }
        }
      } catch (e) {
        console.warn('DexScreener search fallback failed:', e);
      }
    }

    // 4. Final Fallback to client-side filtering
    if (results.length === 0) {
      const list = await JupiterService.getLiteList();
      const lowerQ = q.toLowerCase();
      results = list
        .filter((t) => t.symbol.toLowerCase().includes(lowerQ) || t.name.toLowerCase().includes(lowerQ))
        .slice(0, 50);
    }

    return results;
  },

  getToken: async (mint: string): Promise<JupiterToken | null> => {
    const list = await JupiterService.getLiteList();
    const cached = list.find((t) => t.address === mint);
    if (cached) return cached;
    return JupiterService.fetchTokenByMint(mint);
  },

  /**
   * Fetch a single token by mint address without relying on dead Jupiter APIs.
   * Combines DexScreener (for Name/Logo) and Solana Public RPC (for exact Decimals).
   */
  fetchTokenByMint: async (mint: string): Promise<JupiterToken | null> => {
    try {
      // Parallel fetch to DexScreener & Solana mainnet RPC (always mainnet for token metadata)
      const [dexRes, rpcRes] = await Promise.all([
        fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`).catch(() => null),
        fetch('https://api.mainnet-beta.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenSupply',
            params: [mint]
          })
        }).catch(() => null)
      ]);

      let name = 'Unknown Token';
      let symbol = 'UNKNOWN';
      let logoURI = '';
      let decimals = 6; // Standard fallback for pump.fun

      // Extract Name, Symbol, and Logo from DexScreener
      if (dexRes && dexRes.ok) {
        const dexData = await dexRes.json();
        if (dexData.pairs && dexData.pairs.length > 0) {
          const pair = dexData.pairs[0];
          if (pair.baseToken.address === mint) {
            name = pair.baseToken.name;
            symbol = pair.baseToken.symbol;
          } else if (pair.quoteToken.address === mint) {
            name = pair.quoteToken.name;
            symbol = pair.quoteToken.symbol;
          }
          if (pair.info && pair.info.imageUrl) {
            logoURI = pair.info.imageUrl;
          }
        }
      }

      // Extract exact decimals directly from Solana Blockchain (Critical for ETF tx)
      if (rpcRes && rpcRes.ok) {
        const rpcData = await rpcRes.json();
        if (rpcData.result && rpcData.result.value) {
          decimals = rpcData.result.value.decimals;
        }
      }

      const token: JupiterToken = {
        address: mint,
        chainId: 101,
        decimals: decimals,
        name: name,
        symbol: symbol,
        logoURI: logoURI,
        tags: ['unverified', 'dexscreener'],
        isVerified: false,
      };

      // Save to cache
      if (liteCache && !liteCache.find((t) => t.address === token.address)) {
        liteCache.push(token);
      }
      return token;
    } catch (e) {
      console.warn('Fallback fetchTokenByMint failed:', e);
      return null;
    }
  },

  getFallbackTokens: () => CRITICAL_FALLBACK,
};

export const WalletService = {
  getUserTokens: async (
    connection: Connection,
    walletPublicKey: PublicKey
  ): Promise<JupiterToken[]> => {
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const heldTokens = tokenAccounts.value
        .map((account) => ({
          mint: account.account.data.parsed.info.mint as string,
          amount: account.account.data.parsed.info.tokenAmount.uiAmount as number,
        }))
        .filter((t) => t.amount > 0);

      const solBalance = await connection.getBalance(walletPublicKey);
      if (solBalance > 0) {
        heldTokens.push({
          mint: 'So11111111111111111111111111111111111111112',
          amount: solBalance / 1e9,
        });
      }

      const allTokens = await JupiterService.getLiteList();

      const result = heldTokens.map((held) => {
        const meta = allTokens.find((t) => t.address === held.mint);
        if (meta) {
          return { ...meta, balance: held.amount };
        } else {
          return {
            address: held.mint,
            chainId: 101,
            decimals: 0, // In wallet view, decimals are less critical if UI amount is parsed
            name: 'Unknown',
            symbol: 'UNKNOWN',
            logoURI: '',
            tags: ['unknown'],
            isVerified: false,
            balance: held.amount,
          };
        }
      });

      return result.sort((a, b) => (b.balance || 0) - (a.balance || 0));
    } catch {
      return [];
    }
  },
};