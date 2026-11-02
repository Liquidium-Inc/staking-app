'use client';
import { useLaserEyes } from '@omnisat/lasereyes-react';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

import { ContactSupportButton } from '@/components/support/contact-support-button';

import { LoginButton } from './login-button';
import { UserMenu } from './user-menu';

const Header: React.FC = () => {
  const { connected } = useLaserEyes();
  return (
    <header className="flex w-full max-w-7xl items-center justify-between px-2 py-4 md:px-8">
      <div className="flex items-center space-x-8">
        <Link href="/">
          <div className="flex items-center space-x-2">
            <Image src="/isologo.svg" alt="Liquidium logo" width={140} height={40} priority />
          </div>
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <ContactSupportButton
          label="Support"
          className="cursor-pointer text-sm text-white/70 transition-colors hover:text-white"
        />
        {connected ? <UserMenu /> : <LoginButton />}
      </div>
    </header>
  );
};

export default Header;
