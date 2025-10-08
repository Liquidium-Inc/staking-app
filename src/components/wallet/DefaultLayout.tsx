'use client';

import { LaserEyesProvider } from '@omnisat/lasereyes-react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import React, { ReactNode } from 'react';

export default function DefaultLayout({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <LaserEyesProvider>{children}</LaserEyesProvider>
    </NextThemesProvider>
  );
}
