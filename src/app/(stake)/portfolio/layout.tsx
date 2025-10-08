import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio | Liquidium Staking',
  description:
    'View your staking portfolio and track your LIQ and sLIQ token balances on the Liquidium Bitcoin rune staking protocol.',
  alternates: {
    canonical: '/portfolio',
  },
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
