import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  type AccountMeta,
} from '@solana/web3.js';
import { Buffer } from 'buffer';

export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/// Jupiter v6 lite-api host. Override via `VITE_JUPITER_HOST` for paid endpoints.
export const DEFAULT_JUPITER_HOST = 'https://lite-api.jup.ag';
export const DEFAULT_JUPITER_PATH = '/swap/v1';

export type SwapMode = 'ExactIn' | 'ExactOut';

export interface JupiterQuoteParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  slippageBps: number;
  swapMode?: SwapMode;
  maxAccounts?: number;
  jupiterHost?: string;
  jupiterPath?: string;
  signal?: AbortSignal;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: SwapMode;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: unknown[];
  contextSlot?: number;
}

interface SerializedIxAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface SerializedIx {
  programId: string;
  accounts: SerializedIxAccount[];
  data: string;
}

export interface JupiterSwapInstructionsResponse {
  computeBudgetInstructions: SerializedIx[];
  setupInstructions: SerializedIx[];
  swapInstruction: SerializedIx;
  cleanupInstruction?: SerializedIx | null;
  addressLookupTableAddresses: string[];
}

export class JupiterApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number | 'network',
    public readonly bodySnippet: string
  ) {
    super(
      `Jupiter ${endpoint} failed: ${status === 'network' ? 'network/timeout' : `HTTP ${status}`}` +
        (bodySnippet ? ` — ${bodySnippet}` : '')
    );
    this.name = 'JupiterApiError';
  }
}

function endpoint(host: string | undefined, path: string | undefined, suffix: string): string {
  const h = host ?? import.meta.env.VITE_JUPITER_HOST ?? DEFAULT_JUPITER_HOST;
  const p = path ?? DEFAULT_JUPITER_PATH;
  return `${h}${p}${suffix}`;
}

async function fetchJson<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (e) {
    throw new JupiterApiError(url, 'network', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = (await res.text()).slice(0, 240);
    } catch {
      /* ignore */
    }
    throw new JupiterApiError(url, res.status, bodyText);
  }
  return (await res.json()) as T;
}

export async function getQuote(params: JupiterQuoteParams): Promise<JupiterQuoteResponse> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint.toBase58(),
    outputMint: params.outputMint.toBase58(),
    amount: params.amount.toString(),
    slippageBps: params.slippageBps.toString(),
    swapMode: params.swapMode ?? 'ExactIn',
    maxAccounts: (params.maxAccounts ?? 24).toString(),
    onlyDirectRoutes: 'false',
  });
  return fetchJson<JupiterQuoteResponse>(
    `${endpoint(params.jupiterHost, params.jupiterPath, '/quote')}?${qs.toString()}`,
    { method: 'GET' },
    params.signal
  );
}

export async function getSwapInstructions(params: {
  quote: JupiterQuoteResponse;
  userPublicKey: PublicKey;
  wrapAndUnwrapSol?: boolean;
  destinationTokenAccount?: PublicKey;
  jupiterHost?: string;
  jupiterPath?: string;
  signal?: AbortSignal;
}): Promise<JupiterSwapInstructionsResponse> {
  return fetchJson<JupiterSwapInstructionsResponse>(
    endpoint(params.jupiterHost, params.jupiterPath, '/swap-instructions'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: params.quote,
        userPublicKey: params.userPublicKey.toBase58(),
        wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? false,
        destinationTokenAccount: params.destinationTokenAccount?.toBase58(),
        useSharedAccounts: true,
      }),
    },
    params.signal
  );
}

export function deserializeIx(raw: SerializedIx): TransactionInstruction {
  const keys: AccountMeta[] = raw.accounts.map((a) => ({
    pubkey: new PublicKey(a.pubkey),
    isSigner: a.isSigner,
    isWritable: a.isWritable,
  }));
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys,
    data: Buffer.from(raw.data, 'base64'),
  });
}

export async function fetchAltAccounts(
  conn: Connection,
  addresses: string[]
): Promise<AddressLookupTableAccount[]> {
  const uniq = Array.from(new Set(addresses));
  if (uniq.length === 0) return [];
  const infos = await conn.getMultipleAccountsInfo(uniq.map((a) => new PublicKey(a)));
  const out: AddressLookupTableAccount[] = [];
  for (let i = 0; i < uniq.length; i++) {
    const info = infos[i];
    if (!info) continue;
    out.push(
      new AddressLookupTableAccount({
        key: new PublicKey(uniq[i]),
        state: AddressLookupTableAccount.deserialize(info.data),
      })
    );
  }
  return out;
}
