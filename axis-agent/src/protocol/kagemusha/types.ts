import type { PublicKey } from '@solana/web3.js';

// On-chain strategy type codes (from kagemusha-program/src/lib.rs comments)
export type StrategyTypeCode = 0 | 1 | 2; // 0=Sniper, 1=Fortress, 2=Wave

// UI-facing strategy type labels used across the app
export type StrategyTypeLabel = 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';

// Mapping from UI label to on-chain code
// Convention: AGGRESSIVE=Sniper(0), BALANCED=Wave(2), CONSERVATIVE=Fortress(1)
export const STRATEGY_TYPE_TO_CODE: Record<StrategyTypeLabel, StrategyTypeCode> = {
  AGGRESSIVE: 0,
  BALANCED: 2,
  CONSERVATIVE: 1,
};

export const CODE_TO_STRATEGY_TYPE: Record<number, StrategyTypeLabel> = {
  0: 'AGGRESSIVE',
  2: 'BALANCED',
  1: 'CONSERVATIVE',
};

// Deserialized StrategyVault account
export interface OnChainStrategyVault {
  address: string;
  owner: string;
  /** Strategy name decoded from [u8; 32] */
  name: string;
  strategyType: StrategyTypeCode;
  /** Target weights in basis points (sum = 10000) */
  targetWeights: number[];
  numTokens: number;
  isActive: boolean;
  /** TVL in lamports */
  tvlLamports: bigint;
  feesCollectedLamports: bigint;
  lastRebalance: number;
  bump: number;
}

// Deserialized UserPosition account
export interface OnChainUserPosition {
  address: string;
  vault: string;
  user: string;
  /** LP shares = lamports deposited (1:1 with SOL at deposit time) */
  lpShares: bigint;
  depositTime: number;
  entryValue: bigint;
  bump: number;
}

export interface InitializeStrategyParams {
  /** Max 32 bytes (UTF-8). Validated client-side before sending. */
  name: string;
  strategyType: StrategyTypeCode;
  /** Weights in basis points. Must sum to exactly 10000. */
  targetWeights: number[];
}

export interface TxResult {
  signature: string;
}

export interface InitializeStrategyResult extends TxResult {
  strategyPda: PublicKey;
}

export type DepositSolResult = TxResult;
export type WithdrawSolResult = TxResult;
