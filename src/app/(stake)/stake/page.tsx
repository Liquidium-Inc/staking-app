'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import { LightningBoltIcon } from '@radix-ui/react-icons';
import Big from 'big.js';
import { AlertCircle, ArrowDownUp, Coins, ExternalLink, PercentCircleIcon } from 'lucide-react';
import Link from 'next/link';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FeeProvider, FeeSelector } from '@/components/ui/fee-selector';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { TokenLogo } from '@/components/ui/token';
import { Balance } from '@/components/wallet/Balance';
import { config } from '@/config/public';
import { useBalance } from '@/hooks/api/useBalance';
import { usePendingStakes } from '@/hooks/api/usePendingStakes';
import { usePendingUnstakes } from '@/hooks/api/usePendingUnstakes';
import { useProtocol } from '@/hooks/api/useProtocol';
import { useStakeMutation } from '@/hooks/api/useStakeMutation';
import { useSwapValues } from '@/hooks/useSwapValues';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatPercentage } from '@/lib/formatPercentage';

type BigValue = InstanceType<typeof Big>;

export default function StakePage() {
  const { connected, address } = useLaserEyes();

  const { data: protocol } = useProtocol();
  const { rune, staked, exchangeRate, apy, btc } = protocol;

  const { data: balance = 0 } = useBalance(address, rune.id, rune.decimals);
  const { data: sBalance = 0 } = useBalance(address, staked.id, staked.decimals);
  const { data: pendingStakes } = usePendingStakes(address);
  const { data: pendingUnstakes } = usePendingUnstakes(address);

  // Calculate total pending stake amount to exclude from available balance
  // Only exclude unconfirmed transactions (0 confirmations) since confirmed ones should already be reflected in balance
  const zero = new Big(0);
  const unconfirmedPendingStakes = (pendingStakes ?? []).filter(
    (pending) => pending.confirmations === 0,
  );
  const totalPendingStakeAmount = unconfirmedPendingStakes.reduce(
    (total, pending) => total.plus(pending.amount.toString()),
    zero,
  );
  const balanceBig = new Big(balance.toString());
  const availableBalanceCandidate = balanceBig.minus(totalPendingStakeAmount);
  const availableBalanceBig = availableBalanceCandidate.gt(zero) ? availableBalanceCandidate : zero;
  const availableBalance = Number(availableBalanceBig.toFixed(rune.decimals ?? 0));
  const totalPendingUnstakeAmount = (pendingUnstakes ?? [])
    .filter((pending) => pending.confirmations === 0)
    .reduce((total, pending) => total.plus(pending.sAmount.toString()), zero);

  const { source, target, reset } = useSwapValues(exchangeRate, rune.decimals, staked.decimals);

  const tokenPrice = Big(rune.priceSats ?? 0)
    .times(btc.price)
    .div(100_000_000)
    .toNumber();

  const isExchangeRateLoaded = exchangeRate !== Number.POSITIVE_INFINITY;
  // Use Big.js scaled integer comparison to avoid floating point precision issues
  const sourceDecimals = rune.decimals ?? 0;
  const sourceScale = new Big(10).pow(sourceDecimals);
  const availableScaled = new Big(availableBalance).times(sourceScale).round(0, 0);
  const sourceAmount = source.amount ?? new Big(0);
  const targetAmount = target.amount ?? new Big(0);
  const isValidAmount =
    sourceAmount.gt(0) && sourceAmount.lte(availableScaled) && targetAmount.gt(0);
  const isInsufficientBalance = sourceAmount.gt(availableScaled) && sourceAmount.gt(0);

  return (
    <FeeProvider>
      <StakeContent
        source={source}
        target={target}
        resetSwapValues={reset}
        balance={balance}
        availableBalance={availableBalance}
        sBalance={sBalance}
        pendingUnstakeAdjustment={totalPendingUnstakeAmount}
        tokenPrice={tokenPrice}
        isExchangeRateLoaded={isExchangeRateLoaded}
        isValidAmount={isValidAmount}
        isInsufficientBalance={isInsufficientBalance}
        pendingStakes={pendingStakes || []}
        connected={connected}
        address={address}
        rune={rune}
        staked={staked}
        apy={apy}
        exchangeRate={exchangeRate}
      />
    </FeeProvider>
  );
}

