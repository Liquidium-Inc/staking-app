import Big from 'big.js';
import { useEffect, useState } from 'react';

import { formatCurrency } from '@/lib/formatCurrency';

export const useSwapValues = (
  exchangeRate = 1,
  decimalsSource = 2,
  decimalsTarget = decimalsSource,
) => {
  const safeExchangeRate =
    exchangeRate === Number.POSITIVE_INFINITY || exchangeRate === 0 ? 1 : exchangeRate;
  const [sourceAmount, setSourceAmount] = useState<Big>();
  const [targetAmount, setTargetAmount] = useState<Big>();

  const [sourceTrailing, setSourceTrailing] = useState('');
  const [targetTrailing, setTargetTrailing] = useState('');

  const sourceOnChange = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setSourceAmount(undefined);
      setTargetAmount(undefined);
      return;
    }
    const trailing = event.target.value.match(/^[0-9,]*(\.0*)?$/)?.[1] || '';
    setSourceTrailing(trailing.substring(0, decimalsSource));
    let value: Big;
    try {
      const clean = event.target.value.replace(/,/g, '');
      value = new Big(clean).times(new Big(10).pow(decimalsSource));
    } catch {
      return;
    }
    const sourceRounded = value.round(0, 0);
    setSourceAmount(sourceRounded);
    const rate = new Big(String(safeExchangeRate));
    // Use the rounded source amount to compute target to avoid
    // using fractional precision beyond allowed decimals.
    setTargetAmount(sourceRounded.div(rate));
  };

  const targetOnChange = (event: { target: { value: string } }) => {
    if (event.target.value === '') {
      setSourceAmount(undefined);
      setTargetAmount(undefined);
      return;
    }
    const trailing = event.target.value.match(/^[0-9,]*(\.0*)?$/)?.[1] || '';
    setTargetTrailing(trailing.substring(0, decimalsTarget));
    let value: Big;
    try {
      const clean = event.target.value.replace(/,/g, '');
      value = new Big(clean).times(new Big(10).pow(decimalsTarget)).round(0, 0);
    } catch {
      return;
    }
    const rate = new Big(String(safeExchangeRate));
    setSourceAmount(value.times(rate).round(0, 3));
    setTargetAmount(value);
  };

  useEffect(() => {
    if (sourceAmount) {
      const rate = new Big(String(safeExchangeRate));
      setTargetAmount(sourceAmount.div(rate).round(0, 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangeRate]);

  const sourceFactor = new Big(10).pow(decimalsSource);
  const targetFactor = new Big(10).pow(decimalsTarget);

  const trimmedSource = (sourceAmount ?? new Big(0)).round(0, 0);
  const trimmedTarget = (targetAmount ?? new Big(0)).round(0, 0);

  const sourceFraction = sourceAmount ? sourceAmount.div(sourceFactor) : undefined;
  const targetFraction = targetAmount ? targetAmount.div(targetFactor) : undefined;

  const trimmedSourceFraction = trimmedSource.div(sourceFactor);
  const trimmedTargetFraction = trimmedTarget.div(targetFactor);

  const reset = () => {
    setSourceAmount(undefined);
    setTargetAmount(undefined);
    setSourceTrailing('');
    setTargetTrailing('');
  };

  return {
    source: {
      amount: trimmedSource,
      fraction: sourceFraction ? sourceFraction.toNumber() : 0,
      label:
        sourceFraction !== undefined
          ? `${formatCurrency(trimmedSourceFraction.toString(), decimalsSource)}${sourceTrailing}`
          : '',
      onChange: sourceOnChange,
    },
    target: {
      amount: trimmedTarget,
      fraction: targetFraction ? targetFraction.toNumber() : 0,
      label:
        targetFraction !== undefined
          ? `${formatCurrency(trimmedTargetFraction.toString(), decimalsTarget)}${targetTrailing}`
          : '',
      onChange: targetOnChange,
    },
    reset,
  };
};
