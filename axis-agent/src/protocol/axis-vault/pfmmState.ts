import { Connection, PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

/// On-chain layout of `PoolState3` from contracts/pfda-amm-3/src/state/pool_state.rs.
/// `repr(C)` with `u32 weights[3]` followed by `u64 window_slots` produces a
/// 4-byte alignment pad before the first u64, which is why `window_slots`
/// starts at 240 (not 236) and `current_window_end` lands at 256.
const OFFSET_DISCRIMINATOR = 0;
const OFFSET_TOKEN_MINTS = 8;
const OFFSET_VAULTS = 104;
const OFFSET_RESERVES = 200;
const OFFSET_WEIGHTS = 224;
const OFFSET_WINDOW_SLOTS = 240;
const OFFSET_CURRENT_BATCH_ID = 248;
const OFFSET_CURRENT_WINDOW_END = 256;
const OFFSET_TREASURY = 264;
const OFFSET_AUTHORITY = 296;
const OFFSET_BASE_FEE_BPS = 328;
const OFFSET_PAUSED = 332;
const POOL_LEN = 336;

const POOL_DISCRIMINATOR = Buffer.from('pool3st\0');

export interface PoolState3Data {
  pool: PublicKey;
  tokenMints: [PublicKey, PublicKey, PublicKey];
  vaults: [PublicKey, PublicKey, PublicKey];
  reserves: [bigint, bigint, bigint];
  weights: [number, number, number];
  windowSlots: bigint;
  currentBatchId: bigint;
  currentWindowEnd: bigint;
  treasury: PublicKey;
  authority: PublicKey;
  baseFeeBps: number;
  paused: boolean;
}

export function decodePoolState3(pool: PublicKey, raw: Buffer | Uint8Array): PoolState3Data {
  const data = Buffer.from(raw);
  if (data.length < POOL_LEN) {
    throw new Error(
      `pool state too short: ${data.length} bytes, expected >= ${POOL_LEN}`
    );
  }
  const disc = data.subarray(OFFSET_DISCRIMINATOR, OFFSET_DISCRIMINATOR + 8);
  if (!disc.equals(POOL_DISCRIMINATOR)) {
    throw new Error(`pool state discriminator mismatch: got ${disc.toString('hex')}`);
  }
  const readPk = (off: number): PublicKey =>
    new PublicKey(data.subarray(off, off + 32));

  const tokenMints: [PublicKey, PublicKey, PublicKey] = [
    readPk(OFFSET_TOKEN_MINTS),
    readPk(OFFSET_TOKEN_MINTS + 32),
    readPk(OFFSET_TOKEN_MINTS + 64),
  ];
  const vaults: [PublicKey, PublicKey, PublicKey] = [
    readPk(OFFSET_VAULTS),
    readPk(OFFSET_VAULTS + 32),
    readPk(OFFSET_VAULTS + 64),
  ];
  const reserves: [bigint, bigint, bigint] = [
    data.readBigUInt64LE(OFFSET_RESERVES),
    data.readBigUInt64LE(OFFSET_RESERVES + 8),
    data.readBigUInt64LE(OFFSET_RESERVES + 16),
  ];
  const weights: [number, number, number] = [
    data.readUInt32LE(OFFSET_WEIGHTS),
    data.readUInt32LE(OFFSET_WEIGHTS + 4),
    data.readUInt32LE(OFFSET_WEIGHTS + 8),
  ];

  return {
    pool,
    tokenMints,
    vaults,
    reserves,
    weights,
    windowSlots: data.readBigUInt64LE(OFFSET_WINDOW_SLOTS),
    currentBatchId: data.readBigUInt64LE(OFFSET_CURRENT_BATCH_ID),
    currentWindowEnd: data.readBigUInt64LE(OFFSET_CURRENT_WINDOW_END),
    treasury: readPk(OFFSET_TREASURY),
    authority: readPk(OFFSET_AUTHORITY),
    baseFeeBps: data.readUInt16LE(OFFSET_BASE_FEE_BPS),
    paused: data.readUInt8(OFFSET_PAUSED) !== 0,
  };
}

export async function fetchPoolState3(
  conn: Connection,
  pool: PublicKey
): Promise<PoolState3Data | null> {
  const info = await conn.getAccountInfo(pool, 'confirmed');
  if (!info) return null;
  return decodePoolState3(pool, info.data);
}
