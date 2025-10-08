'use client';

import {
  LaserEyesProvider,
  MAINNET,
  TESTNET4,
  UNISAT,
  useLaserEyes,
} from '@omnisat/lasereyes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AnalyticsConsentProvider } from '@/components/privacy/analytics-consent-provider';
import CookieConsentBanner from '@/components/privacy/cookie-consent-banner';
import { config } from '@/config/public';

const network = config.network === 'testnet4' ? TESTNET4 : MAINNET;

const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then((mod) => mod.ReactQueryDevtools),
  { ssr: false },
);

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {process.env.NODE_ENV !== 'production' && <ReactQueryDevtools />}
      <AnalyticsConsentProvider>
        <LaserEyesProvider config={{ network }}>
          <UnisatAddressGuard />
          {children}
          <CookieConsentBanner />
        </LaserEyesProvider>
      </AnalyticsConsentProvider>
    </QueryClientProvider>
  );
}

function UnisatAddressGuard() {
  const { provider, connected, address, paymentAddress, disconnect } = useLaserEyes((state) => ({
    provider: state.provider,
    connected: state.connected,
    address: state.address,
    paymentAddress: state.paymentAddress,
    disconnect: state.disconnect,
  }));

  const hasWarnedRef = useRef(false);

  useEffect(() => {
    if (!connected || provider !== UNISAT) {
      hasWarnedRef.current = false;
      return;
    }

    const addresses = [address, paymentAddress];
    const hasUnsupportedAddress = addresses.some((value) => isLegacyOrNestedAddress(value));

    if (!hasUnsupportedAddress) {
      hasWarnedRef.current = false;
      return;
    }

    if (!hasWarnedRef.current) {
      hasWarnedRef.current = true;
      toast.error(
        'Legacy and nested SegWit accounts are not supported in Unisat. Switch to a Taproot or native Segwit account and reconnect.',
      );
    }

    disconnect();
  }, [address, connected, disconnect, paymentAddress, provider]);

  return null;
}

const UNSUPPORTED_UNISAT_ADDRESS_PREFIXES = new Set(['1', '2', '3', 'm', 'n']);

function isLegacyOrNestedAddress(value?: string) {
  if (!value) return false;

  const prefix = value.charAt(0).toLowerCase();
  return UNSUPPORTED_UNISAT_ADDRESS_PREFIXES.has(prefix);
}
