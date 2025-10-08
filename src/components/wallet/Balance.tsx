'use client';

import Big from 'big.js';

import { useBalance } from '@/hooks/api/useBalance';
import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';

type BigValue = InstanceType<typeof Big>;

interface BalanceProps {
  className?: string;
  tokenId: string;
  address: string;
  decimals: number;
  adjustment?: BigValue | number;
}

export const Balance = ({ tokenId, address, className, decimals, adjustment }: BalanceProps) => {
  const { data, isLoading, isFetching, error } = useBalance(address, tokenId, decimals);

  if (isLoading)
    return (
      <span
        className={cn(
          'h-[1em] w-[8ch] animate-pulse rounded-md bg-gray-500 text-gray-500',
          className,
        )}
      >
        Loading
      </span>
    );
  if (error) return <span className={cn(className, 'text-red-500')}>Error</span>;

  const zero = new Big(0);
  const adjustmentBig =
    adjustment === undefined
      ? zero
      : adjustment instanceof Big
        ? adjustment
        : new Big(adjustment.toString());
  const adjustedValue =
    typeof data === 'number'
      ? (() => {
          const candidate = new Big(data.toString()).minus(adjustmentBig);
          return candidate.gt(zero) ? candidate : zero;
        })()
      : undefined;

  return (
    <span
      className={cn(
        className,
        isFetching ? 'animate-pulse rounded-md' : 'opacity-100 transition-opacity',
      )}
    >
      {adjustedValue ? formatCurrency(adjustedValue.toString(), decimals) : '-'}
    </span>
  );
};
