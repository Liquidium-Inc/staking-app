import posthog from 'posthog-js';

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (typeof window !== 'undefined' && apiKey) {
  const client = posthog as typeof posthog & { __isInitialized?: boolean };

  if (!client.__isInitialized) {
    client.init(apiKey, {
      api_host: '/relay-axzt',
      ui_host: 'https://us.posthog.com',
      defaults: '2025-05-24',
      capture_exceptions: true,
      debug: process.env.NODE_ENV === 'development',
      autocapture: false,
      capture_pageview: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_persistence: true,
      persistence: 'memory',
      opt_out_capturing_by_default: true,
      cookieless_mode: 'on_reject',
    });
    // Mark the instance so we don't reinitialise during Fast Refresh
    client.__isInitialized = true;
  }
}

export default posthog;
