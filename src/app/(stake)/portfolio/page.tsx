'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import Big from 'big.js';
import { Info } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Area, AreaChart, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import { ResponsiveContainer } from 'recharts';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { ShareButton } from '@/components/share/share-button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TokenLogo } from '@/components/ui/token';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBalance } from '@/hooks/api/useBalance';
import { useProtocol } from '@/hooks/api/useProtocol';
import { useWalletActivity } from '@/hooks/api/useWalletActivity';
import {
  computeEarnings,
  createEmptyEarningsResult,
  isInsufficientEarningsSlotsError,
} from '@/lib/earnings';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatPercentage } from '@/lib/formatPercentage';
import { cn } from '@/lib/utils';

const PORTFOLIO_VALUE_PLACEHOLDER = 'Unavailable';
const EXCHANGE_RATE_UNAVAILABLE_MESSAGE =
  'Portfolio values are temporarily unavailable because no exchange rate has been published yet.';

/**
 * Converts earnings calculation failures into a user-safe portfolio message.
 */
function getPortfolioEarningsErrorMessage(error: unknown): string {
  if (isInsufficientEarningsSlotsError(error)) {
    return 'Earnings are temporarily unavailable because your staking history could not be fully reconstructed.';
  }

  return 'Earnings are temporarily unavailable right now.';
}

