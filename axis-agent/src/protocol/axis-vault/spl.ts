import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeAccount3Instruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getMinimumBalanceForRentExemptAccount,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';

/// Wallet-friendly SPL helpers.
/// Returns ix list + extra signers so callers compose them into a Transaction
/// and hand it to a signer that supports partialSign + wallet signature.

export interface MintBundle {
  mint: PublicKey;
  mintKp: Keypair;
  ixs: TransactionInstruction[];
  signers: Keypair[];
}

export async function buildCreateMintWithSupplyIxs(
  conn: Connection,
  payer: PublicKey,
  decimals: number,
  initialSupply: bigint
): Promise<MintBundle> {
  const mintKp = Keypair.generate();
  const mintRent = await getMinimumBalanceForRentExemptMint(conn);

  const ixs: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mintKp.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKp.publicKey,
      decimals,
      payer,
      payer,
      TOKEN_PROGRAM_ID
    ),
  ];

  if (initialSupply > 0n) {
    const ata = getAssociatedTokenAddressSync(mintKp.publicKey, payer);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(payer, ata, payer, mintKp.publicKey),
      createMintToInstruction(mintKp.publicKey, ata, payer, initialSupply)
    );
  }

  return { mint: mintKp.publicKey, mintKp, ixs, signers: [mintKp] };
}

export async function buildBareTokenAccountIxs(
  conn: Connection,
  payer: PublicKey,
  count: number
): Promise<{
  pubkeys: PublicKey[];
  signers: Keypair[];
  ixs: TransactionInstruction[];
}> {
  const rent = await getMinimumBalanceForRentExemptAccount(conn);
  const signers: Keypair[] = [];
  const ixs: TransactionInstruction[] = [];
  const pubkeys: PublicKey[] = [];
  for (let i = 0; i < count; i++) {
    const kp = Keypair.generate();
    signers.push(kp);
    pubkeys.push(kp.publicKey);
    ixs.push(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: kp.publicKey,
        lamports: rent,
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      })
    );
  }
  return { pubkeys, signers, ixs };
}

export async function buildBareMintAccountIxs(
  conn: Connection,
  payer: PublicKey
): Promise<{ pubkey: PublicKey; signer: Keypair; ixs: TransactionInstruction[] }> {
  const kp = Keypair.generate();
  const rent = await getMinimumBalanceForRentExemptMint(conn);
  return {
    pubkey: kp.publicKey,
    signer: kp,
    ixs: [
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: kp.publicKey,
        lamports: rent,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
    ],
  };
}

export function buildCreateAtaIfMissing(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): { ata: PublicKey; ix: TransactionInstruction } {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  return {
    ata,
    ix: createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint),
  };
}

export function ixInitTokenAccount(
  account: PublicKey,
  mint: PublicKey,
  owner: PublicKey
): TransactionInstruction {
  return createInitializeAccount3Instruction(account, mint, owner, TOKEN_PROGRAM_ID);
}
