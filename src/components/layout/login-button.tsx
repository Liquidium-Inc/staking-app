'use client';

import {
  useLaserEyes,
  SUPPORTED_WALLETS,
  WalletIcon,
  ProviderType,
  LaserEyesContextType,
} from '@omnisat/lasereyes-react';
import { X } from 'lucide-react';
import Link from 'next/link';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { Button } from '@ui/button';

import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from '../ui/drawer';

const wallets = [
  { name: 'xverse', enabled: true },
  { name: 'magic-eden', key: 'hasMagicEden' },
  { name: 'leather' },
  { name: 'unisat', enabled: true },
  { name: 'okx', label: 'OKX' },
  { name: 'phantom' },
  { name: 'oyl', label: 'OYL Wallet' },
] satisfies {
  name: ProviderType;
  enabled?: boolean; // toggle this to enable the login
  label?: string; // if needed to customize the default behaviour of just capitalize
  key?: keyof LaserEyesContextType; // key to find it is installed or not
}[];

export const LoginButton = () => {
  const context = useLaserEyes();

  const { connect } = context;
  const { capture } = useAnalytics();

  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button variant="secondary" className="py-5">
          Connect
        </Button>
      </DrawerTrigger>
      <DrawerContent className="m-2 w-full max-w-xs rounded-2xl border-r-0 border-gray-500/20 p-5">
        <div className="flex w-full items-center justify-between">
          <DrawerTitle>Connect Wallet</DrawerTitle>
          <DrawerClose asChild>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Close drawer"
              className="h-8 w-8 rounded-full border border-gray-500/20"
            >
              <X className="h-4 w-4 opacity-60" aria-hidden="true" />
            </Button>
          </DrawerClose>
        </div>
        <div className="my-3 flex flex-col gap-2">
          {wallets.map((wallet) => {
            const isInstalled = context[wallet.key ?? toHas(wallet.name)];
            const url = SUPPORTED_WALLETS[wallet.name].url;
            const label = wallet.label ?? wallet.name.replace('-', ' ');
            const statusText = wallet.enabled
              ? !isInstalled
                ? 'Not installed'
                : null
              : 'Coming soon';

            return (
              <Button
                variant="ghost"
                className="bg-card justify-start space-x-4 rounded-2xl border border-gray-500/20 py-7"
                key={wallet.name}
                disabled={!wallet.enabled}
                onClick={() => {
                  if (!wallet.enabled) return;
                  if (isInstalled) {
                    capture('wallet_connection_attempt', {
                      wallet_name: wallet.name,
                      is_installed: true,
                      action_taken: 'connect',
                    });
                    return connect(wallet.name);
                  }
                  capture('wallet_connection_attempt', {
                    wallet_name: wallet.name,
                    is_installed: false,
                    action_taken: 'open_install_url',
                  });
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
              >
                <WalletIcon size={32} walletName={wallet.name} />
                <div className="flex flex-col text-left">
                  <span className="font-light capitalize">{label}</span>
                  {statusText && (
                    <span className="text-xs font-light opacity-60">{statusText}</span>
                  )}
                </div>
              </Button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-white/60">
          By connecting a wallet, you agree to Liquidium{' '}
          <Link href="/terms" className="underline transition-opacity hover:opacity-80">
            Terms of Service
          </Link>{' '}
          and consent to its{' '}
          <Link href="/privacy" className="underline transition-opacity hover:opacity-80">
            Privacy Policy
          </Link>
          .
        </p>
      </DrawerContent>
    </Drawer>
  );
};

const toHas = <T extends string>(str: T): `has${Capitalize<T>}` => {
  return `has${str.charAt(0).toUpperCase() + str.slice(1)}` as `has${Capitalize<T>}`;
};
