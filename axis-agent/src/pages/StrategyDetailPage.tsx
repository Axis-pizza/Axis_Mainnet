import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '../hooks/useWallet';
import { StrategyDetailView } from '../components/discover/StrategyDetailView';
import { getStrategyVault } from '../protocol/kagemusha';
import { api } from '../services/api'; // Fallback API
import { Loader2 } from 'lucide-react';

export const StrategyDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();

  const [strategy, setStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStrategy = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);

      try {
        // 1. Try fetching from On-Chain directly (if valid Pubkey)
        let fetchedData = null;

        try {
          const pubkey = new PublicKey(id);
          const vault = await getStrategyVault(connection, pubkey);
          if (vault) {
            fetchedData = {
              id,
              name: vault.name || 'Unknown Vault',
              type: 'BALANCED',
              description: 'A decentralized vault strategy on Solana.',
              tokens: [],
              tvl: Number(vault.tvlLamports) / 1e9,
              roi: 0,
              creatorAddress: vault.owner,
              createdAt: vault.lastRebalance,
            };
          }
        } catch (chainErr) {
          // Not a valid pubkey or not found on chain, ignore and try API
        }

        // 2. If not found on chain, fetch directly by UUID
        if (!fetchedData) {
          const res = await api.getStrategyById(id);
          if (res.success && res.strategy) {
            // Backend returns `vaultAddress` (camelCased from vault_address);
            // every downstream consumer (StrategyDetailView, CreatorConsole)
            // reads `strategy.address`. Normalise here so PFMM pool readbacks
            // (Manage / pool reserves / position) actually find the PDA.
            const s = res.strategy;
            fetchedData = {
              ...s,
              address: s.address ?? s.vaultAddress ?? s.vault_address ?? null,
            };
          }
        }

        if (fetchedData) {
          setStrategy(fetchedData);
        } else {
          setError('Strategy not found.');
        }
      } catch {
        setError('Failed to load strategy.');
      } finally {
        setLoading(false);
      }
    };

    fetchStrategy();
  }, [id, connection]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#080503] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#B8863F] animate-spin" />
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="w-full h-screen bg-[#080503] flex flex-col items-center justify-center text-white">
        <h2 className="text-xl font-normal mb-2">Strategy Not Found</h2>
        <button onClick={() => navigate(-1)} className="text-[#B8863F] underline">
          Go Back
        </button>
      </div>
    );
  }

  return <StrategyDetailView initialData={strategy} onBack={() => navigate(-1)} />;
};
