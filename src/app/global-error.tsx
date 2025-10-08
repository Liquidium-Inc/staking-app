'use client';
import NextError from 'next/error';
import { useEffect } from 'react';

import posthog from '../../instrumentation-client';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    posthog.captureException?.(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
