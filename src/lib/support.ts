'use client';

type SupportContext = {
  route?: string;
  appVersion?: string;
  walletProviders?: string[];
  recentErrors?: { ts: number; message: string }[];
};

type SupportBootOptions = {
  app: 'staking';
  getSupportTokens?: () => Promise<{ staking?: string }>;
  getContext?: () => SupportContext;
};

type SupportApi = {
  boot(options: SupportBootOptions): void;
  open(options?: { prefill?: string }): void;
  setContext(context: SupportContext): void;
  refreshIdentity(): Promise<void>;
};

type QueuedCall = [keyof SupportApi, unknown[]];
type SupportStub = SupportApi & { q?: QueuedCall[] };

declare global {
  interface Window {
    LiquidiumSupport?: SupportStub;
  }
}

const SUPPORT_WIDGET_SRC = 'https://support.liquidium.fi/widget.js';
const SUPPORT_TOKEN_PATH = '/api/support/token';

export const isSupportWidgetEnabled = process.env.NEXT_PUBLIC_SUPPORT_WIDGET === 'true';

const noopApi: SupportApi = {
  boot() {},
  open() {},
  setContext() {},
  async refreshIdentity() {},
};

/** Queues calls until widget.js has loaded and replaces this stub. Safe to call many times. */
function getApi(): SupportApi {
  if (typeof window === 'undefined' || !isSupportWidgetEnabled) return noopApi;

  if (!window.LiquidiumSupport) {
    const queue: QueuedCall[] = [];
    const enqueue =
      (method: keyof SupportApi) =>
      (...args: unknown[]) => {
        queue.push([method, args]);
        return Promise.resolve();
      };
    window.LiquidiumSupport = {
      q: queue,
      boot: enqueue('boot'),
      open: enqueue('open'),
      setContext: enqueue('setContext'),
      refreshIdentity: enqueue('refreshIdentity'),
    };

    const script = document.createElement('script');
    script.src = SUPPORT_WIDGET_SRC;
    script.async = true;
    document.head.appendChild(script);
  }

  return window.LiquidiumSupport;
}

export const support = {
  boot: (options: SupportBootOptions) => getApi().boot(options),
  open: (prefill?: string) => getApi().open(prefill ? { prefill } : undefined),
  setContext: (context: SupportContext) => getApi().setContext(context),
  refreshIdentity: () => getApi().refreshIdentity(),
};

/** Exchanges the wallet session for a short-lived support token; null when not signed in. */
export async function fetchSupportToken(): Promise<string | null> {
  const response = await fetch(SUPPORT_TOKEN_PATH, { method: 'POST', credentials: 'include' });
  if (!response.ok) return null;
  const body = (await response.json()) as { token?: string };
  return body.token ?? null;
}
