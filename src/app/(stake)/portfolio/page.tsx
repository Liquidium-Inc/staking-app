'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import Big from 'big.js';
import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, AreaChart, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import { ResponsiveContainer } from 'recharts';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { ShareButton } from '@/components/share/share-button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TokenLogo } from '@/components/ui/token';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBalance } from '@/hooks/api/useBalance';
import { useProtocol } from '@/hooks/api/useProtocol';
import { useWalletActivity } from '@/hooks/api/useWalletActivity';
import { computeEarnings } from '@/lib/earnings';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatPercentage } from '@/lib/formatPercentage';

export default function PortfolioPage() {
  const { address } = useLaserEyes();
  const { data: protocol } = useProtocol();
  const { btc, rune, staked, apy, historicRates, exchangeRate } = protocol;

  const isExchangeRateLoaded = exchangeRate !== Number.POSITIVE_INFINITY;

  const { data: activity = [] } = useWalletActivity(address);
  const { data: stakedBalance = 0 } = useBalance(address, staked.id, staked.decimals);

  const tokenPrice = Big(rune.priceSats ?? 0)
    .times(btc.price)
    .div(100_000_000)
    .toNumber();

  const dailyYield = apy.daily * stakedBalance;

  const earnings = useMemo(() => {
    const multiplier = {
      input: -1,
      output: 1,
      'new-allocation': 0,
      mint: 0,
      burn: 0,
    } satisfies Record<(typeof activity)[number]['event_type'], number>;
    const txs = activity
      .map((tx) => ({
        value: multiplier[tx.event_type] * Number(tx.amount) * 10 ** -tx.decimals,
        block: tx.block_height,
      }))
      .reverse();
    const latestRate = Number.isFinite(exchangeRate)
      ? exchangeRate
      : historicRates && historicRates.length > 0
        ? Number(historicRates[historicRates.length - 1]!.rate)
        : 1;
    const rates = [
      { value: 1, block: 0 },
      ...(historicRates?.map(({ rate, block }) => ({ value: Number(rate), block })) ?? []),
      { value: latestRate, block: Number.POSITIVE_INFINITY },
    ];

    return computeEarnings(txs, rates);
  }, [activity, exchangeRate, historicRates]);

  // Memoize the data transformation
  const exchangeRateData = useMemo(() => {
    if (!historicRates) return [];

    return historicRates
      .map((k) => ({ ...k, timestamp: k.timestamp.valueOf() }))
      .sort((a, b) => a.block - b.block);
  }, [historicRates]);

  // Memoize the chart to prevent unnecessary re-renders
  const chart = useMemo(
    () => (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart>
          <defs>
            <pattern id="square" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="2" height="2" fill="#D9D9D9" opacity="0.8" />
            </pattern>
            <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            hide
            type="number"
            dataKey="block"
            name="Block Height"
            domain={['dataMin', 'dataMax']}
          />
          <YAxis
            hide
            type="number"
            dataKey="rate"
            name="Exchange Rate"
            domain={['dataMin-0.02', 'dataMax']}
          />
          <Area
            type="monotone"
            stroke="#21DC11"
            dataKey="rate"
            data={exchangeRateData}
            fill="url(#square)"
          />
          <RechartsTooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="rounded-lg border border-white/10 bg-black p-2 text-xs shadow-sm">
                    <div className="flex items-center space-x-2">
                      <TokenLogo logo={rune.symbol} variant="primary" size={16} />
                      <span className="text-sm font-medium">{data.rate.toFixed(3)}</span>
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">Block {data.block}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      Date: {new Date(data.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    ),
    [exchangeRateData, rune.symbol],
  );

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex w-full max-w-md flex-col items-center justify-center space-y-3">
        <Card className="relative w-full space-y-1">
          <div className="absolute top-3 right-11">
            {earnings.total > 0 && (
              <ShareButton
                decimals={rune.decimals}
                tokenAmount={earnings.total}
                tokenSymbol={'LIQ'}
              />
            )}
          </div>
          <CardHeader className="flex">
            <h3>Total Earned</h3>

            <InfoTooltip>
              <span>
                Unrealized LIQ (LIQUIDIUM•TOKEN) earned since holding sLIQ (STAKED•LIQUIDIUM)
              </span>
            </InfoTooltip>
          </CardHeader>
          <CardContent className="flex items-center space-x-2 px-2">
            <TokenLogo logo={rune.symbol} variant="primary" size={40} />
            <span className="text-4xl font-semibold">
              {formatCurrency(earnings.total, rune.decimals)}
            </span>
            {earnings.percentage > 0 && (
              <div className="ml-auto rounded-full border-3 border-green-500 bg-green-500/20 px-2 py-1 text-xs text-green-500">
                +{formatCurrency(earnings.percentage)}%
              </div>
            )}
          </CardContent>
          <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
            ${formatCurrency(earnings.total * tokenPrice)} USD
          </div>
        </Card>

        <div className="grid w-full grid-cols-2 gap-3">
          <Card className="w-full space-y-1">
            <CardHeader className="flex">
              <h3>LIQ</h3>
              <InfoTooltip>
                <span>The worth of your sLIQ (STAKED•LIQUIDIUM) in LIQ (LIQUIDIUM•TOKEN).</span>
              </InfoTooltip>
            </CardHeader>
            <CardContent className="flex items-center space-x-2 px-2">
              <TokenLogo logo={rune.symbol} variant="primary" size={24} />
              <span className="text-xl font-semibold">
                {formatCurrency(stakedBalance * exchangeRate, rune.decimals)}
              </span>
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              ${formatCurrency(stakedBalance * exchangeRate * tokenPrice)} USD
            </div>
          </Card>

          <Card className="w-full space-y-1">
            <CardHeader className="flex">
              <h3>sLIQ</h3>
              <InfoTooltip>
                <span>The amount of sLIQ (STAKED•LIQUIDIUM) in your wallet.</span>
              </InfoTooltip>
            </CardHeader>
            <CardContent className="flex items-center space-x-2 px-2">
              <TokenLogo logo={staked.symbol} variant="secondary" size={24} />
              <span className="text-xl font-semibold">
                {formatCurrency(stakedBalance, staked.decimals)}
              </span>
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              ${formatCurrency(stakedBalance * exchangeRate * tokenPrice)} USD
            </div>
          </Card>

          <Card className="w-full space-y-1">
            <CardHeader className="flex">
              <h3>Daily Yield</h3>
              <InfoTooltip>
                <span>Avg. LIQ (LIQUIDIUM•TOKEN) yield based on last 30 days</span>
              </InfoTooltip>
            </CardHeader>
            <CardContent className="flex items-center space-x-2 px-2">
              <TokenLogo logo={rune.symbol} variant="primary" size={24} />
              <span className="text-xl font-semibold">
                {formatCurrency(dailyYield, rune.decimals)}
              </span>
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              ${formatCurrency(dailyYield * tokenPrice)} USD
            </div>
          </Card>

          <Card className="w-full space-y-1">
            <CardHeader className="flex">
              <h3>APY</h3>
              <InfoTooltip>
                <span>APY based on past 30 days historical performance</span>
              </InfoTooltip>
            </CardHeader>
            <CardContent className="flex items-center space-x-2 px-2">
              <span className="text-xl font-semibold">{formatPercentage(apy.yearly * 100)}%</span>
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              {formatPercentage(apy.monthly * 100)}% per month
            </div>
          </Card>
        </div>

        {/* Chart card */}
        <Card className="w-full space-y-1 pb-2">
          <CardHeader className="flex">
            <h3>Price (sLIQ/LIQ)</h3>
            <InfoTooltip>
              <span>This graph shows the historical exchange rate of sLIQ to LIQ.</span>
            </InfoTooltip>
          </CardHeader>
          <CardContent className="px-2">
            <div className="flex items-center space-x-2">
              <TokenLogo logo={rune.symbol} variant="primary" size={24} />
              <span className="text-xl font-semibold">
                {isExchangeRateLoaded ? exchangeRate.toFixed(5) : ''}
              </span>
            </div>
            <div className="h-16 w-full">{chart}</div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

const InfoTooltip = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const { capture } = useAnalytics();
  return (
    <Tooltip
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) {
          const content =
            (children as React.ReactElement<{ children?: React.ReactNode }>)?.props?.children || '';
          capture('portfolio_info_tooltip_opened', {
            tooltip_content: String(content).trim(),
          });
        }
      }}
    >
      <TooltipTrigger asChild className="ml-auto">
        <button
          type="button"
          onClick={() => setOpen((state) => !state)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen((state) => !state);
            }
          }}
        >
          <Info strokeWidth={1.5} className="opacity-40" size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
};
