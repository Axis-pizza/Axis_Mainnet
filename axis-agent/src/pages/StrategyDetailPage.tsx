import { useParams, useRouter } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { StrategyDetailView } from '../components/discover/StrategyDetailView';
import { api } from '../services/api';
import { Loader2 } from 'lucide-react';

export const StrategyDetailPage = () => {
  const { id } = useParams({ from: '/strategy/$id' });
  const router = useRouter();

  const [strategy, setStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStrategy = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);

      try {
        const res = await api.getStrategyById(id);
        // Backend returns `vaultAddress` (camelCased from vault_address);
        // every downstream consumer (StrategyDetailView, CreatorConsole)
        // reads `strategy.address`. Normalise here so PFMM pool readbacks
        // (Manage / pool reserves / position) actually find the PDA.
        if (res.success && res.strategy) {
          const s = res.strategy;
          setStrategy({
            ...s,
            address: s.address ?? s.vaultAddress ?? s.vault_address ?? null,
          });
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
  }, [id]);

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
        <button onClick={() => router.history.back()} className="text-[#B8863F] underline">
          Go Back
        </button>
      </div>
    );
  }

  return <StrategyDetailView initialData={strategy} onBack={() => router.history.back()} />;
};
