import { PublicKey } from '@solana/web3.js';

// Program ID is configurable via env for easy mainnet/devnet switching.
// Hardcoded fallback matches kagemusha-program declare_id!("2kdDnjH...")
export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_KAGEMUSHA_PROGRAM_ID ?? '2kdDnjHHLmHex8v5pk8XgB7ddFeiuBW4Yp5Ykx8JmBLd'
);
