import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import type { Idl, Wallet } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import { KAGEMUSHA_IDL } from './idl';
import { PROGRAM_ID } from './config';
import { deriveStrategyVaultPda, deriveUserPositionPda, deriveVaultSolPda } from './pda';
import { parseKagemushaError } from './errors';
import type {
  InitializeStrategyParams,
  InitializeStrategyResult,
  DepositSolResult,
  WithdrawSolResult,
  StrategyTypeLabel,
} from './types';
import { STRATEGY_TYPE_TO_CODE as STRATEGY_MAP } from './types';
import { api } from '../../services/api';

interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
}

function buildProgram(connection: Connection, wallet: WalletAdapter) {
  const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
    preflightCommitment: 'confirmed',
  });
  return new Program(KAGEMUSHA_IDL as unknown as Idl, PROGRAM_ID, provider);
}

function assertWallet(
  wallet: WalletAdapter
): asserts wallet is { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> } {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  if (!wallet.signTransaction) throw new Error('Wallet does not support signing');
}

/**
 * Attempt to delegate gas fees to the operator wallet via the API.
 * Falls back silently to user-pays if the API is unavailable.
 */
async function applyFeePayerDelegation(
  tx: Transaction,
  connection: Connection,
  userPubkey: PublicKey
): Promise<Transaction> {
  tx.feePayer = userPubkey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  try {
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const { transaction: signed } = await api.signAsFeePayer(
      Buffer.from(serialized).toString('base64')
    );
    return Transaction.from(Buffer.from(signed, 'base64'));
  } catch {
    return tx;
  }
}

async function signAndSend(
  tx: Transaction,
  connection: Connection,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> }
): Promise<string> {
  const txToSign = await applyFeePayerDelegation(tx, connection, wallet.publicKey);
  const signed = await wallet.signTransaction(txToSign);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

/**
 * Normalize token weights to basis points that sum to exactly 10000.
 * Input: array of percentages (0-100). Output: basis points.
 */
function normalizeWeights(tokens: Array<{ weight: number }>): number[] {
  const bps = new Array(10).fill(0);
  tokens.forEach((t, i) => {
    if (i < 10) bps[i] = Math.floor(t.weight * 100);
  });
  const sum = bps.reduce((a, b) => a + b, 0);
  if (sum !== 10000 && tokens.length > 0) {
    bps[0] += 10000 - sum;
  }
  return bps;
}

/**
 * Initialize a new StrategyVault on-chain.
 *
 * If a vault with the same name already exists for this owner, the transaction
 * will fail with an Anchor account-already-initialized error. Check with
 * getStrategyVault() first if needed.
 */
export async function initializeStrategy(
  connection: Connection,
  wallet: WalletAdapter,
  params: InitializeStrategyParams
): Promise<InitializeStrategyResult> {
  assertWallet(wallet);

  if (Buffer.from(params.name).length > 32) {
    throw new Error('Strategy name must be at most 32 bytes');
  }
  if (params.targetWeights.reduce((a, b) => a + b, 0) !== 10000) {
    throw new Error('Target weights must sum to exactly 10000 basis points');
  }

  const program = buildProgram(connection, wallet);
  const [strategyPda] = deriveStrategyVaultPda(wallet.publicKey, params.name);

  try {
    const tx = await program.methods
      .initializeStrategy(params.name, params.strategyType, params.targetWeights)
      .accounts({
        strategy: strategyPda,
        owner: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const signature = await signAndSend(tx, connection, wallet);
    return { signature, strategyPda };
  } catch (err) {
    throw new Error(parseKagemushaError(err));
  }
}

/**
 * Convenience wrapper: build InitializeStrategyParams from UI-level inputs.
 * Accepts percentage weights and UI strategy type label.
 */
export async function initializeStrategyFromUI(
  connection: Connection,
  wallet: WalletAdapter,
  options: {
    name: string;
    strategyTypeLabel: StrategyTypeLabel;
    tokens: Array<{ weight: number }>;
  }
): Promise<InitializeStrategyResult> {
  return initializeStrategy(connection, wallet, {
    name: options.name,
    strategyType: STRATEGY_MAP[options.strategyTypeLabel],
    targetWeights: normalizeWeights(options.tokens),
  });
}

/**
 * Deposit native SOL into an existing StrategyVault.
 * Creates or updates the UserPosition PDA automatically (init_if_needed).
 */
export async function depositSol(
  connection: Connection,
  wallet: WalletAdapter,
  strategyPubkey: PublicKey,
  amountLamports: bigint | number
): Promise<DepositSolResult> {
  assertWallet(wallet);

  const program = buildProgram(connection, wallet);
  const [positionPda] = deriveUserPositionPda(strategyPubkey, wallet.publicKey);
  const [vaultSolPda] = deriveVaultSolPda(strategyPubkey);
  const amount = new BN(amountLamports.toString());

  try {
    const tx = await program.methods
      .depositSol(amount)
      .accounts({
        strategy: strategyPubkey,
        position: positionPda,
        user: wallet.publicKey,
        vaultSol: vaultSolPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const signature = await signAndSend(tx, connection, wallet);
    return { signature };
  } catch (err) {
    throw new Error(parseKagemushaError(err));
  }
}

/**
 * Withdraw native SOL from a StrategyVault.
 * Callable only by the position owner. Amount must not exceed lp_shares.
 */
export async function withdrawSol(
  connection: Connection,
  wallet: WalletAdapter,
  strategyPubkey: PublicKey,
  amountLamports: bigint | number
): Promise<WithdrawSolResult> {
  assertWallet(wallet);

  const program = buildProgram(connection, wallet);
  const [positionPda] = deriveUserPositionPda(strategyPubkey, wallet.publicKey);
  const [vaultSolPda] = deriveVaultSolPda(strategyPubkey);
  const amount = new BN(amountLamports.toString());

  try {
    const tx = await program.methods
      .withdrawSol(amount)
      .accounts({
        strategy: strategyPubkey,
        position: positionPda,
        user: wallet.publicKey,
        vaultSol: vaultSolPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const signature = await signAndSend(tx, connection, wallet);
    return { signature };
  } catch (err) {
    throw new Error(parseKagemushaError(err));
  }
}

/** Convert SOL float to lamports (bigint). */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}

/** Convert lamports bigint to SOL float. */
export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}
