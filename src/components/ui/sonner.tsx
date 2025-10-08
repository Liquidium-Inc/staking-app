'use client';

import { useTheme } from 'next-themes';
import { CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="top-center"
      style={{ '--width': '300px' } as CSSProperties}
      duration={6000}
      gap={8}
      toastOptions={{
        closeButton: false,
        classNames: {
          toast:
            '!bg-card !rounded-4xl !border !border-white/10 !text-white !backdrop-blur-md !shadow-lg',
          closeButton: 'hidden',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
