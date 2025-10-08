'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import { LightningBoltIcon } from '@radix-ui/react-icons';
import Big from 'big.js';
import { AlertCircle, ArrowDownUp, Coins, PercentCircleIcon } from 'lucide-react';
import Link from 'next/link';

import { UnstakeCard } from '@/components/cards/unstake';
import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FeeProvider, FeeSelector } from '@/components/ui/fee-selector';
import { Input } from '@/components/ui/input';
import { TokenLogo } from '@/components/ui/token';
import { Balance } from '@/components/wallet/Balance';
import { config } from '@/config/public';
import { useBalance } from '@/hooks/api/useBalance';
import { usePendingStakes } from '@/hooks/api/usePendingStakes';
import { usePendingUnstakes } from '@/hooks/api/usePendingUnstakes';
import { useProtocol } from '@/hooks/api/useProtocol';
import { useUnstakeMutation } from '@/hooks/api/useUnstakeMutation';
import { useWithdrawMutation } from '@/hooks/api/useWithdrawMutation';
import { useSwapValues } from '@/hooks/useSwapValues';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatPercentage } from '@/lib/formatPercentage';

type BigValue = InstanceType<typeof Big>;

const withdrawCooldownDays = Math.max(1, Math.ceil(config.protocol.withdrawTime / 86400));
const cooldownCopy =
  withdrawCooldownDays === 1
    ? 'Withdrawals unlock after a 24-hour cooldown once your unstake confirms.'
    : `Withdrawals unlock after a ${withdrawCooldownDays}-day cooldown once your unstake confirms.`;

export default function StakePage() {
  const { connected, address } = useLaserEyes();

  const { data: protocol } = useProtocol();
  const { rune, staked, exchangeRate, apy, btc } = protocol;

  const { data: sBalance = 0 } = useBalance(address, staked.id, staked.decimals);
  const { data: pendingStakes } = usePendingStakes(address);
  const { data: pendingUnstakes } = usePendingUnstakes(address);

  // Calculate total pending unstake amount to exclude from available balance
  // Only exclude unconfirmed transactions (0 confirmations) since confirmed ones should already be reflected in balance
  const zero = new Big(0);
  const unconfirmedPendingUnstakes = (pendingUnstakes ?? []).filter(
    (pending) => pending.confirmations === 0,
  );
  const totalPendingUnstakeAmount = unconfirmedPendingUnstakes.reduce(
    (total, pending) => total.plus(pending.sAmount.toString()),
    zero,
  );
  const sBalanceBig = new Big(sBalance.toString());
  const availableBalanceCandidate = sBalanceBig.minus(totalPendingUnstakeAmount);
  const availableBalanceBig = availableBalanceCandidate.gt(zero) ? availableBalanceCandidate : zero;
  const availableBalance = Number(availableBalanceBig.toFixed(staked.decimals ?? 0));
  const totalPendingStakeAmount = (pendingStakes ?? [])
    .filter((pending) => pending.confirmations === 0)
    .reduce((total, pending) => total.plus(pending.amount.toString()), zero);

  // For unstake flow, source is sLIQ and target is LIQ
  const { target, source, reset } = useSwapValues(1 / exchangeRate, staked.decimals, rune.decimals);

  const tokenPrice = Big(rune.priceSats ?? 0)
    .times(btc.price)
    .div(100_000_000)
    .toNumber();

  const isExchangeRateLoaded = exchangeRate !== Number.POSITIVE_INFINITY;
  // Use Big.js for comparisons to avoid floating point precision issues
  const decimals = staked.decimals ?? 0;
  const scale = new Big(10).pow(decimals);
  const availableScaled = new Big(availableBalance).times(scale).round(0, 0);
  const sourceAmount = source.amount ?? new Big(0);
  const targetAmount = target.amount ?? new Big(0);
  const isValidAmount =
    sourceAmount.gt(0) && sourceAmount.lte(availableScaled) && targetAmount.gt(0);
  const isInsufficientBalance = sourceAmount.gt(availableScaled) && sourceAmount.gt(0);

  return (
    <FeeProvider>
      <UnstakeContent
        source={source}
        target={target}
        resetSwapValues={reset}
        sBalance={sBalance}
        availableBalance={availableBalance}
        tokenPrice={tokenPrice}
        isExchangeRateLoaded={isExchangeRateLoaded}
        isValidAmount={isValidAmount}
        isInsufficientBalance={isInsufficientBalance}
        pendingUnstakes={pendingUnstakes || []}
        connected={connected}
        address={address}
        rune={rune}
        staked={staked}
        apy={apy}
        exchangeRate={exchangeRate}
        protocol={protocol}
        pendingStakeAdjustment={totalPendingStakeAmount}
      />
    </FeeProvider>
  );
}

