import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TermsGate } from './terms-gate';

const mock = vi.hoisted(() => ({ useWalletAuth: vi.fn(), useLaserEyes: vi.fn() }));

vi.mock('@/components/wallet/wallet-auth-provider', () => ({
  useWalletAuth: mock.useWalletAuth,
}));
vi.mock('@omnisat/lasereyes-react', () => ({
  useLaserEyes: (select: (state: unknown) => unknown) => select(mock.useLaserEyes()),
}));
vi.mock('@/lib/address', () => ({
  addressesMatch: (a?: string | null, b?: string | null) => !!a && a === b,
}));

const renderGate = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TermsGate />
    </QueryClientProvider>,
  );

describe('TermsGate', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    mock.useWalletAuth.mockReturnValue({ status: 'authenticated', address: 'bc1pwallet' });
    mock.useLaserEyes.mockReturnValue({ connected: true, address: 'bc1pwallet' });
  });

  it('does not look anything up after the wallet disconnects', () => {
    mock.useLaserEyes.mockReturnValue({ connected: false, address: '' });

    renderGate();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not look anything up before the wallet is connected', () => {
    mock.useWalletAuth.mockReturnValue({ status: 'idle' });

    renderGate();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays hidden when nothing is pending', async () => {
    fetchMock.mockResolvedValue(Response.json({ pendingVersion: null }));

    renderGate();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText('Updates to our Terms of Use')).toBeNull();
  });

  it('needs the checkbox, then saves the agreement and closes', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ pendingVersion: '2.0' }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    renderGate();

    const agree = await screen.findByRole('button', { name: 'Agree & continue' });
    expect(agree).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(agree);

    await waitFor(() => expect(screen.queryByText('Updates to our Terms of Use')).toBeNull());
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/terms',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ address: 'bc1pwallet', version: '2.0' }),
      }),
    );
  });

  it('starts unchecked for each wallet', async () => {
    fetchMock.mockImplementation(async () => Response.json({ pendingVersion: '2.0' }));

    const view = renderGate();

    fireEvent.click(await screen.findByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toHaveProperty('ariaChecked', 'true');

    mock.useWalletAuth.mockReturnValue({ status: 'authenticated', address: 'bc1pother' });
    mock.useLaserEyes.mockReturnValue({ connected: true, address: 'bc1pother' });
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <TermsGate />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false'),
    );
  });

  it('can be postponed without saving anything', async () => {
    fetchMock.mockResolvedValue(Response.json({ pendingVersion: '2.0' }));

    renderGate();

    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));

    expect(screen.queryByText('Updates to our Terms of Use')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
