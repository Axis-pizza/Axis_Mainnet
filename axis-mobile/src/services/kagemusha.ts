/**
 * Kagemusha On-chain Service (Mobile adapter)
 * Handles Solana program interactions via Mobile Wallet Adapter
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { TokenAllocation } from '../types';

const PROGRAM_ID = new PublicKey('2kdDnjHHLmHex8v5pk8XgB7ddFeiuBW4Yp5Ykx8JmBLd');
const USDC_DECIMALS = 6;

export interface StrategyParams {
  name: string;
  strategyType: number;
  tokens: Array<{ symbol: string; weight: number }>;
}

export interface OnChainStrategy {
  address: string;
  owner: string;
  name: string;
  strategyType: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  tvl: number;
  isActive: boolean;
  tokens?: TokenAllocation[];
  ticker?: string;
  pnl?: number;
  pnlPercent?: number;
  lastRebalance?: number;
}

type WalletInterface = {
  publicKey: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  [key: string]: any;
};

/**
 * Get PDA for strategy account
 */
function getStrategyPda(ownerPubkey: PublicKey, name: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('strategy'), ownerPubkey.toBuffer(), Buffer.from(name)],
    PROGRAM_ID
  );
  return pda;
}

/**
 * Get PDA for position account
 */
function getPositionPda(strategyPubkey: PublicKey, userPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), strategyPubkey.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

/**
 * Get PDA for vault SOL account
 */
function getVaultSolPda(strategyPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_sol'), strategyPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export const KagemushaService = {
  /**
   * Deposit SOL into a strategy vault (simplified for mobile)
   * NOTE: Full Anchor integration requires @coral-xyz/anchor which is not
   * available in this React Native build. This uses a direct SOL transfer
   * as a placeholder for the actual program instruction.
   */
  depositSol: async (
    connection: Connection,
    wallet: WalletInterface,
    strategyPubkey: PublicKey,
    amountSol: number
  ) => {
    if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');

    const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    const vaultSolPda = getVaultSolPda(strategyPubkey);

    const tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: vaultSolPda,
        lamports: amountLamports,
      })
    );

    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const signedTx = await wallet.signTransaction(tx);
    const signature = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    return signature;
  },
};

/**
 * Withdraw from strategy (placeholder implementation)
 */
export async function withdraw(
  connection: Connection,
  wallet: WalletInterface,
  strategyPubkey: PublicKey,
  amountShares: number
) {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  // Placeholder: actual implementation requires Anchor IDL
  throw new Error('Withdraw not implemented on-chain yet');
}

/**
 * Get user strategies from on-chain (returns empty array, use API instead)
 */
export async function getUserStrategies(
  connection: Connection,
  ownerPubkey: PublicKey
): Promise<OnChainStrategy[]> {
  // On mobile, strategies are fetched from the API backend
  // On-chain fetching requires @coral-xyz/anchor
  return [];
}

/**
 * Get specific strategy info
 */
export async function getStrategyInfo(
  connection: Connection,
  strategyPubkey: PublicKey
): Promise<OnChainStrategy | null> {
  return null;
}
