import { Connection, PublicKey } from '@solana/web3.js';

/// Decoded view of `axis_vault::EtfState` (discriminator `etfstat3`, 536 bytes).
export interface EtfStateData {
  authority: PublicKey;
  etfMint: PublicKey;
  tokenCount: number;
  tokenMints: PublicKey[];
  tokenVaults: PublicKey[];
  weightsBps: number[];
  totalSupply: bigint;
  treasury: PublicKey;
  feeBps: number;
  paused: boolean;
  bump: number;
  name: string;
  ticker: string;
  createdAtSlot: bigint;
  maxFeeBps: number;
  tvlCap: bigint;
}

const ETF_DISCRIMINATOR = 'etfstat3';
export const ETF_STATE_SIZE = 536;

function readPubkey(data: Uint8Array, off: number): PublicKey {
  return new PublicKey(data.slice(off, off + 32));
}

function readU64(data: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(data[off + i]);
  return v;
}

function readU16(data: Uint8Array, off: number): number {
  return data[off] | (data[off + 1] << 8);
}

function readZeroPaddedString(data: Uint8Array, off: number, maxLen: number): string {
  let end = off;
  while (end < off + maxLen && data[end] !== 0) end++;
  return new TextDecoder().decode(data.slice(off, end));
}

export function decodeEtfState(raw: Uint8Array): EtfStateData {
  if (raw.length < ETF_STATE_SIZE) {
    throw new Error(
      `EtfState too small: ${raw.length} < ${ETF_STATE_SIZE} (wrong account?)`
    );
  }
  const disc = new TextDecoder().decode(raw.slice(0, 8));
  if (disc !== ETF_DISCRIMINATOR) {
    throw new Error(
      `EtfState discriminator mismatch: got "${disc}" want "${ETF_DISCRIMINATOR}"`
    );
  }
  const tokenCount = raw[72];
  if (tokenCount < 2 || tokenCount > 5) {
    throw new Error(`EtfState invalid tokenCount=${tokenCount}`);
  }
  const tokenMints: PublicKey[] = [];
  for (let i = 0; i < tokenCount; i++) tokenMints.push(readPubkey(raw, 73 + i * 32));
  const tokenVaults: PublicKey[] = [];
  for (let i = 0; i < tokenCount; i++) tokenVaults.push(readPubkey(raw, 233 + i * 32));
  const weightsBps: number[] = [];
  for (let i = 0; i < tokenCount; i++) weightsBps.push(readU16(raw, 394 + i * 2));

  return {
    authority: readPubkey(raw, 8),
    etfMint: readPubkey(raw, 40),
    tokenCount,
    tokenMints,
    tokenVaults,
    weightsBps,
    totalSupply: readU64(raw, 408),
    treasury: readPubkey(raw, 416),
    feeBps: readU16(raw, 448),
    paused: raw[450] !== 0,
    bump: raw[451],
    name: readZeroPaddedString(raw, 452, 32),
    ticker: readZeroPaddedString(raw, 484, 16),
    createdAtSlot: readU64(raw, 504),
    maxFeeBps: readU16(raw, 512),
    tvlCap: readU64(raw, 520),
  };
}

export async function fetchEtfState(
  conn: Connection,
  etfState: PublicKey
): Promise<EtfStateData> {
  const info = await conn.getAccountInfo(etfState, 'confirmed');
  if (!info) throw new Error(`EtfState ${etfState.toBase58()} not found`);
  return decodeEtfState(info.data);
}

/// Tri-state resolution of an EtfState PDA. The buy/sell routers MUST treat
/// these three outcomes differently:
///
/// - `present`: real axis-vault ETF — mint/burn a single ETF token.
/// - `absent`: the account genuinely does not exist on-chain — this is a
///   legitimate pre-axis-vault / PFMM-only strategy, so the Jupiter/PFMM
///   path is correct.
/// - `error`: the RPC call failed, or the account exists but failed to
///   decode (wrong layout / discriminator). We do NOT know whether this is
///   an ETF, so callers must surface the error and let the user retry —
///   never silently fall back to spot-swapping basket tokens into the
///   user's wallet, which would mis-route a real ETF deposit.
///
/// `fetchEtfState` collapses `absent` and `error` into one throw, which is
/// exactly the ambiguity that caused real ETFs to silently degrade to a
/// wallet spot-swap on a transient RPC hiccup or a name-derived PDA miss.
export type EtfStateResolution =
  | { kind: 'present'; data: EtfStateData }
  | { kind: 'absent' }
  | { kind: 'error'; error: Error };

export async function classifyEtfState(
  conn: Connection,
  etfState: PublicKey
): Promise<EtfStateResolution> {
  let info;
  try {
    info = await conn.getAccountInfo(etfState, 'confirmed');
  } catch (e) {
    return { kind: 'error', error: e instanceof Error ? e : new Error(String(e)) };
  }
  if (!info) return { kind: 'absent' };
  try {
    return { kind: 'present', data: decodeEtfState(info.data) };
  } catch (e) {
    return { kind: 'error', error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function decodeTokenAccountAmount(raw: Uint8Array): bigint {
  if (raw.length < 72) {
    throw new Error(`SPL token account too small: ${raw.length}`);
  }
  return readU64(raw, 64);
}

export async function fetchVaultBalances(
  conn: Connection,
  vaults: PublicKey[]
): Promise<bigint[]> {
  const infos = await conn.getMultipleAccountsInfo(vaults, 'confirmed');
  return infos.map((info, i) => {
    if (!info) throw new Error(`vault ${vaults[i].toBase58()} not found`);
    return decodeTokenAccountAmount(info.data);
  });
}

export function expectedWithdrawOutputs(
  vaultBalances: bigint[],
  burnAmount: bigint,
  totalSupply: bigint,
  feeBps: number
): { feeAmount: bigint; effectiveBurn: bigint; perLeg: bigint[] } {
  if (totalSupply === 0n) throw new Error('etfState.totalSupply is zero');
  if (burnAmount > totalSupply) {
    throw new Error(`burnAmount ${burnAmount} > totalSupply ${totalSupply}`);
  }
  const feeAmount = (burnAmount * BigInt(feeBps)) / 10_000n;
  const effectiveBurn = burnAmount - feeAmount;
  const perLeg = vaultBalances.map((bal) => (bal * effectiveBurn) / totalSupply);
  return { feeAmount, effectiveBurn, perLeg };
}
