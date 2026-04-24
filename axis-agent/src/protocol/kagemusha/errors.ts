/**
 * Error parsing for Kagemusha program.
 * Error codes from kagemusha-program/programs/kagemusha/src/errors.rs
 */

const PROGRAM_ERRORS: Record<number, string> = {
  6000: 'Invalid strategy type. Must be Sniper (0), Fortress (1), or Wave (2).',
  6001: 'Weights must sum to 10000 basis points (100%).',
  6002: 'Strategy name too long. Maximum 32 characters.',
  6003: 'Unauthorized. Only the owner can perform this action.',
  6004: 'Strategy is not active.',
  6005: 'Insufficient funds.',
  6006: 'Slippage tolerance exceeded.',
  6007: 'Invalid Jupiter program ID.',
  6008: 'Jupiter swap failed.',
  6009: 'Invalid route data.',
  6010: 'Math overflow detected.',
  6011: 'Insufficient liquidity.',
  6012: 'Invalid fee account.',
  6013: 'Mint mismatch between accounts.',
};

export function parseKagemushaError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Unknown error';
  const e = err as Record<string, unknown>;

  // Anchor structured error
  const errorObj = e.error as Record<string, unknown> | undefined;
  const errorCode = errorObj?.errorCode as Record<string, unknown> | undefined;
  const code = errorCode?.number;
  if (typeof code === 'number') {
    const msg = errorObj?.errorMessage;
    return PROGRAM_ERRORS[code] ?? (typeof msg === 'string' ? msg : undefined) ?? `Program error ${code}`;
  }

  // Parse from transaction logs (fallback)
  const logs = e.logs;
  if (Array.isArray(logs)) {
    for (const log of logs) {
      if (typeof log !== 'string') continue;
      const m = log.match(/Error Number: (\d+)/);
      if (m) {
        const n = parseInt(m[1]);
        if (PROGRAM_ERRORS[n]) return PROGRAM_ERRORS[n];
      }
    }
  }

  const msg = e.message;
  return (typeof msg === 'string' ? msg : undefined) ?? 'Transaction failed';
}
