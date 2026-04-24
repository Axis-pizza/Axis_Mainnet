import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import type { Idl, Wallet } from '@coral-xyz/anchor';
import { KAGEMUSHA_IDL } from './idl';
import { PROGRAM_ID } from './config';
import { deriveUserPositionPda } from './pda';
import type { OnChainStrategyVault, OnChainUserPosition } from './types';

function buildReadOnlyProgram(connection: Connection) {
  // AnchorProvider requires a wallet-like object; for read-only use, a stub suffices
  const provider = new AnchorProvider(connection, { publicKey: null } as unknown as Wallet, {});
  return new Program(KAGEMUSHA_IDL as unknown as Idl, PROGRAM_ID, provider);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeStrategyVault(pubkey: PublicKey, account: any): OnChainStrategyVault {
  const nameBytes: number[] = account.name;
  const end = nameBytes.indexOf(0) === -1 ? nameBytes.length : nameBytes.indexOf(0);
  const name = Buffer.from(nameBytes.slice(0, end)).toString('utf-8');

  return {
    address: pubkey.toBase58(),
    owner: account.owner.toBase58(),
    name,
    strategyType: account.strategyType as 0 | 1 | 2,
    targetWeights: Array.from(account.targetWeights as number[]),
    numTokens: account.numTokens,
    isActive: account.isActive,
    tvlLamports: BigInt(account.tvl.toString()),
    feesCollectedLamports: BigInt(account.feesCollected.toString()),
    lastRebalance: Number(account.lastRebalance),
    bump: account.bump,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeUserPosition(pubkey: PublicKey, account: any): OnChainUserPosition {
  return {
    address: pubkey.toBase58(),
    vault: account.vault.toBase58(),
    user: account.user.toBase58(),
    lpShares: BigInt(account.lpShares.toString()),
    depositTime: Number(account.depositTime),
    entryValue: BigInt(account.entryValue.toString()),
    bump: account.bump,
  };
}

/** Fetch a single StrategyVault by its PDA. Returns null if not found. */
export async function getStrategyVault(
  connection: Connection,
  strategyPubkey: PublicKey
): Promise<OnChainStrategyVault | null> {
  try {
    const program = buildReadOnlyProgram(connection);
    const account = await program.account.strategyVault.fetch(strategyPubkey);
    return decodeStrategyVault(strategyPubkey, account);
  } catch {
    return null;
  }
}

/** Fetch all StrategyVaults owned by a given pubkey. */
export async function getUserStrategyVaults(
  connection: Connection,
  ownerPubkey: PublicKey
): Promise<OnChainStrategyVault[]> {
  try {
    const program = buildReadOnlyProgram(connection);
    const results = await program.account.strategyVault.all([
      { memcmp: { offset: 8, bytes: ownerPubkey.toBase58() } },
    ]);
    return results.map(({ publicKey, account }) => decodeStrategyVault(publicKey, account));
  } catch {
    return [];
  }
}

/** Fetch a UserPosition for a given strategy + user. Returns null if not found. */
export async function getUserPosition(
  connection: Connection,
  strategyPubkey: PublicKey,
  userPubkey: PublicKey
): Promise<OnChainUserPosition | null> {
  try {
    const [positionPda] = deriveUserPositionPda(strategyPubkey, userPubkey);
    const program = buildReadOnlyProgram(connection);
    const account = await program.account.userPosition.fetch(positionPda);
    return decodeUserPosition(positionPda, account);
  } catch {
    return null;
  }
}
