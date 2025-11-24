'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import { useEffect, useRef, useState } from 'react';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';

import { OnboardingModal, useOnboarding } from './onboarding-modal';

const FIRST_CONNECTION_KEY = 'liquidium_first_connection';

export function OnboardingTrigger() {
  const { address, connected } = useLaserEyes((state) => ({
    address: state.address,
    connected: state.connected,
  }));

  const { shouldShowOnboarding, markOnboardingComplete } = useOnboarding();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hasTriggeredRef = useRef(false);
  const { capture } = useAnalytics();

  useEffect(() => {
    // only trigger once per session when wallet connects
    if (!connected || !address || hasTriggeredRef.current || !shouldShowOnboarding) {
      return;
    }

    // check if this is truly the first connection ever
    const hasConnectedBefore = localStorage.getItem(FIRST_CONNECTION_KEY);

    if (!hasConnectedBefore) {
      // mark that user has connected at least once
      localStorage.setItem(FIRST_CONNECTION_KEY, 'true');

      const timer = setTimeout(() => {
        setIsModalOpen(true);
        hasTriggeredRef.current = true;
        capture('onboarding_modal_shown', {
          wallet_address: address,
        });
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [connected, address, shouldShowOnboarding, capture]);

  const handleClose = () => {
    setIsModalOpen(false);
    markOnboardingComplete();
    capture('onboarding_modal_closed', {
      completed: true,
    });
  };

  return <OnboardingModal isOpen={isModalOpen} onClose={handleClose} />;
}
