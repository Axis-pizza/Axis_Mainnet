import { useMemo } from 'react';
import { Buffer } from 'buffer';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  useWallets as usePrivySolanaWallets,
  useSignTransaction as usePrivySignTransaction,
} from '@privy-io/react-auth/solana';
import { useWallet } from './useWallet';
import { useDirectWallet } from './useDirectWallet';
import type { AxisVaultWallet } from '../protocol/axis-vault';

/// Adapter that exposes axis-agent's Privy-backed wallet as the
/// `AxisVaultWallet` shape consumed by `protocol/axis-vault` helpers.
///
/// Privy's `signTransaction` accepts a serialized `Uint8Array` and returns
/// the signed bytes; we wrap it to handle both legacy `Transaction` and
/// `VersionedTransaction`. Pre-applied partial signatures (used by
/// `sendTx` for fresh keypairs in CreateEtf / InitPool) are preserved
/// because Privy only adds the user's signature.
export function useAxisVaultWallet(): AxisVaultWallet | null {
  const { publicKey } = useWallet();
  const { publicKey: directPublicKey, signTransaction: directSign } = useDirectWallet();
  const { wallets: solanaWallets } = usePrivySolanaWallets();
  const { signTransaction: privySignTransaction } = usePrivySignTransaction();

  return useMemo(() => {
    if (!publicKey) return null;

    // Prefer the direct (window.solana) path when its publicKey matches.
    // No Privy iframe is involved, so signing keeps working when the
    // Privy auth-iframe is blocked by CSP / origins.
    if (directPublicKey && directPublicKey.equals(publicKey)) {
      const signLegacy = (tx: Transaction): Promise<Transaction> => directSign(tx);
      const signVersioned = (tx: VersionedTransaction): Promise<VersionedTransaction> => directSign(tx);
      return {
        publicKey,
        signTransaction: signLegacy,
        signVersionedTransaction: signVersioned,
      };
    }

    const targetAddress = publicKey.toBase58();
    const wallet =
      solanaWallets.find((w: { address: string }) => w.address === targetAddress) ??
      solanaWallets[0] ??
      null;
    if (!wallet) return null;

    const signLegacy = async (tx: Transaction): Promise<Transaction> => {
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await privySignTransaction({
        transaction: serialized,
        wallet,
        chain: 'solana:mainnet',
      });
      return Transaction.from(Buffer.from(signedTransaction));
    };

    const signVersioned = async (tx: VersionedTransaction): Promise<VersionedTransaction> => {
      const serialized = tx.serialize();
      const { signedTransaction } = await privySignTransaction({
        transaction: serialized,
        wallet,
        chain: 'solana:mainnet',
      });
      return VersionedTransaction.deserialize(signedTransaction);
    };

    return {
      publicKey,
      signTransaction: signLegacy,
      signVersionedTransaction: signVersioned,
    };
  }, [publicKey, directPublicKey, directSign, solanaWallets, privySignTransaction]);
}