export default function PortfolioPage() {
  const { address, isInitializing, isConnecting } = useLaserEyes((state) => ({
    address: state.address,
    isInitializing: state.isInitializing,
    isConnecting: state.isConnecting,
  }));
  const normalizedAddress = address?.trim() ?? '';
  const hasAddress = Boolean(normalizedAddress);
  const isWalletLoading = isInitializing || isConnecting;

  const protocolQuery = useProtocol();
  const { data: protocol } = protocolQuery;
  const { btc, rune, staked, apy, historicRates, exchangeRate } = protocol;
  const isProtocolLoading =
    protocolQuery.fetchStatus === 'fetching' && protocolQuery.dataUpdatedAt === 0;

  const activityQuery = useWalletActivity(normalizedAddress);
  const stakedBalanceQuery = useBalance(normalizedAddress, staked.id, staked.decimals);
  const activity = useMemo(() => activityQuery.data ?? [], [activityQuery.data]);
  const stakedBalance = stakedBalanceQuery.data ?? 0;
  const isActivityLoading =
    hasAddress && activityQuery.data === undefined && activityQuery.fetchStatus === 'fetching';
  const isStakedBalanceLoading =
    hasAddress &&
    stakedBalanceQuery.data === undefined &&
    stakedBalanceQuery.fetchStatus === 'fetching';

  const tokenPrice = Big(rune.priceSats ?? 0)
    .times(btc.price)
    .div(100_000_000);
  const dailyYieldBig = Big(apy.daily).times(Big(stakedBalance));
  const resolvedExchangeRate = useMemo<Big | null>(() => {
    try {
      if (Number.isFinite(exchangeRate)) {
        return new Big(exchangeRate);
      }

      if (historicRates && historicRates.length > 0) {
        return new Big(historicRates[historicRates.length - 1]!.rate);
      }
    } catch {
      return null;
    }

    return null;
  }, [exchangeRate, historicRates]);
  const stakedBalanceBig = Big(stakedBalance);
  const hasResolvedExchangeRate = resolvedExchangeRate !== null;
  const liqValue = resolvedExchangeRate ? stakedBalanceBig.times(resolvedExchangeRate) : null;
  const stakedValueUsd = liqValue ? liqValue.times(tokenPrice) : null;
  const isExchangeRateUnavailable = !isProtocolLoading && !hasResolvedExchangeRate;
  const isPositionLoading = isWalletLoading || isStakedBalanceLoading;
  const isEarningsLoading = isPositionLoading || isActivityLoading || isProtocolLoading;
  const isTotalEarnedLoading = isEarningsLoading;
  const isLiqValueLoading = isPositionLoading || isProtocolLoading;
  const isStakedValueLoading = isPositionLoading;
  const isDailyYieldLoading = isPositionLoading || isProtocolLoading;
  const isApyLoading = isProtocolLoading;
  const isPriceLoading = isProtocolLoading;

  const earningsState = useMemo(() => {
    if (isEarningsLoading) {
      return {
        result: createEmptyEarningsResult(),
        error: null,
      };
    }

    if (!resolvedExchangeRate) {
      return {
        result: createEmptyEarningsResult(),
        error: EXCHANGE_RATE_UNAVAILABLE_MESSAGE,
      };
    }

    try {
      const multiplier = {
        input: -1,
        output: 1,
      } satisfies Record<(typeof activity)[number]['event_type'], number>;
      const txs = activity
        .map((tx) => ({
          value: Big(tx.amount).div(Big(10).pow(tx.decimals)).times(multiplier[tx.event_type]),
          block: new Date(tx.timestamp).valueOf(),
        }))
        .reverse();
      const rates = [
        { value: new Big(1), block: 0 },
        ...(historicRates?.map(({ rate, timestamp }) => ({
          value: new Big(rate),
          block: new Date(timestamp).valueOf(),
        })) ?? []),
        { value: resolvedExchangeRate, block: Number.POSITIVE_INFINITY },
      ];

      return {
        result: computeEarnings(txs, rates),
        error: null,
      };
    } catch (error) {
      return {
        result: createEmptyEarningsResult(),
        error: getPortfolioEarningsErrorMessage(error),
      };
    }
  }, [activity, historicRates, isEarningsLoading, resolvedExchangeRate]);
  const earnings = earningsState.result;
  const isTotalEarnedUnavailable =
    !isTotalEarnedLoading && (!hasResolvedExchangeRate || Boolean(earningsState.error));
  const showTotalEarnedError = !isTotalEarnedLoading && Boolean(earningsState.error);

  // Memoize the data transformation
  const exchangeRateData = useMemo(() => {
    if (!historicRates) return [];

    return historicRates
      .map((k) => ({ ...k, timestamp: new Date(k.timestamp).valueOf() }))
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
            {!isTotalEarnedUnavailable && earnings.total.gt(0) && (
              <ShareButton
                decimals={rune.decimals}
                tokenAmount={earnings.total.toString()}
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
            {isTotalEarnedLoading ? (
              <ValueSkeleton className="h-10 w-44" />
            ) : (
              <span className="text-4xl font-semibold">
                {isTotalEarnedUnavailable
                  ? PORTFOLIO_VALUE_PLACEHOLDER
                  : hasResolvedExchangeRate
                    ? formatCurrency(earnings.total.toString(), rune.decimals)
                    : PORTFOLIO_VALUE_PLACEHOLDER}
              </span>
            )}
            {!isTotalEarnedUnavailable && earnings.percentage.gt(0) && (
              <div className="ml-auto rounded-full border-3 border-green-500 bg-green-500/20 px-2 py-1 text-xs text-green-500">
                +{formatCurrency(earnings.percentage.toString())}%
              </div>
            )}
          </CardContent>
          {isTotalEarnedLoading ? (
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              <ValueSkeleton className="h-3.5 w-32" />
            </div>
          ) : !isTotalEarnedUnavailable ? (
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              {`$${formatCurrency(earnings.total.times(tokenPrice).toString())} USD`}
            </div>
          ) : !earningsState.error ? (
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              {EXCHANGE_RATE_UNAVAILABLE_MESSAGE}
            </div>
          ) : null}
          {showTotalEarnedError && (
            <div className="px-2 text-xs font-medium text-amber-600">{earningsState.error}</div>
          )}
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
              {isLiqValueLoading ? (
                <ValueSkeleton className="h-6 w-28" />
              ) : (
                <span className="text-xl font-semibold">
                  {liqValue
                    ? formatCurrency(liqValue.toString(), rune.decimals)
                    : PORTFOLIO_VALUE_PLACEHOLDER}
                </span>
              )}
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              {isLiqValueLoading ? (
                <ValueSkeleton className="h-3.5 w-24" />
              ) : stakedValueUsd ? (
                `$${formatCurrency(stakedValueUsd.toString())} USD`
              ) : (
                EXCHANGE_RATE_UNAVAILABLE_MESSAGE
              )}
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
              {isStakedValueLoading ? (
                <ValueSkeleton className="h-6 w-24" />
              ) : (
                <span className="text-xl font-semibold">
                  {formatCurrency(stakedBalance, staked.decimals)}
                </span>
              )}
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              {isLiqValueLoading ? (
                <ValueSkeleton className="h-3.5 w-24" />
              ) : stakedValueUsd ? (
                `$${formatCurrency(stakedValueUsd.toString())} USD`
              ) : (
                EXCHANGE_RATE_UNAVAILABLE_MESSAGE
              )}
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
              {isDailyYieldLoading ? (
                <ValueSkeleton className="h-6 w-24" />
              ) : (
                <span className="text-xl font-semibold">
                  {formatCurrency(dailyYieldBig.toString(), rune.decimals)}
                </span>
              )}
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              {isDailyYieldLoading ? (
                <ValueSkeleton className="h-3.5 w-24" />
              ) : (
                `$${formatCurrency(dailyYieldBig.times(tokenPrice).toString())} USD`
              )}
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
              {isApyLoading ? (
                <ValueSkeleton className="h-6 w-16" />
              ) : (
                <span className="text-xl font-semibold">{formatPercentage(apy.yearly * 100)}%</span>
              )}
            </CardContent>
            <div className="flex justify-between px-2 text-xs font-semibold opacity-50">
              {isApyLoading ? (
                <ValueSkeleton className="h-3.5 w-24" />
              ) : (
                `${formatPercentage(apy.monthly * 100)}% per month`
              )}
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
              {isPriceLoading ? (
                <ValueSkeleton className="h-6 w-20" />
              ) : isExchangeRateUnavailable ? (
                <span className="text-xl font-semibold">{PORTFOLIO_VALUE_PLACEHOLDER}</span>
              ) : (
                <span className="text-xl font-semibold">{resolvedExchangeRate?.toFixed(5)}</span>
              )}
            </div>
            {isPriceLoading ? (
              <div className="space-y-2 pt-3">
                <ValueSkeleton className="h-16 w-full" />
                <ValueSkeleton className="h-3.5 w-40" />
              </div>
            ) : isExchangeRateUnavailable ? (
              <div className="pt-3 text-xs font-medium text-amber-600">
                {EXCHANGE_RATE_UNAVAILABLE_MESSAGE}
              </div>
            ) : (
              <div className="h-16 w-full">{chart}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

/**
 * Shared portfolio skeleton block used for loading values and supporting copy.
 */
const ValueSkeleton = ({ className }: { className: string }) => (
  <Skeleton className={cn('rounded-md bg-white/12 ring-1 ring-white/8', className)} />
);

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
