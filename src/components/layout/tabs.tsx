'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Stake', url: '/stake' },
  { label: 'Unstake', url: '/unstake' },
  { label: 'Portfolio', url: '/portfolio', isNew: true },
] as const;

export const Tabs = () => {
  const pathname = usePathname();

  return (
    <nav className="mb-3">
      <ul className="flex w-full space-x-1.5">
        {tabs.map(({ label, url }) => (
          <li key={url} className="last:ml-auto">
            <Link
              href={url}
              className={cn(
                'flex flex-1 items-center justify-center rounded-full border-2 px-6 py-3 text-center',
                pathname === url ? 'border-gray-200 font-bold' : 'border-gray-200/10 font-semibold',
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
