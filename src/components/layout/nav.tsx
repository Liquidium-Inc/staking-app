'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [{ href: '/', label: 'Stake' }];

export const Nav = () => {
  const pathname = usePathname();

  return (
    <nav>
      <ul className="flex space-x-4">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={`opacity-70 transition-opacity hover:opacity-100 ${pathname.startsWith(link.href) ? 'opacity-100' : ''}`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
