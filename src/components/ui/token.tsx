'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import Image from 'next/image';
import * as React from 'react';

import { cn } from '../../lib/utils';

const toggleVariants = cva('inline-flex items-center justify-center rounded-full', {
  variants: {
    variant: {
      primary: 'bg-gradient-to-b from-primary-from to-primary-to',
      secondary: 'bg-gradient-to-b from-secondary-from to-secondary-to',
      ghost: 'bg-transparent',
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
});

interface TokenLogoProps extends VariantProps<typeof toggleVariants> {
  className?: string;
  logo: string;
  size?: number;
  padding?: number;
}

const TokenLogo = (props: TokenLogoProps) => {
  const { className, variant, logo, size = 14, padding = size * 0.4 } = props;
  return (
    <div
      className={cn(toggleVariants({ variant, className }))}
      style={{ width: size, height: size }}
    >
      {logo?.length > 2 ? (
        <Image src={logo} alt={logo} width={size - padding} height={size - padding} />
      ) : (
        <svg
          width={size - padding}
          height={size - padding}
          viewBox="0 -1.5 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#1C1C1C">
            {logo}
          </text>
        </svg>
      )}
    </div>
  );
};

TokenLogo.displayName = 'TokenLogo';

export { TokenLogo };
