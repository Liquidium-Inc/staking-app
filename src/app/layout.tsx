import type { Metadata } from 'next';
import { Children, Suspense } from 'react';

import './globals.css';

import { FlashQueryToasts } from '@/components/ui/flash-query-toasts';
import { Toaster } from '@/components/ui/sonner';

import Footer from '../components/layout/footer';
import Header from '../components/layout/header';

import { ttCommonsPro } from './fonts';
import Providers from './providers';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://liquidium.org';

export const metadata: Metadata = {
  title: 'Liquidium Staking',
  description: 'Liquidium Staking Protocol by the Liquidium Foundation',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${ttCommonsPro.variable} ${ttCommonsPro.className} flex min-h-screen flex-col antialiased`}
      >
        <Providers>
          <div className="flex w-full flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center px-2">
              <Header />
              <main className="flex w-full flex-1 flex-col items-center px-1">
                {Children.toArray(children)}
              </main>
              <Footer />
              <Toaster />
              <Suspense>
                <FlashQueryToasts />
              </Suspense>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
