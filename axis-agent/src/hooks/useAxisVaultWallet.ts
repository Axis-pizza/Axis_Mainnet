import { useMemo } from 'react';
import { Buffer } from 'buffer';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  useWallets as usePrivySolanaWallets,
  useSignTransaction as usePrivySignTransaction,
} from '@privy-io/react-auth/solana';
import { useWallet } from './useWallet';
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
  const { wallets: solanaWallets } = usePrivySolanaWallets();
  const { signTransaction: privySignTransaction } = usePrivySignTransaction();

  return useMemo(() => {
    if (!publicKey) return null;
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
  }, [publicKey, solanaWallets, privySignTransaction]);
}
