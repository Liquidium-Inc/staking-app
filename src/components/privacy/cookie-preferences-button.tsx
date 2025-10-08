'use client';

import { cn } from '@/lib/utils';

import { useAnalyticsConsent } from './analytics-consent-provider';

type CookiePreferencesButtonProps = {
  className?: string;
};

export default function CookiePreferencesButton({ className }: CookiePreferencesButtonProps) {
  const { openPreferences } = useAnalyticsConsent();

  return (
    <button
      type="button"
      onClick={openPreferences}
      className={cn(
        'inline-flex cursor-pointer items-center text-sm text-white/70 transition-colors hover:text-white',
        className,
      )}
    >
      Cookie Preferences
    </button>
  );
}
