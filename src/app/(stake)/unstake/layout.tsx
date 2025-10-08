import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Unstake | Liquidium Staking',
  description:
    'Unstake your sLIQ tokens and withdraw your original LIQ tokens from the Liquidium Bitcoin rune staking protocol.',
  alternates: {
    canonical: '/unstake',
  },
};

export default function UnstakeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
