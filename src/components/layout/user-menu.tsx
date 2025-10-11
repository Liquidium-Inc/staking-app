'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import { LinkBreak1Icon } from '@radix-ui/react-icons';
import { CopyIcon } from 'lucide-react';
import Image from 'next/image';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { EmailSubscription } from '@/components/email/email-subscription';
import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { config } from '@/config/public';
import { useBalance } from '@/hooks/api/useBalance';
import { useBtcBalance } from '@/hooks/api/useBtcBalance';
import { anonymizeAddress } from '@/lib/anonymizeAddress';
import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/avatar';
import { Button } from '@ui/button';
import { TokenLogo } from '@ui/token';

import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Skeleton } from '../ui/skeleton';

export const UserMenu = () => {
  const context = useLaserEyes();

  const { isInitializing, isConnecting, disconnect, address, paymentAddress } = context;

  // Fetch balances
  const liqBalance = useBalance(address, config.rune.id, config.rune.decimals);
  const sLiqBalance = useBalance(address, config.sRune.id, config.sRune.decimals);
  const btcBalance = useBtcBalance(address);

  const isLoading = isInitializing || isConnecting;
  const { capture, identify, setPersonProperties, reset, client, isEnabled } = useAnalytics();
  const anonymizedAddress = anonymizeAddress(address);
  const anonymizedPaymentAddress = anonymizeAddress(paymentAddress);

  // Identify user in PostHog by wallet address when available
  useEffect(() => {
    if (!anonymizedAddress || !isEnabled || !client) return;
    const current = client.get_distinct_id?.();
    const personProperties = {
      ...(anonymizedAddress ? { wallet_address: anonymizedAddress } : {}),
      ...(anonymizedPaymentAddress ? { payment_address: anonymizedPaymentAddress } : {}),
      network: config.network,
    };

    if (current !== anonymizedAddress) {
      identify(anonymizedAddress, personProperties);
      return;
    }

    setPersonProperties(personProperties);
  }, [
    anonymizedAddress,
    anonymizedPaymentAddress,
    client,
    identify,
    isEnabled,
    setPersonProperties,
  ]);
  if (isLoading) return <Skeleton className="h-10 w-10 rounded-full" />;

  return (
    <Popover>
      <PopoverTrigger className="flex cursor-pointer items-center space-x-2">
        <span className={cn('hidden items-center space-x-1 text-sm transition-opacity md:flex')}>
          {address.slice(0, 4)}...{address.slice(-4)}
        </span>
        <Avatar
          key={address}
          className="bg-card flex items-center justify-center border-1 border-white"
        >
          <AvatarImage
            src={`https://www.gravatar.com/avatar/${context.publicKey}?d=retro`}
            alt={`${address} profile image`}
          />
          <AvatarFallback>{address}</AvatarFallback>
        </Avatar>
      </PopoverTrigger>
      <PopoverContent
        className="border-gray-500/30 bg-black/80 backdrop-blur-sm"
        sideOffset={10}
        side="bottom"
        align="end"
      >
        {/* Balance Section */}
        <div className="mb-3 space-y-2">
          <div className="text-xs font-medium text-gray-300">Balances</div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <div className="flex items-center space-x-1.5">
                <Image src="/bitcoin.svg" alt="BTC" width={12} height={12} className="h-3 w-3" />
                <span className="font-medium text-gray-400">BTC</span>
              </div>
              <span className="font-mono font-medium">
                {btcBalance.isLoading ? (
                  <Skeleton className="h-3 w-16" />
                ) : btcBalance.error ? (
                  <span className="text-red-400">Error</span>
                ) : (
                  formatCurrency(btcBalance.data || 0, 8)
                )}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <div className="flex items-center space-x-1.5">
                <TokenLogo logo={config.rune.symbol} variant="primary" size={12} />
                <span className="font-medium text-gray-400">LIQ</span>
              </div>
              <span className="font-mono font-medium">
                {liqBalance.isLoading ? (
                  <Skeleton className="h-3 w-16" />
                ) : liqBalance.error ? (
                  <span className="text-red-400">Error</span>
                ) : (
                  formatCurrency(liqBalance.data || 0, config.rune.decimals)
                )}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <div className="flex items-center space-x-1.5">
                <TokenLogo logo={config.sRune.symbol} variant="secondary" size={12} />
                <span className="font-medium text-gray-400">sLIQ</span>
              </div>
              <span className="font-mono font-medium">
                {sLiqBalance.isLoading ? (
                  <Skeleton className="h-3 w-16" />
                ) : sLiqBalance.error ? (
                  <span className="text-red-400">Error</span>
                ) : (
                  formatCurrency(sLiqBalance.data || 0, config.sRune.decimals)
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Email Subscription Section */}
        {address && <EmailSubscription address={address} />}

        {/* Address Section */}
        <div className="flex flex-col gap-1 text-xs">
          <Button
            variant="ghost"
            size="sm"
            className="bg-card flex w-full items-center justify-center space-x-2 rounded-full border border-gray-500/30"
            onClick={() => {
              capture('user_menu_copy_address', {
                address_type: 'main',
                ...(anonymizedAddress ? { address: anonymizedAddress } : {}),
              });
              navigator.clipboard.writeText(address);
              toast.success('Address copied to clipboard');
            }}
          >
            <CopyIcon className="h-3.5 w-3.5" />
            <span className="text-xs">
              {address.slice(0, 4)}...{address.slice(-4)}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-card flex w-full items-center justify-center space-x-2 rounded-full border border-gray-500/30 p-1"
            onClick={() => {
              capture('user_menu_copy_address', {
                address_type: 'payment',
                ...(anonymizedPaymentAddress ? { address: anonymizedPaymentAddress } : {}),
              });
              navigator.clipboard.writeText(paymentAddress);
              toast.success('Payment address copied to clipboard');
            }}
          >
            <CopyIcon className="h-3.5 w-3.5" />
            <span className="text-xs">
              {paymentAddress.slice(0, 4)}...{paymentAddress.slice(-4)}
            </span>
          </Button>
        </div>
        <div className="mt-4 flex space-x-4">
          <Button
            variant="ghost"
            className="w-full rounded-full border-2 border-gray-500/50"
            onClick={() => {
              capture('user_menu_disconnect_wallet', {
                ...(anonymizedAddress ? { address: anonymizedAddress } : {}),
              });
              // Clear person association on logout per PostHog docs
              reset();
              disconnect();
            }}
          >
            <LinkBreak1Icon className="mr-1 h-3.5 w-3.5" />
            <span className="text-xs">Disconnect</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
