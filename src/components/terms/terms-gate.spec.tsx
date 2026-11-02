import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TermsGate } from './terms-gate';

const mock = vi.hoisted(() => ({ useWalletAuth: vi.fn() }));

vi.mock('@/components/wallet/wallet-auth-provider', () => ({
  useWalletAuth: mock.useWalletAuth,
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
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ version: '2.0' }) }),
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
