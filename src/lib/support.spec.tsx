import { afterEach, describe, expect, it, vi } from 'vitest';

const WIDGET_SRC = 'https://support.liquidium.fi/widget.js';

async function loadSupport(flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPPORT_WIDGET', flag);
  return await import('./support');
}

const widgetScripts = () =>
  Array.from(document.head.querySelectorAll('script')).filter(
    (script) => script.src === WIDGET_SRC,
  );

describe('support loader', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.LiquidiumSupport;
    widgetScripts().forEach((script) => script.remove());
  });

  it('does nothing while NEXT_PUBLIC_SUPPORT_WIDGET is unset', async () => {
    const { support, isSupportWidgetEnabled } = await loadSupport(undefined);

    support.open();

    expect(isSupportWidgetEnabled).toBe(false);
    expect(window.LiquidiumSupport).toBeUndefined();
    expect(widgetScripts()).toHaveLength(0);
  });

  it('loads widget.js once and queues calls until it is ready', async () => {
    const { support } = await loadSupport('true');

    support.boot({ app: 'staking' });
    support.setContext({ route: '/stake' });
    support.open();

    expect(widgetScripts()).toHaveLength(1);
    expect(window.LiquidiumSupport?.q?.map(([method]) => method)).toEqual([
      'boot',
      'setContext',
      'open',
    ]);
  });

  it('returns null from fetchSupportToken when not signed in', async () => {
    const { fetchSupportToken } = await loadSupport('true');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));

    expect(await fetchSupportToken()).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/support/token', {
      method: 'POST',
      credentials: 'include',
    });
  });
});
