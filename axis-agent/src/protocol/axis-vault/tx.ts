import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';

/// Wallet adapter shape consumed by axis-vault helpers.
/// Designed to be satisfied by the Privy-backed `useWallet` hook in
/// `src/hooks/useWallet.ts` via a thin wrapper (see `useAxisVaultWallet`).
export interface AxisVaultWallet {
  publicKey: PublicKey;
  /** Sign a legacy `Transaction` and return it with the wallet signature applied. */
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  /** Sign a `VersionedTransaction` (v0). */
  signVersionedTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}

/// Send a legacy Transaction. Pre-flight simulates with sigVerify=false so we
/// surface the real custom-program error before the wallet sees the bytes,
/// then asks the wallet to sign and finally broadcasts.
export async function sendTx(
  conn: Connection,
  wallet: AxisVaultWallet,
  ixs: TransactionInstruction[],
  signers: Keypair[] = []
): Promise<string> {
  await assertFeePayerExists(conn, wallet.publicKey);

  const tx = new Transaction();
  for (const ix of ixs) tx.add(ix);
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  if (signers.length > 0) {
    tx.partialSign(...signers);
  }

  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) {
    throw enrichSimError(sim.value.err, sim.value.logs ?? []);
  }

  let signed: Transaction;
  try {
    signed = await wallet.signTransaction(tx);
  } catch (e) {
    throw new Error(`Wallet rejected signing: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Privy returns a freshly-deserialized Transaction whose pre-existing
  // partial signatures should be preserved by the deserialization, but to
  // be defensive we re-apply local signers on top of the wallet result.
  // Solana's Transaction signatures slot is keyed by pubkey, so re-signing
  // is idempotent.
  if (signers.length > 0) {
    signed.partialSign(...signers);
  }

  try {
    const sig = await conn.sendRawTransaction(signed.serialize(), {
      preflightCommitment: 'confirmed',
    });
    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    return sig;
  } catch (e) {
    throw await enrichTxError(conn, e);
  }
}

/// Send a v0 VersionedTransaction. Caller is responsible for signing extras
/// (Jupiter shared-account ixs add no extra signers; we only need the wallet).
export async function sendVersionedTx(
  conn: Connection,
  wallet: AxisVaultWallet,
  tx: VersionedTransaction
): Promise<string> {
  await assertFeePayerExists(conn, wallet.publicKey);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.message.recentBlockhash = blockhash;

  const sim = await conn.simulateTransaction(tx, {
    commitment: 'confirmed',
    sigVerify: false,
  });
  if (sim.value.err) {
    throw enrichSimError(sim.value.err, sim.value.logs ?? []);
  }

  let signed: VersionedTransaction;
  try {
    if (wallet.signVersionedTransaction) {
      signed = await wallet.signVersionedTransaction(tx);
    } else {
      // Fall back: many wallets implement a single `signTransaction`
      // overload accepting both. TS-narrow with `as any` and trust the
      // runtime; failure is surfaced as a wallet rejection below.
      signed = (await (wallet as unknown as { signTransaction: (t: VersionedTransaction) => Promise<VersionedTransaction> }).signTransaction(tx));
    }
  } catch (e) {
    throw new Error(`Wallet rejected signing: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const sig = await conn.sendRawTransaction(signed.serialize(), {
      preflightCommitment: 'confirmed',
    });
    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    return sig;
  } catch (e) {
    throw await enrichTxError(conn, e);
  }
}

async function assertFeePayerExists(conn: Connection, feePayer: PublicKey): Promise<void> {
  const feePayerInfo = await conn.getAccountInfo(feePayer, 'confirmed');
  if (!feePayerInfo) {
    throw new Error(
      'Fee payer account not found on this cluster. Fund the wallet before sending transactions.'
    );
  }
}

function enrichSimError(err: unknown, logs: string[]): Error {
  let codeHex: string | null = null;
  let ixIdx: number | null = null;
  if (typeof err === 'object' && err !== null && 'InstructionError' in err) {
    const ie = (err as { InstructionError: [number, unknown] }).InstructionError;
    ixIdx = ie[0];
    const inner = ie[1];
    if (typeof inner === 'object' && inner !== null && 'Custom' in inner) {
      const code = (inner as { Custom: number }).Custom;
      codeHex = '0x' + code.toString(16);
    }
  }
  if (!codeHex) {
    const m = logs.join('\n').match(/custom program error: (0x[0-9a-fA-F]+)/);
    if (m) codeHex = m[1].toLowerCase();
  }
  const friendly = codeHex ? labelForCode(codeHex) : null;
  const head = friendly
    ? `${friendly} (${codeHex}) at instruction #${ixIdx ?? '?'}`
    : `simulate failed: ${JSON.stringify(err)}`;
  const tail =
    logs.length > 0 ? '\n--- program logs (last 12) ---\n' + logs.slice(-12).join('\n') : '';
  return new Error(head + tail);
}

async function enrichTxError(conn: Connection, e: unknown): Promise<Error> {
  let logs: string[] | undefined;
  const baseMsg = e instanceof Error ? e.message : String(e);

  if (e instanceof SendTransactionError) {
    try {
      const got = await e.getLogs(conn);
      if (got && got.length > 0) logs = got;
    } catch {
      /* ignore */
    }
  }
  if (!logs && typeof e === 'object' && e !== null && 'logs' in e) {
    const maybe = (e as { logs?: unknown }).logs;
    if (Array.isArray(maybe)) logs = maybe as string[];
  }

  const hayStack = [baseMsg, ...(logs ?? [])].join('\n');
  const codeMatch = hayStack.match(/custom program error: (0x[0-9a-fA-F]+)/);
  const friendly = codeMatch ? labelForCode(codeMatch[1].toLowerCase()) : null;

  const tail = logs ? '\n--- program logs (last 8) ---\n' + logs.slice(-8).join('\n') : '';
  const prefix = friendly ? `${friendly} (${codeMatch![1]}) — ` : '';
  return new Error(prefix + baseMsg + tail);
}

