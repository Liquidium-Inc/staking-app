import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { formatCurrency } from '@/lib/formatCurrency';
import { getRunePrice } from '@/providers/rune-provider';

interface PageProps {
  params: Promise<{
    amount: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { amount } = await params;
  const tokenAmount = Number(amount);

  if (Number.isNaN(tokenAmount)) {
    return {
      title: 'Liquidium Staking',
    };
  }

  const tokenPrice = await getRunePrice();
  const usdValue = tokenAmount * tokenPrice;

  const title = `I earned ${formatCurrency(tokenAmount, 2)} LIQ on Liquidium!`;
  const description = `Check out my earnings: ${formatCurrency(tokenAmount, 2)} LIQ ($${formatCurrency(usdValue)} USD) from staking on Liquidium.`;

  // get base URL from headers or use default
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://liquidium.fi';
  const imageUrl = `${baseUrl}/api/og/earned?amount=${tokenAmount}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function EarnedSharePage({ params }: PageProps) {
  const { amount } = await params;

  // validate amount
  if (Number.isNaN(Number(amount))) {
    redirect('/stake');
  }

  // redirect to main staking page
  redirect('/stake');
}
