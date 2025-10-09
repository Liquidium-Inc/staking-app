import Image from 'next/image';
import Link from 'next/link';

import CookiePreferencesButton from '@/components/privacy/cookie-preferences-button';

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
    href: 'https://x.com/LiquidiumFdn',
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
  return (
    <footer className="mx-auto mt-12 w-full max-w-6xl border-t border-white/10 px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
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

        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:gap-6">
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
      </div>
    </footer>
  );
}