function labelForCode(hex: string): string | null {
  const t: Record<string, string> = {
    // axis-vault — VaultError = 9000 + variant_index
    '0x2328': 'axis-vault: InvalidDiscriminator',
    '0x2329': 'axis-vault: AlreadyInitialized',
    '0x232a': 'axis-vault: InvalidBasketSize',
    '0x232b': 'axis-vault: WeightsMismatch (sum != 10_000)',
    '0x232c': 'axis-vault: ZeroDeposit',
    '0x232d': 'axis-vault: InsufficientBalance',
    '0x232e': 'axis-vault: DivisionByZero',
    '0x232f': 'axis-vault: Overflow',
    '0x2330': 'axis-vault: OwnerMismatch',
    '0x2331': 'axis-vault: MintMismatch',
    '0x2332': 'axis-vault: InvalidTickerLength',
    '0x2333': 'axis-vault: DuplicateMint',
    '0x2334': 'axis-vault: PoolPaused',
    '0x2335': 'axis-vault: VaultMismatch',
    '0x2336': 'axis-vault: InvalidProgramOwner',
    '0x2337': 'axis-vault: SlippageExceeded',
    '0x2338': 'axis-vault: NavDeviationExceeded',
    '0x2339': 'axis-vault: TreasuryMismatch',
    '0x233a': 'axis-vault: InsufficientFirstDeposit (amount must be >= 10_000 base units)',
    '0x233b': 'axis-vault: InvalidTicker (A-Z 0-9, 2..16 bytes)',
    '0x233c': 'axis-vault: InvalidName (>32 bytes or empty)',
    '0x233d': 'axis-vault: SweepForbidden',
    '0x233e': 'axis-vault: NothingToSweep',
    '0x233f': 'axis-vault: TreasuryNotApproved',
    '0x2340': 'axis-vault: NotYetImplemented',
    '0x2341': 'axis-vault: BasketTooLargeForOnchainSol',
    '0x2342': 'axis-vault: InvalidJupiterProgram',
    '0x2343': 'axis-vault: WsolMintMismatch',
    '0x2344': 'axis-vault: LegSumMismatch',
    '0x2345': 'axis-vault: LegCountMismatch',
    '0x2346': 'axis-vault: JupiterCpiNoOutput',
    '0x2347': 'axis-vault: EtfNotBootstrapped',
    '0x2348': 'axis-vault: MalformedLegData',
    '0x2349': 'axis-vault: FeeTooHigh',
    '0x234a': 'axis-vault: TvlCapExceeded',
    '0x234b': 'axis-vault: InvalidCapDecrease',
    '0x234c': 'axis-vault: ExcessVaultDrain',
    // pfda-amm-3 — PfdaError = 8000 + variant_index
    '0x1f40': 'pfda-amm-3: InvalidDiscriminator',
    '0x1f41': 'pfda-amm-3: ReentrancyDetected',
    '0x1f42': 'pfda-amm-3: BatchWindowNotEnded',
    '0x1f43': 'pfda-amm-3: BatchAlreadyCleared',
    '0x1f44': 'pfda-amm-3: TicketAlreadyClaimed',
    '0x1f45': 'pfda-amm-3: BatchNotCleared',
    '0x1f46': 'pfda-amm-3: SlippageExceeded',
    '0x1f47': 'pfda-amm-3: InvalidSwapInput',
    '0x1f48': 'pfda-amm-3: Overflow',
    '0x1f4a': 'pfda-amm-3: BatchIdMismatch',
    '0x1f4b': 'pfda-amm-3: PoolMismatch',
    '0x1f4f': 'pfda-amm-3: AlreadyInitialized',
    '0x1f50': 'pfda-amm-3: InvalidTokenIndex',
    '0x1f54': 'pfda-amm-3: OracleInvalid',
    '0x1f56': 'pfda-amm-3: OracleStale',
    '0x1f58': 'pfda-amm-3: BidTooLow',
    '0x1f59': 'pfda-amm-3: VaultMismatch',
    '0x1f5a': 'pfda-amm-3: MintMismatch',
    '0x1f5b': 'pfda-amm-3: BidWithoutTreasury',
    '0x1f5c': 'pfda-amm-3: OracleOwnerMismatch',
    '0x1f5d': 'pfda-amm-3: ReserveInsufficient',
    '0x1f5e': 'pfda-amm-3: InvariantViolation',
    '0x1f5f': 'pfda-amm-3: BidExcessive',
  };
  return t[hex] ?? null;
}

export function explorerTx(sig: string, cluster: 'devnet' | '' | 'mainnet' = ''): string {
  const suffix = cluster && cluster !== 'mainnet' ? `?cluster=${cluster}` : '';
  return `https://explorer.solana.com/tx/${sig}${suffix}`;
}

export function explorerAddr(addr: string, cluster: 'devnet' | '' | 'mainnet' = ''): string {
  const suffix = cluster && cluster !== 'mainnet' ? `?cluster=${cluster}` : '';
  return `https://explorer.solana.com/address/${addr}${suffix}`;
}
