import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Coins, ExternalLink, HandCoins, TrendingUp, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency';
import { getRunePrice } from '@/providers/rune-provider';
import Image from 'next/image';

interface PageProps {
  params: {
    amount: string;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { amount } = params;
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

  const tokenAmount = Number(amount);

  return (
    <div className="flex items-center justify-center px-4 pt-12">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="space-y-4 text-center">
          <h1 className="text-4xl font-bold md:text-5xl">Welcome to Liquidium staking</h1>
          <p className="mx-auto max-w-xl text-lg opacity-50">
            Your friend earned {formatCurrency(tokenAmount, 2)} LIQ tokens by staking. You can too!
          </p>
        </div>

        {/* Main Content Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Image src="/logo.svg" alt="Liquidium" width={22} height={22} />
                <h2 className="text-xl font-semibold">What is Liquidium?</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="opacity-50">
                Liquidium is a suite of decentralized lending products built on L1 Bitcoin.
              </p>
              <div className="-mb-3 flex w-full flex-col gap-2">
                <Link
                  href="https://liquidium.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-full border border-neutral-800 px-4 py-2"
                >
                  <p>Cross-chain loans</p>
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <Link
                  href="https://liquidium.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-full border border-neutral-800 px-4 py-2"
                >
                  <p>P2P inscription loans</p>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Image src="/liquidium.svg" alt="Liquidium" width={22} height={22} />
                <h2 className="text-xl font-semibold">LIQ</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="opacity-50">
                LIQ is the native token of the Liquidium ecosystem. Holders can vote on proposals
                and earn yield by staking.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Stake & earn</h2>
              </div>
            </CardHeader>
            <CardContent className="">
              <p className="opacity-50">
                30% of the Liquidium&apos;s protocols&apos; revenue is distributed to LIQ stakers
                through token buybacks.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <HandCoins className="h-5 w-5" />
                <h2 className="text-xl font-semibold">How it works</h2>
              </div>
            </CardHeader>
            <CardContent className="">
              <p className="opacity-50">
                Staking LIQ gives you sLIQ tokens which represent your position. sLIQ automatically
                increases in value relative to LIQ, allowing you to earn yield by holding them.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <ArrowRight className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Get Started</h2>
              </div>
            </CardHeader>
            <CardContent className="">
              <p className="opacity-50">
                Purchase LIQ tokens from a supported marketplace, then stake them to start earning
                yield.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-col justify-center gap-4">
            <Button variant="default" asChild className="rounded-full px-8 py-6 text-base">
              <Link
                href="https://help.liquidium.fi/en/articles/11359560-liq-marketplaces"
                target="_blank"
                rel="noopener noreferrer"
              >
                Buy LIQUIDIUM
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <Button variant="secondary" asChild className="rounded-full px-8 py-6 text-base">
              <Link href="/stake">
                Stake Now
                <TrendingUp className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
