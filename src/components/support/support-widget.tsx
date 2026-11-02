'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useSonner } from 'sonner';

import { useWalletAuth } from '@/components/wallet/wallet-auth-provider';
import { fetchSupportToken, support } from '@/lib/support';

const RECENT_ERROR_LIMIT = 5;
const RECENT_ERROR_MAX_LENGTH = 200;

type RecentError = { ts: number; message: string };

/** Boots the Liquidium Support widget and keeps its context in sync with the app. */
export function SupportWidget() {
  const pathname = usePathname();
  const { toasts } = useSonner();
  const { status, address } = useWalletAuth();
  const { provider } = useLaserEyes((state) => ({ provider: state.provider }));

  const recentErrorsRef = useRef<RecentError[]>([]);
  const seenToastIdsRef = useRef(new Set<string | number>());

  useEffect(() => {
    support.boot({
      app: 'staking',
      getSupportTokens: async () => {
        const staking = await fetchSupportToken();
        return staking ? { staking } : {};
      },
      getContext: () => ({
        appVersion: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
        recentErrors: [...recentErrorsRef.current],
      }),
    });
  }, []);

  useEffect(() => {
    support.setContext({ route: pathname });
  }, [pathname]);

  useEffect(() => {
    support.setContext({ walletProviders: provider ? [provider] : [] });
  }, [provider]);

  useEffect(() => {
    if (status === 'pending') return;
    void support.refreshIdentity();
  }, [status, address]);

  useEffect(() => {
    const newErrors = toasts.filter(
      (toast) =>
        toast.type === 'error' &&
        typeof toast.title === 'string' &&
        !seenToastIdsRef.current.has(toast.id),
    );
    if (newErrors.length === 0) return;

    for (const toast of newErrors) {
      seenToastIdsRef.current.add(toast.id);
      recentErrorsRef.current.push({
        ts: Date.now(),
        message: String(toast.title).slice(0, RECENT_ERROR_MAX_LENGTH),
      });
    }
    recentErrorsRef.current = recentErrorsRef.current.slice(-RECENT_ERROR_LIMIT);
    support.setContext({ recentErrors: [...recentErrorsRef.current] });
  }, [toasts]);

  return null;
}
