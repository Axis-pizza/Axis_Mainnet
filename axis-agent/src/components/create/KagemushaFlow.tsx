import React from 'react';
import { ETFScrollFlow } from './ETFScrollFlow';

// ─────────────────────────────────────────────────────────────────────────────
// Simple Error Boundary
// ─────────────────────────────────────────────────────────────────────────────
class SimpleErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-500 bg-black min-h-screen">
          <h1 className="text-2xl font-normal mb-4">⚠️ Something went wrong</h1>
          <pre className="bg-red-900/20 p-4 rounded border border-red-500/50 whitespace-pre-wrap">
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KagemushaFlow
// Single-page scrollable ETF creation UI
// ─────────────────────────────────────────────────────────────────────────────
type CreateStep = 'LANDING' | 'BUILDER' | 'BLUEPRINT' | 'DASHBOARD' | 'REBALANCE';

interface KagemushaFlowProps {
  onStepChange?: (step: CreateStep, strategyId?: string) => void;
}

export const KagemushaFlow = ({ onStepChange }: KagemushaFlowProps) => {
  const handleDeployComplete = (strategyId?: string) => {
    onStepChange?.('DASHBOARD', strategyId);
  };

  return (
    <SimpleErrorBoundary>
      <ETFScrollFlow onDeployComplete={handleDeployComplete} />
    </SimpleErrorBoundary>
  );
};
