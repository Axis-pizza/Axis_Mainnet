import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AxisVaultView } from '../components/axis-vault';

/// Standalone route at `/vault`. Provides a minimal back-affordance to the
/// SPA root so users coming straight to the vault flows have a way back.
export function VaultPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#030303] text-white">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="fixed left-4 top-4 z-50 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-slate-300 backdrop-blur hover:border-white/20"
      >
        <ArrowLeft className="h-3 w-3" /> Home
      </button>
      <AxisVaultView />
    </div>
  );
}
