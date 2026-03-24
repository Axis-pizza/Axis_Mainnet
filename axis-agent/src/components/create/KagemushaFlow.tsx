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

  componentDidCatch(error: any) {
    console.error('[KagemushaFlow] caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      return null;
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
