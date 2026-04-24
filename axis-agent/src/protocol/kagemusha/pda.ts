import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { PROGRAM_ID } from './config';

/**
 * PDA derivation helpers.
 * Seeds match kagemusha-program/programs/kagemusha/src/instructions/*.rs exactly.
 */

/** seeds = [b"strategy", owner, name_as_bytes] */
export function deriveStrategyVaultPda(ownerPubkey: PublicKey, name: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('strategy'), ownerPubkey.toBuffer(), Buffer.from(name)],
    PROGRAM_ID
  );
}

/** seeds = [b"position", strategy, user] */
export function deriveUserPositionPda(
  strategyPubkey: PublicKey,
  userPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), strategyPubkey.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID
  );
}

/** seeds = [b"vault_sol", strategy] */
export function deriveVaultSolPda(strategyPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault_sol'), strategyPubkey.toBuffer()],
    PROGRAM_ID
  );
}
