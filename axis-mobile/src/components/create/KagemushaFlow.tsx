/**
 * KagemushaFlow - Main create flow orchestrator (React Native)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useWallet } from '../../context/WalletContext';
import { api } from '../../services/api';
import { colors } from '../../config/theme';

// Screens
import { CreateLanding } from '../../screens/create/CreateLanding';
import { ProfileEditModal } from '../common/ProfileEditModal';

type CreateStep = 'LANDING' | 'BUILDER' | 'BLUEPRINT' | 'DASHBOARD';

interface ManualData {
  tokens: {
    symbol: string;
    weight: number;
    mint: string;
    logoURI: string;
  }[];
  config: {
    name: string;
    ticker: string;
    description: string;
  };
}

interface KagemushaFlowProps {
  onStepChange?: (step: CreateStep) => void;
}

export const KagemushaFlow = ({ onStepChange }: KagemushaFlowProps) => {
  const { publicKey, connected, connect } = useWallet();

  const [step, setStep] = useState<CreateStep>('LANDING');
  const [showRegistration, setShowRegistration] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const [draftStrategy, setDraftStrategy] = useState<ManualData | null>(null);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const handleStartCreate = async () => {
    if (!connected || !publicKey) {
      await connect();
      return;
    }

    setCheckingRegistration(true);
    try {
      const res = await api.getUser(publicKey.toBase58());
      if (!res.is_registered) {
        setShowRegistration(true);
        return;
      }
    } catch {
      // Allow through on error
    } finally {
      setCheckingRegistration(false);
    }

    setStep('BUILDER');
  };

  const handleRegistrationComplete = () => {
    setShowRegistration(false);
    setStep('BUILDER');
  };

  const handleBuilderComplete = (data: ManualData) => {
    if (!data?.config || !data.tokens?.length) return;
    setDraftStrategy(data);
    setStep('BLUEPRINT');
  };

  const handleBlueprintBack = () => {
    setStep('BUILDER');
  };

  const handleDeploymentComplete = () => {
    setDraftStrategy(null);
    setStep('DASHBOARD');
  };

  const handleCreateNew = () => {
    setStep('LANDING');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#030303' }}>
      {/* Registration Gate Modal */}
      <ProfileEditModal
        isOpen={showRegistration}
        onClose={() => setShowRegistration(false)}
        currentProfile={{
          pubkey: publicKey?.toBase58() || '',
          username: undefined,
        }}
        onUpdate={handleRegistrationComplete}
      />

      {/* LANDING */}
      {step === 'LANDING' && (
        <CreateLanding
          onCreate={handleStartCreate}
          isLoading={checkingRegistration}
        />
      )}

      {/* BUILDER, BLUEPRINT, DASHBOARD are handled by CreateScreen */}
    </View>
  );
};