function UnstakeContent({
  source,
  target,
  resetSwapValues,
  sBalance,
  availableBalance,
  tokenPrice,
  isExchangeRateLoaded,
  isValidAmount,
  isInsufficientBalance,
  pendingUnstakes,
  connected,
  address,
  rune,
  staked,
  apy,
  exchangeRate,
  protocol,
  pendingStakeAdjustment,
}: {
  source: ReturnType<typeof useSwapValues>['source'];
  target: ReturnType<typeof useSwapValues>['target'];
  resetSwapValues: ReturnType<typeof useSwapValues>['reset'];
  sBalance: number;
  availableBalance: number;
  tokenPrice: number;
  isExchangeRateLoaded: boolean;
  isValidAmount: boolean;
  isInsufficientBalance: boolean;
  pendingUnstakes: NonNullable<ReturnType<typeof usePendingUnstakes>['data']>;
  connected: boolean;
  address: string;
  rune: NonNullable<ReturnType<typeof useProtocol>['data']>['rune'];
  staked: NonNullable<ReturnType<typeof useProtocol>['data']>['staked'];
  apy: NonNullable<ReturnType<typeof useProtocol>['data']>['apy'];
  exchangeRate: number;
  protocol: NonNullable<ReturnType<typeof useProtocol>['data']>;
  pendingStakeAdjustment: BigValue;
}) {
  const { mutate: unstake, isPending } = useUnstakeMutation();
  const withdrawMutation = useWithdrawMutation();
  const { capture } = useAnalytics();

  // Compute display value for available balance without FP errors
  const displayDecimals = staked.decimals ?? 0;
  const displayScale = new Big(10).pow(displayDecimals);
  const availableDisplay = new Big(availableBalance)
    .times(displayScale)
    .round(0, 0)
    .div(displayScale)
    .toFixed(displayDecimals);

  return (
    <div className="flex w-auto max-w-md flex-col space-y-3">
      <Card>
        <CardHeader>You Unstake</CardHeader>
        <CardContent className="flex items-center justify-between space-x-3">
          <Input
            placeholder="0"
            className="flex w-full border-0 px-2 text-2xl font-semibold shadow-none focus-visible:ring-0"
            autoFocus
            value={source.label}
            onChange={(e) => source.onChange(e)}
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
          <span>${formatCurrency(source.fraction * exchangeRate * tokenPrice)}</span>
          <span className="flex items-center space-x-1">
            <span>Available:</span>
            <span>{availableDisplay}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 px-1 text-xs opacity-75 hover:opacity-100"
              onClick={() => {
                capture('unstake_max_amount_clicked', {
                  available_balance: availableBalance,
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
          href="/stake"
          aria-label="Navigate to stake page"
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
          <div className="from-primary-from to-primary-to flex h-9 items-center justify-between space-x-1 rounded-full border border-white/20 bg-gradient-to-b px-3 py-5 text-white select-none">
            <TokenLogo logo={rune.symbol} variant="ghost" padding={0} size={18} />
            <div className="flex flex-col px-1">
              <div className="text-xs leading-tight font-bold">LIQ</div>
              <div className="text-[10px] leading-tight opacity-75">{rune.name}</div>
            </div>
          </div>
        </CardContent>
        <div className="flex justify-between px-2 text-xs opacity-50">
          <span>${formatCurrency(target.fraction * tokenPrice)}</span>
          <span>
            Balance:{' '}
            <Balance
              tokenId={rune.id}
              address={address}
              decimals={rune.decimals}
              adjustment={pendingStakeAdjustment}
            />
          </span>
        </div>
      </Card>

      <Button
        type="submit"
        variant="secondary"
        disabled={!isValidAmount || isPending || !connected || !isExchangeRateLoaded}
        onClick={() => {
          capture('unstake_submitted', {
            amount: target.amount?.toString(),
            staked_amount: source.amount?.toString(),
            exchange_rate: exchangeRate,
          });
          unstake(
            { amount: target.amount?.toString(), stakedAmount: source.amount?.toString() },
            {
              onSuccess: () => {
                resetSwapValues();
              },
            },
          );
        }}
        className="w-full p-6"
      >
        Unstake
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
                <Chip size="sm" variant="error" className="flex space-x-1 pl-2">
                  <span>
                    {formatCurrency((sBalance - source.fraction) * exchangeRate, rune.decimals)}
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
                  <span>{formatCurrency(apy.daily * sBalance * exchangeRate, rune.decimals)}</span>
                  <TokenLogo className="-mr-0.5" logo={rune.symbol} size={16} />
                </Chip>
                <Chip size="sm" className="flex space-x-0.5 py-0">
                  ➞
                </Chip>
                <Chip size="sm" variant="error" className="flex space-x-1 pl-2">
                  <span>
                    {formatCurrency(
                      apy.daily * (sBalance - target.fraction / exchangeRate),
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
        <div className="flex items-start space-x-2 rounded-full bg-white/5 px-3 py-2 text-xs text-white/80">
          <AlertCircle className="text-primary-from mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{cooldownCopy}</span>
        </div>
      </Card>
      {pendingUnstakes?.map((pending) => {
        return (
          <UnstakeCard
            key={pending.txid}
            pending={pending}
            protocol={protocol}
            withdraw={withdrawMutation}
          />
        );
      })}
    </div>
  );
}