function StakeContent({
  source,
  target,
  resetSwapValues,
  balance: _balance,
  availableBalance,
  sBalance,
  pendingUnstakeAdjustment,
  tokenPrice,
  isExchangeRateLoaded,
  isValidAmount,
  isInsufficientBalance,
  pendingStakes,
  connected,
  address,
  rune,
  staked,
  apy,
  exchangeRate,
}: {
  source: ReturnType<typeof useSwapValues>['source'];
  target: ReturnType<typeof useSwapValues>['target'];
  resetSwapValues: ReturnType<typeof useSwapValues>['reset'];
  balance: number;
  availableBalance: number;
  sBalance: number;
  pendingUnstakeAdjustment: BigValue;
  tokenPrice: number;
  isExchangeRateLoaded: boolean;
  isValidAmount: boolean;
  isInsufficientBalance: boolean;
  pendingStakes: NonNullable<ReturnType<typeof usePendingStakes>['data']>;
  connected: boolean;
  address: string;
  rune: NonNullable<ReturnType<typeof useProtocol>['data']>['rune'];
  staked: NonNullable<ReturnType<typeof useProtocol>['data']>['staked'];
  apy: NonNullable<ReturnType<typeof useProtocol>['data']>['apy'];
  exchangeRate: number;
}) {
  const { mutate, isPending } = useStakeMutation();
  const { capture } = useAnalytics();

  // Compute display value for available balance without FP errors
  const displayDecimals = rune.decimals ?? 0;
  const displayScale = new Big(10).pow(displayDecimals);
  const availableDisplay = new Big(availableBalance)
    .times(displayScale)
    .round(0, 0)
    .div(displayScale)
    .toFixed(displayDecimals);

  return (
    <div className="flex w-auto max-w-md flex-col space-y-3">
      <Card>
        <CardHeader>You Stake</CardHeader>
        <CardContent className="flex items-center justify-between space-x-3">
          <Input
            placeholder="0"
            className="flex w-full border-0 px-2 text-2xl font-semibold shadow-none focus-visible:ring-0"
            autoFocus
            value={source.label}
            onChange={(e) => source.onChange(e)}
            disabled={!isExchangeRateLoaded}
          />
          <div className="from-primary-from to-primary-to flex h-9 items-center justify-between space-x-1 rounded-full border border-white/20 bg-gradient-to-b px-3 py-5 text-white select-none">
            <TokenLogo logo={rune.symbol} variant="ghost" padding={0} size={18} />
            <div className="flex flex-col px-1">
              <div className="text-xs leading-tight font-bold">LIQ</div>
              <div className="text-[10px] leading-tight opacity-75">{rune.name}</div>
            </div>
          </div>
        </CardContent>
        <div className="flex justify-between px-2 text-xs opacity-50">
          <span>${formatCurrency(source.fraction * tokenPrice)}</span>
          <span className="flex items-center space-x-1">
            <span>Available:</span>
            <span>{availableDisplay}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 px-1 text-xs opacity-75 hover:opacity-100"
              onClick={() => {
                capture('stake_max_button_clicked', {
                  availableBalance: availableBalance,
                  tokenSymbol: rune.symbol,
                });
                source.onChange({ target: { value: availableDisplay } });
              }}
              disabled={!availableBalance || availableBalance === 0 || !isExchangeRateLoaded}
            >
              Max
            </Button>
          </span>
        </div>
        {isInsufficientBalance && (
          <div className="flex items-center space-x-1 px-2 pt-1 text-xs text-red-500">
            <AlertCircle size={12} />
            <span>Amount exceeds available balance</span>
          </div>
        )}
      </Card>

      <div className="z-10 -my-1.5 h-3 w-full">
        <Link
          href="/unstake"
          aria-label="Navigate to unstake page"
          className="bg-background absolute left-1/2 flex h-12 w-12 -translate-1/2 items-center justify-center rounded-full border-2 border-gray-200/20 text-xl font-bold"
        >
          <ArrowDownUp size={16} aria-hidden="true" />
        </Link>
      </div>

      <Card>
        <CardHeader>You Receive</CardHeader>
        <CardContent className="flex items-center justify-between space-x-3">
          <Input
            placeholder="0"
            className="flex w-full border-0 px-2 text-2xl font-semibold shadow-none focus-visible:ring-0"
            value={target.label}
            onChange={(e) => target.onChange(e)}
            disabled={!isExchangeRateLoaded}
          />
          <div className="from-secondary-from to-secondary-to flex h-9 items-center justify-between space-x-1 rounded-full border border-white/20 bg-gradient-to-b px-3 py-5 text-white select-none">
            <TokenLogo logo={staked.symbol} variant="ghost" padding={0} size={18} />
            <div className="flex flex-col px-1">
              <div className="text-primary-from text-xs leading-tight font-bold">sLIQ</div>
              <div className="text-primary-from text-[10px] leading-tight opacity-80">
                {staked.name}
              </div>
            </div>
          </div>
        </CardContent>
        <div className="flex justify-between px-2 text-xs opacity-50">
          <span>${formatCurrency(target.fraction * exchangeRate * tokenPrice)}</span>
          <span>
            Balance:{' '}
            <Balance
              tokenId={staked.id}
              address={address}
              decimals={staked.decimals}
              adjustment={pendingUnstakeAdjustment}
            />
          </span>
        </div>
      </Card>

      <Button
        type="submit"
        variant="secondary"
        disabled={!isValidAmount || isPending || !connected || !isExchangeRateLoaded}
        onClick={() => {
          capture('stake_submitted', {
            amount: source.fraction,
            stakedAmount: target.fraction,
            sourceTokenSymbol: rune.symbol,
            targetTokenSymbol: staked.symbol,
          });
          mutate(
            { amount: source.amount, stakedAmount: target.amount },
            {
              onSuccess: () => {
                resetSwapValues();
              },
            },
          );
        }}
        className="w-full p-6"
      >
        Stake
      </Button>

      <Card className="flex flex-col space-y-2 border px-3 py-4 text-sm">
        {connected && (
          <div className="flex w-full justify-between">
            <div className="flex items-center space-x-1.5 opacity-80">
              <Coins className="w-4" />
              <span className="font-semibold">Staked Tokens</span>
            </div>
            {isValidAmount ? (
              <div className="flex items-center space-x-1">
                <Chip size="sm" variant="disabled" className="flex space-x-1 pl-2">
                  <span>{formatCurrency(sBalance * exchangeRate, rune.decimals)}</span>
                  <TokenLogo className="-mr-0.5" variant="primary" logo={rune.symbol} size={16} />
                </Chip>
                <Chip size="sm" className="flex space-x-0.5 py-0">
                  ➞
                </Chip>
                <Chip size="sm" variant="success" className="flex space-x-1 pl-2">
                  <span>
                    {formatCurrency((sBalance + target.fraction) * exchangeRate, rune.decimals)}
                  </span>
                  <TokenLogo className="-mr-0.5" variant="primary" logo={rune.symbol} size={16} />
                </Chip>
              </div>
            ) : (
              <div>
                <Chip size="sm" className="flex space-x-1 pl-2">
                  <span>{formatCurrency(sBalance * exchangeRate, rune.decimals)}</span>
                  <TokenLogo className="-mr-0.5" logo={rune.symbol} size={16} />
                </Chip>
              </div>
            )}
          </div>
        )}
        {connected && (
          <div className="flex w-full justify-between">
            <div className="flex items-center space-x-1.5 opacity-80">
              <LightningBoltIcon className="w-4" />
              <span className="font-semibold">Daily Tokens</span>
            </div>
            {isValidAmount ? (
              <div className="flex items-center space-x-1">
                <Chip size="sm" variant="disabled" className="flex space-x-1 pl-2">
                  <span>
                    {formatCurrency(apy.daily * sBalance * exchangeRate, staked.decimals)}
                  </span>
                  <TokenLogo className="-mr-0.5" logo={rune.symbol} size={16} />
                </Chip>
                <Chip size="sm" className="flex space-x-0.5 py-0">
                  ➞
                </Chip>
                <Chip size="sm" variant="success" className="flex space-x-1 pl-2">
                  <span>
                    {formatCurrency(
                      apy.daily * (sBalance + source.fraction) * exchangeRate,
                      rune.decimals,
                    )}
                  </span>
                  <TokenLogo className="-mr-0.5" logo={rune.symbol} size={16} />
                </Chip>
              </div>
            ) : (
              <div>
                <Chip size="sm" className="flex space-x-1 pl-2">
                  <span>{formatCurrency(apy.daily * sBalance * exchangeRate, rune.decimals)}</span>
                  <TokenLogo className="-mr-0.5" logo={rune.symbol} size={16} />
                </Chip>
              </div>
            )}
          </div>
        )}
        <div className="flex w-full justify-between">
          <div className="flex items-center space-x-1.5 opacity-80">
            <PercentCircleIcon className="w-4" />
            <span className="font-semibold">Earn Rate (APY)</span>
          </div>
          <div>
            <Chip size="sm">
              <span>{formatPercentage(apy.yearly * 100)}%</span>
            </Chip>
          </div>
        </div>
        <FeeSelector />
      </Card>
      {pendingStakes?.map((pending) => {
        return (
          <Card className="my-2" key={pending.txid}>
            <CardHeader className="flex w-full justify-between">
              <span className="text-sm">
                <Link
                  href={`${config.mempool.url}/tx/${pending.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 hover:underline"
                >
                  <span>Pending</span>
                  <ExternalLink className="w-3" />
                </Link>
              </span>
            </CardHeader>
            <CardContent className="flex flex-col space-y-2 px-2">
              <Progress
                value={(pending.confirmations / config.protocol.expectedConfirmations) * 100}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Chip className="flex items-center space-x-1.5" size="sm">
                    <TokenLogo className="-ml-1" logo={rune.symbol} variant="primary" size={24} />
                    <span>{formatCurrency(pending.amount, rune.decimals)} </span>
                  </Chip>
                  <Chip className="flex space-x-0.5 py-0" size="sm">
                    ➞
                  </Chip>
                  <Chip className="flex items-center space-x-1.5" variant="success" size="sm">
                    <TokenLogo
                      className="-ml-1"
                      logo={staked.symbol}
                      variant="secondary"
                      size={24}
                    />
                    <span>{formatCurrency(pending.sAmount, staked.decimals)} </span>
                  </Chip>
                </div>
                <Chip
                  className="flex items-center space-x-1.5 self-center whitespace-nowrap"
                  variant="disabled"
                  size="sm"
                >
                  Confirmations: {pending.confirmations} of {config.protocol.expectedConfirmations}
                </Chip>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
