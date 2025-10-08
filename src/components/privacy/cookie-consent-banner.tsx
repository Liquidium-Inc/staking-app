'use client';

import CookieConsent from '@/components/blocks/cookie-consent';

import { useAnalyticsConsent } from './analytics-consent-provider';

export default function CookieConsentBanner() {
  const { isPromptOpen, accept, decline } = useAnalyticsConsent();

  if (!isPromptOpen) {
    return null;
  }

  return (
    <CookieConsent
      key="analytics-consent"
      variant="default"
      demo
      forceOpen={isPromptOpen}
      learnMoreHref="/privacy"
      onAcceptCallback={accept}
      onDeclineCallback={decline}
    />
  );
}
