/**
 * USDC Token Service (Mobile adapter)
 * Handles USDC balance queries and transfers via Solana web3.js
 */

import { Connection, PublicKey } from '@solana/web3.js';

const USDC_MINT_ADDRESS = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'; // Devnet USDC
const USDC_DECIMALS = 6;

/**
 * Get associated token address for a given mint and owner
 * Simplified implementation without @solana/spl-token
 */
async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const [ata] = await PublicKey.findProgramAddress(
    [
      owner.toBuffer(),
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
      mint.toBuffer(),
    ],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bBe')
  );
  return ata;
}

/**
 * Get the USDC balance for a wallet (returns human-readable amount, e.g. 10.5 USDC)
 */
export async function getUsdcBalance(
  connection: Connection,
  publicKey: PublicKey
): Promise<number> {
  try {
    const mint = new PublicKey(USDC_MINT_ADDRESS);
    const ata = await getAssociatedTokenAddress(mint, publicKey);
    const account = await connection.getTokenAccountBalance(ata);
    return account.value.uiAmount || 0;
  } catch {
    return 0;
  }
}

/**
 * Get the USDC ATA address
 */
export async function getOrCreateUsdcAta(
  _connection: Connection,
  payer: PublicKey,
  owner: PublicKey
): Promise<{ ata: PublicKey; instruction: any }> {
  const mint = new PublicKey(USDC_MINT_ADDRESS);
  const ata = await getAssociatedTokenAddress(mint, owner);
  // Return null instruction - ATA creation handled server-side on mobile
  return { ata, instruction: null };
}
