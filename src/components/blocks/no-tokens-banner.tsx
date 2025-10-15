'use client';

import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { Button } from '@/components/ui/button';

const COOKIE_NAME = 'liq_no_tokens_banner_dismissed';
const COOKIE_EXPIRY_DAYS = 30;

interface NoTokensBannerProps {
  connected: boolean;
  balance: number;
  sBalance: number;
  isBalanceLoading: boolean;
  isSBalanceLoading: boolean;
}

export function NoTokensBanner({
  connected,
  balance,
  sBalance,
  isBalanceLoading,
  isSBalanceLoading,
}: NoTokensBannerProps) {
  const { capture } = useAnalytics();
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    if (isBalanceLoading || isSBalanceLoading) {
      return;
    }

    const hasNoTokens = connected && sBalance === 0 && balance === 0;

    if (!hasNoTokens) {
      return;
    }

    const hasDismissed = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${COOKIE_NAME}=`));

    if (hasDismissed) {
      return;
    }

    setIsDismissed(false);
  }, [connected, balance, sBalance, isBalanceLoading, isSBalanceLoading]);

  const handleDismiss = () => {
    setIsDismissed(true);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);
    document.cookie = `${COOKIE_NAME}=true; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;

    capture('no_tokens_banner_dismissed', {
      location: 'stake_page',
    });
  };

  if (isDismissed) {
    return null;
  }

  return (
    <div className="flex items-center justify-between rounded-full border border-neutral-800 pl-3">
      <div className="text-sm">Buy LIQ and start staking</div>
      <div className="flex items-center space-x-0">
        <Button asChild size="sm" className="h-5 gap-1 rounded-full" variant="secondary">
          <Link
            href="https://help.liquidium.fi/en/articles/11359560-liq-marketplaces"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              capture('buy_liq_link_clicked', { location: 'no_tokens_banner' });
            }}
          >
            Buy LIQ
            <ExternalLink size={12} />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDismiss} aria-label="Dismiss">
          <X size={14} />
        </Button>
      </div>
    </div>
  );
}
