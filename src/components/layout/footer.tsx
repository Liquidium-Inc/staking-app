'use client';

import Big from 'big.js';
import Image from 'next/image';
import Link from 'next/link';

import CookiePreferencesButton from '@/components/privacy/cookie-preferences-button';
import { useProtocol } from '@/hooks/api/useProtocol';
import { formatCurrency } from '@/lib/formatCurrency';

const footerLinks = [
  {
    label: 'Privacy Policy',
    href: '/privacy',
    external: false,
  },
  {
    label: 'Terms of Service',
    href: '/terms',
    external: false,
  },
  {
    label: 'Tokenomics',
    href: 'https://tokenomics.liquidium.fi/',
    external: true,
  },
  {
    label: 'DAO',
    href: 'https://app.voti.co/timeline/661d495505ffada5d66388d5',
    external: true,
  },
  {
    label: 'Twitter',
    href: 'https://x.com/LiquidiumOrg',
    external: true,
  },
  {
    label: 'GitHub',
    href: 'https://github.com/Liquidium-Inc/staking-app',
    external: true,
  },
  {
    label: 'Marketplaces',
    href: 'https://help.liquidium.fi/en/articles/11359560-liquidium-marketplaces',
    external: true,
  },
];

export default function Footer() {
  const { data } = useProtocol();
  const { rune, btc } = data;

  const tokenPrice = Big(rune.priceSats ?? 0)
    .times(btc.price)
    .div(100_000_000)
    .toNumber();

  return (
    <footer className="relative mx-auto mt-12 w-full max-w-7xl items-center border-t border-white/10 py-8">
      <div className="flex items-center justify-between">
        <Link
          href="https://www.liquidium.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
        >
          <Image
            src="/isologo.svg"
            alt="Liquidium Foundation"
            width={120}
            height={120}
            className="opacity-60"
          />
        </Link>

        <div className="absolute left-1/2 hidden w-full -translate-x-1/2 justify-center gap-5 xl:flex">
          {footerLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className="text-sm text-white/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <CookiePreferencesButton />
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <span>Audited by</span>
          <Image
            src="/scalebit-logo.avif"
            alt="ScaleBit"
            width={76}
            height={20}
            className="h-5 w-auto opacity-70"
          />
        </div>
      </div>
      <Link
        href="https://www.coingecko.com/en/coins/liquidium-token"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-0 flex -translate-y-[130%] items-center rounded-full border border-white/10 p-0.5 pr-2 hover:opacity-80"
      >
        <Image src="/liquidium.svg" alt="liq-logo" width={30} height={30} className="-ml-0.5 h-6" />
        <span className="text-sm">${formatCurrency(tokenPrice)}</span>
      </Link>
      <div className="mt-6 flex w-full flex-col justify-center gap-2 xl:hidden">
        {footerLinks.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
            className="text-sm text-white/70 transition-colors hover:text-white"
          >
            {link.label}
          </Link>
        ))}
        <CookiePreferencesButton />
      </div>
    </footer>
  );
}
