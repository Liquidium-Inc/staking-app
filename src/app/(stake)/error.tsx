'use client';
import { useEffect } from 'react';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';

export default function StakeSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { captureException } = useAnalytics();

  useEffect(() => {
    captureException(error);
  }, [captureException, error]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground mt-2 text-sm">We logged this error.</p>
      <button className="mt-4 underline" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
