import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import axios from 'axios';
import React from 'react';
import { toast } from 'sonner';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useWithdrawMutation } from './useWithdrawMutation';

const captureMock = vi.fn();

vi.mock('@/components/privacy/analytics-consent-provider', () => ({
  useAnalytics: () => ({ capture: captureMock }),
}));

vi.mock('@omnisat/lasereyes-react', () => ({
  useLaserEyes: () => ({
    address: 'test-address',
    paymentAddress: 'test-payment-address',
    signPsbt: vi.fn().mockResolvedValue({ signedPsbtBase64: 'signed-psbt' }),
    publicKey: 'test-public-key',
    paymentPublicKey: 'test-payment-public-key',
  }),
}));
vi.mock('axios', () => ({
  __esModule: true,
  default: {
    post: vi.fn(),
    isAxiosError: (e: unknown) => Boolean(e && (e as Record<string, unknown>).isAxiosError),
  },
  post: vi.fn(),
  isAxiosError: (e: unknown) => Boolean(e && (e as Record<string, unknown>).isAxiosError),
}));
vi.mock('sonner', () => ({
  toast: { loading: vi.fn().mockReturnValue('toast-id'), success: vi.fn(), error: vi.fn() },
}));
const mockInvalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual('@tanstack/react-query')),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const axiosMock = axios as unknown as { post: ReturnType<typeof vi.fn> };
const toastMock = toast as unknown as {
  loading: ReturnType<typeof vi.fn>;
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

describe('useWithdrawMutation', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    captureMock.mockClear();
    mockInvalidateQueries.mockClear();
    axiosMock.post.mockReset();
    toastMock.loading.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('successfully withdraws and calls all steps', async () => {
    axiosMock.post
      .mockResolvedValueOnce({ data: { psbt: 'psbt-data', toSign: ['input1'] } })
      .mockResolvedValueOnce({ data: { result: 'success' } });
    const { result } = renderHook(() => useWithdrawMutation(), { wrapper });
    await act(() => result.current.mutateAsync({ txid: 'txid-123' }));
    expect(axiosMock.post).toHaveBeenCalledWith(
      '/api/withdraw',
      expect.objectContaining({ txid: 'txid-123' }),
    );
    expect(axiosMock.post).toHaveBeenCalledWith('/api/withdraw/confirm', {
      psbt: 'signed-psbt',
      sender: 'test-address',
    });
    expect(toastMock.loading).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith('Withdraw request sent successfully', {
      id: 'toast-id',
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['pending-unstakes', 'test-address'],
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['balance', 'test-address'] });
  });

  it('handles axios error with string message', async () => {
    axiosMock.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: 'API error' } },
    });
    const { result } = renderHook(() => useWithdrawMutation(), { wrapper });
    await expect(result.current.mutateAsync({ txid: 'txid-123' })).rejects.toThrow('API error');
    expect(toastMock.error).toHaveBeenCalledWith(
      'Please retry or try again later.\nAPI error.',
      expect.objectContaining({
        id: 'toast-id',
        style: { whiteSpace: 'pre-line' },
      }),
    );
  });

  it('handles axios error with non-string error', async () => {
    axiosMock.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: { foo: 'bar' } } },
    });
    const { result } = renderHook(() => useWithdrawMutation(), { wrapper });
    await expect(result.current.mutateAsync({ txid: 'txid-123' })).rejects.toThrow(
      '[object Object]',
    );
    expect(toastMock.error).toHaveBeenCalledWith(
      'Please retry or try again later.\n[object Object].',
      expect.objectContaining({
        id: 'toast-id',
        style: { whiteSpace: 'pre-line' },
      }),
    );
  });

  it('handles generic error', async () => {
    axiosMock.post.mockRejectedValueOnce(new Error('Something went wrong'));
    const { result } = renderHook(() => useWithdrawMutation(), { wrapper });
    await expect(result.current.mutateAsync({ txid: 'txid-123' })).rejects.toThrow(
      'Something went wrong',
    );
    expect(toastMock.error).toHaveBeenCalledWith(
      'Please retry or try again later.\nSomething went wrong.',
      expect.objectContaining({
        id: 'toast-id',
        style: { whiteSpace: 'pre-line' },
      }),
    );
  });
});
