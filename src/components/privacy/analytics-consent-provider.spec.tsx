import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({
  set_config: vi.fn(),
  opt_in_capturing: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('../../../instrumentation-client', () => ({ default: posthog }));

import { AnalyticsConsentProvider, useAnalyticsConsent } from './analytics-consent-provider';

function ConsentControl() {
  const { accept } = useAnalyticsConsent();
  return <button onClick={accept}>Accept analytics</button>;
}

describe('AnalyticsConsentProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = 'analytics_consent=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('enables session recording with input and text masking after consent', async () => {
    render(
      <AnalyticsConsentProvider>
        <ConsentControl />
      </AnalyticsConsentProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept analytics' }));

    await waitFor(() =>
      expect(posthog.set_config).toHaveBeenCalledWith(
        expect.objectContaining({
          disable_session_recording: false,
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '*',
          },
        }),
      ),
    );
  });
});
