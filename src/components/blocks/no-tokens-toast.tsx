'use client';

import { AlertCircle, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
    // wait for balances to finish loading before checking
    if (isBalanceLoading || isSBalanceLoading) {
      return;
    }

    // check if user has no LIQ tokens and nothing staked
    const hasNoTokens = connected && sBalance === 0 && balance === 0;

    if (!hasNoTokens) {
      return;
    }

    // check if user has already dismissed the banner
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

    // set cookie to remember they've dismissed it
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
    <Card className="relative border-blue-500/30 bg-blue-950/20">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-6 w-6 p-0 opacity-50 hover:opacity-100"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X size={14} />
      </Button>
      <CardContent className="flex flex-col space-y-2 px-4 py-3">
        <div className="flex items-center space-x-2 text-sm font-semibold">
          <AlertCircle size={16} className="text-blue-400" />
          <span>You don&apos;t have any LIQ tokens</span>
        </div>
        <div className="text-xs opacity-75">Buy them here and start staking</div>
        <Link
          href="https://help.liquidium.fi/en/articles/11359560-liq-marketplaces"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-1 text-xs text-blue-400 hover:underline"
          onClick={() => {
            capture('buy_liq_link_clicked', {
              location: 'no_tokens_banner',
            });
          }}
        >
          <span>View marketplaces</span>
          <ExternalLink size={12} />
        </Link>
      </CardContent>
    </Card>
  );
}
