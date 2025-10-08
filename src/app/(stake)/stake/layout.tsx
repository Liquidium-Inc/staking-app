import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stake | Liquidium Staking',
  description:
    'Stake your LIQ tokens to earn yield on the Liquidium Bitcoin rune staking protocol.',
  alternates: {
    canonical: '/stake',
  },
};

export default function StakeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
