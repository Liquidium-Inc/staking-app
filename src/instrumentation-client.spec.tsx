import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  __isInitialized: false,
}));

vi.mock('posthog-js', () => ({ default: posthog }));

describe('instrumentation-client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    posthog.__isInitialized = false;
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test-key');
  });

  it('initializes session recording with input and text masking', async () => {
    await import('../instrumentation-client');

    expect(posthog.init).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '*',
        },
      }),
    );
  });
});
