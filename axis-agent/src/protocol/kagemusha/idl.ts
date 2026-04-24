/**
 * Kagemusha program IDL in Anchor 0.29 format.
 *
 * Derived from kagemusha-program source (not auto-generated — program not yet deployed to mainnet).
 * Sources:
 *   - programs/kagemusha/src/lib.rs
 *   - programs/kagemusha/src/instructions/{initialize,deposit_sol,withdraw_sol}.rs
 *   - programs/kagemusha/src/state/mod.rs
 *
 * Assumptions:
 *   - StrategyVault.name is [u8; 32] on-chain (fixed byte array)
 *   - initializeStrategy instruction arg `name` is String (Anchor encodes as UTF-8)
 *   - targetWeights instruction arg is Vec<u16>, stored as [u16; 10] in account
 *   - lp_shares = lamports deposited (1:1 with SOL amount)
 *
 * When the program is deployed and a generated IDL is available, replace this file
 * with the output of `anchor build` at target/idl/kagemusha.json.
 */
export const KAGEMUSHA_IDL = {
  version: '0.1.0',
  name: 'kagemusha',
  instructions: [
    {
      name: 'initializeStrategy',
      accounts: [
        { name: 'strategy', isMut: true, isSigner: false },
        { name: 'owner', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [
        { name: 'name', type: 'string' },
        { name: 'strategyType', type: 'u8' },
        { name: 'targetWeights', type: { vec: 'u16' } },
      ],
    },
    {
      name: 'depositSol',
      accounts: [
        { name: 'strategy', isMut: true, isSigner: false },
        { name: 'position', isMut: true, isSigner: false },
        { name: 'user', isMut: true, isSigner: true },
        { name: 'vaultSol', isMut: true, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'withdrawSol',
      accounts: [
        { name: 'strategy', isMut: true, isSigner: false },
        { name: 'position', isMut: true, isSigner: false },
        { name: 'user', isMut: true, isSigner: true },
        { name: 'vaultSol', isMut: true, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
  ],
  accounts: [
    {
      // Discriminator: sha256("account:StrategyVault")[0:8] = [159,204,238,219,38,201,136,177]
      // (matches src/idl/kagemusha.ts)
      name: 'StrategyVault',
      type: {
        kind: 'struct',
        fields: [
          { name: 'owner', type: 'publicKey' },
          { name: 'name', type: { array: ['u8', 32] } },
          { name: 'strategyType', type: 'u8' },
          { name: 'targetWeights', type: { array: ['u16', 10] } },
          { name: 'numTokens', type: 'u8' },
          { name: 'isActive', type: 'bool' },
          { name: 'tvl', type: 'u64' },
          { name: 'feesCollected', type: 'u64' },
          { name: 'lastRebalance', type: 'i64' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      // Discriminator: sha256("account:UserPosition")[0:8] = [251,248,209,245,83,234,17,27]
      // (matches src/idl/kagemusha.ts)
      name: 'UserPosition',
      type: {
        kind: 'struct',
        fields: [
          { name: 'vault', type: 'publicKey' },
          { name: 'user', type: 'publicKey' },
          { name: 'lpShares', type: 'u64' },
          { name: 'depositTime', type: 'i64' },
          { name: 'entryValue', type: 'u64' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: 'InvalidStrategyType', msg: 'Invalid strategy type. Must be 0 (Sniper), 1 (Fortress), or 2 (Wave).' },
    { code: 6001, name: 'InvalidWeightSum', msg: 'Weights must sum to 10000 basis points (100%).' },
    { code: 6002, name: 'NameTooLong', msg: 'Strategy name too long. Maximum 32 characters.' },
    { code: 6003, name: 'Unauthorized', msg: 'Unauthorized. Only the owner can perform this action.' },
    { code: 6004, name: 'StrategyInactive', msg: 'Strategy is not active.' },
    { code: 6005, name: 'InsufficientFunds', msg: 'Insufficient funds.' },
    { code: 6006, name: 'SlippageExceeded', msg: 'Slippage tolerance exceeded.' },
    { code: 6007, name: 'InvalidJupiterProgram', msg: 'Invalid Jupiter program ID provided.' },
    { code: 6008, name: 'JupiterSwapFailed', msg: 'Jupiter swap failed.' },
    { code: 6009, name: 'InvalidRouteData', msg: 'Invalid route data provided.' },
    { code: 6010, name: 'MathOverflow', msg: 'Math overflow detected.' },
    { code: 6011, name: 'InsufficientLiquidity', msg: 'Insufficient liquidity for swap.' },
    { code: 6012, name: 'InvalidFeeAccount', msg: 'Invalid fee account provided.' },
    { code: 6013, name: 'MintMismatch', msg: 'Mint mismatch between accounts.' },
  ],
} as const;
