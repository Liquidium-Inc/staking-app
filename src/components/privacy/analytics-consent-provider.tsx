'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type PosthogClient = typeof import('posthog-js').default;

type ConsentStatus = 'unknown' | 'granted' | 'denied';

type AnalyticsConsentContextValue = {
  status: ConsentStatus;
  isPromptOpen: boolean;
  accept: () => void;
  decline: () => void;
  openPreferences: () => void;
  client: PosthogClient | null;
};

const AnalyticsConsentContext = createContext<AnalyticsConsentContextValue | undefined>(undefined);

const CONSENT_COOKIE_NAME = 'analytics_consent';
const SIX_MONTHS_IN_MS = 1000 * 60 * 60 * 24 * 30 * 6;

let posthogClient: typeof import('posthog-js').default | null = null;
let posthogImportPromise: Promise<typeof import('posthog-js').default> | null = null;
let initialPageviewSent = false;

function readStoredConsent(): ConsentStatus {
  if (typeof document === 'undefined') {
    return 'unknown';
  }

  const match = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${CONSENT_COOKIE_NAME}=`));

  if (!match) {
    return 'unknown';
  }

  const value = match.split('=')[1];
  if (value === 'granted' || value === 'denied') {
    return value;
  }

  return 'unknown';
}

function persistConsent(status: 'granted' | 'denied') {
  if (typeof document === 'undefined') {
    return;
  }

  const expires = new Date(Date.now() + SIX_MONTHS_IN_MS).toUTCString();
  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE_NAME}=${status}; Path=/; Expires=${expires}; SameSite=Lax${secureFlag}`;
}

function clearStoredConsent() {
  if (typeof document === 'undefined') {
    return;
  }

  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secureFlag}`;
}

async function loadPosthog() {
  if (posthogClient) {
    return posthogClient;
  }

  if (!posthogImportPromise) {
    posthogImportPromise = import('../../../instrumentation-client').then((mod) => mod.default);
  }

  posthogClient = await posthogImportPromise;
  return posthogClient;
}

export function AnalyticsConsentProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConsentStatus>('unknown');
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [clientState, setClientState] = useState<PosthogClient | null>(null);
  const hasResolvedInitialState = useRef(false);

  useEffect(() => {
    if (hasResolvedInitialState.current) {
      return;
    }

    const doNotTrackEnabled =
      typeof navigator !== 'undefined' &&
      (navigator.doNotTrack === '1' ||
        navigator.doNotTrack === 'yes' ||
        navigator.doNotTrack === 'true');

    if (doNotTrackEnabled) {
      persistConsent('denied');
      setStatus('denied');
      setIsPromptOpen(false);
      hasResolvedInitialState.current = true;
      return;
    }

    const storedStatus = readStoredConsent();
    if (storedStatus === 'granted' || storedStatus === 'denied') {
      setStatus(storedStatus);
      setIsPromptOpen(false);
    } else {
      setStatus('unknown');
      setIsPromptOpen(true);
    }
    hasResolvedInitialState.current = true;
  }, []);

  useEffect(() => {
    if (status !== 'granted') {
      setClientState(null);
      return;
    }

    let isCancelled = false;

    void loadPosthog()
      .then((client) => {
        if (isCancelled) return;
        client.set_config?.({
          disable_persistence: false,
          persistence: 'localStorage+cookie',
          autocapture: true,
          capture_pageview: true,
          capture_performance: true,
          disable_session_recording: false,
        });
        client.opt_in_capturing?.();
        if (!initialPageviewSent) {
          client.capture?.('$pageview');
          initialPageviewSent = true;
        }
        setClientState(client);
      })
      .catch(() => {
        posthogImportPromise = null;
        if (isCancelled) return;
        clearStoredConsent();
        setStatus('unknown');
        setIsPromptOpen(true);
        setClientState(null);
        initialPageviewSent = false;
      });

    return () => {
      isCancelled = true;
    };
  }, [status]);

  const accept = useCallback(() => {
    persistConsent('granted');
    setStatus('granted');
    setIsPromptOpen(false);

    if (posthogClient) {
      posthogClient.set_config?.({
        disable_persistence: false,
        persistence: 'localStorage+cookie',
        opt_out_capturing_by_default: false,
      });
      posthogClient.opt_in_capturing?.();
    }
  }, []);

  const decline = useCallback(() => {
    persistConsent('denied');
    setStatus('denied');
    setIsPromptOpen(false);

    if (posthogClient) {
      posthogClient.set_config?.({
        disable_persistence: true,
        persistence: 'memory',
        autocapture: false,
        capture_pageview: false,
        capture_performance: false,
        disable_session_recording: true,
      });
      posthogClient.opt_out_capturing?.();
      posthogClient.reset?.();
      initialPageviewSent = false;
    }
    setClientState(null);
  }, []);

  const openPreferences = useCallback(() => {
    setIsPromptOpen(true);
  }, []);

  const value = useMemo<AnalyticsConsentContextValue>(
    () => ({ status, isPromptOpen, accept, decline, openPreferences, client: clientState }),
    [status, isPromptOpen, accept, decline, openPreferences, clientState],
  );

  return (
    <AnalyticsConsentContext.Provider value={value}>{children}</AnalyticsConsentContext.Provider>
  );
}

export function useAnalyticsConsent() {
  const context = useContext(AnalyticsConsentContext);
  if (!context) {
    throw new Error('useAnalyticsConsent must be used within an AnalyticsConsentProvider');
  }
  return context;
}

export function useAnalytics() {
  const { status, client } = useAnalyticsConsent();
  const isEnabled = status === 'granted' && Boolean(client);

  const capture = useCallback(
    (...args: Parameters<PosthogClient['capture']>) => {
      if (!isEnabled || !client) return;
      client.capture(...args);
    },
    [client, isEnabled],
  );

  const captureException = useCallback(
    (...args: Parameters<PosthogClient['captureException']>) => {
      if (!isEnabled || !client?.captureException) return;
      client.captureException(...args);
    },
    [client, isEnabled],
  );

  const identify = useCallback(
    (...args: Parameters<PosthogClient['identify']>) => {
      if (!isEnabled || !client?.identify) return;
      client.identify(...args);
    },
    [client, isEnabled],
  );

  const setPersonProperties = useCallback(
    (...args: Parameters<PosthogClient['setPersonProperties']>) => {
      if (!isEnabled || !client?.setPersonProperties) return;
      client.setPersonProperties(...args);
    },
    [client, isEnabled],
  );

  const reset = useCallback(() => {
    if (!client?.reset) return;
    client.reset();
  }, [client]);

  return useMemo(
    () => ({
      capture,
      captureException,
      identify,
      setPersonProperties,
      reset,
      isEnabled,
      status,
      client,
    }),
    [capture, captureException, identify, isEnabled, reset, setPersonProperties, status, client],
  );
}
