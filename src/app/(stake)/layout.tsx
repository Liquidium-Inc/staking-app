'use client';

import { Children } from 'react';

import { Tabs } from '@/components/layout/tabs';
import { PendingToasts } from '@/components/ui/pending-toasts';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="m-4 w-full max-w-md md:my-10">
      <PendingToasts />
      <Tabs />
      {Children.toArray(children)}
    </div>
  );
}
