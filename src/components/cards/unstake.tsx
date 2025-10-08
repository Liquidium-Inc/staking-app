import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import updateLocale from 'dayjs/plugin/updateLocale';
import { ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { config } from '@/config/public';
import { usePendingUnstakes } from '@/hooks/api/usePendingUnstakes';
import { useProtocol } from '@/hooks/api/useProtocol';
import { useWithdrawMutation } from '@/hooks/api/useWithdrawMutation';
import { formatCurrency } from '@/lib/formatCurrency';

// Type guard to safely extract block_time from status object
function hasBlockTime(obj: unknown): obj is { block_time: number } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'block_time' in (obj as Record<string, unknown>) &&
    typeof (obj as Record<string, unknown>).block_time === 'number'
  );
}

import { ProgressDate } from '../date/progress-date';
import { Button } from '../ui/button';
import { CardContent } from '../ui/card';
import { Card, CardHeader } from '../ui/card';
import { Chip } from '../ui/chip';
import { Progress } from '../ui/progress';
import { TokenLogo } from '../ui/token';

dayjs.extend(relativeTime);
dayjs.extend(updateLocale);

interface UnstakeCardProps {
  pending: NonNullable<ReturnType<typeof usePendingUnstakes>['data']>[number];
  protocol: ReturnType<typeof useProtocol>['data'];
  withdraw: ReturnType<typeof useWithdrawMutation>;
}

const mempoolUrl = config.mempool.url;
const withdrawTime = config.protocol.withdrawTime;

export function UnstakeCard({ pending, protocol, withdraw }: UnstakeCardProps) {
  const {
    mutate: triggerWithdraw,
    isPending: isWithdrawPending,
    variables: withdrawVariables,
  } = withdraw;
  const isMountedRef = useRef(true);
  const [isLocallyProcessing, setIsLocallyProcessing] = useState(false);
  const isProcessingWithdraw =
    isLocallyProcessing || (isWithdrawPending && withdrawVariables?.txid === pending.txid);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const { capture } = useAnalytics();

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const data = useMemo(() => {
    const blockTime = hasBlockTime(pending.status) ? pending.status.block_time : undefined;

    const data = {
      title: 'Pending',
      subtitle: '',
      chipLabel: '',
      txid: pending.txid as string | undefined,
      decimals: protocol.rune.decimals,
      logo: protocol.rune.symbol,
      amount: Number(pending.amount),
      start: blockTime ? new Date(blockTime * 1000) : undefined,
      end: blockTime ? new Date(blockTime * 1000 + withdrawTime * 1000) : undefined,
      canWithdraw: false,
      progress: undefined as number | undefined,
    };

    if (pending.confirmations < pending.expectedConfirmations) {
      data.title = 'Pending';
      data.chipLabel = `Confirmations: ${pending.confirmations} of ${pending.expectedConfirmations}`;
      data.progress = (+pending.confirmations * 100) / +pending.expectedConfirmations;
    } else if (data.end && new Date() < data.end) {
      data.title = 'Cooldown';
      data.subtitle = timeLeft;
      data.chipLabel = `Completes on ${dayjs(data.end).format('MMMM D, YYYY')}`;
    } else if (!pending.claimTx) {
      data.title = 'Completed';
      data.chipLabel = 'Withdraw now';
      data.canWithdraw = true;
    } else {
      data.title = 'Withdrawing';
      data.chipLabel = `Confirmations: ${pending.claimedConfirmations} of ${pending.expectedConfirmations}`;
      data.txid = pending.claimTx?.txid || '';
      data.canWithdraw = false;
      data.progress = (+pending.claimedConfirmations * 100) / +pending.expectedConfirmations;
    }

    return data;
  }, [pending, protocol, timeLeft]);

  const endTime = data.end?.valueOf();

  // Update time display with appropriate intervals and clear timer on unmount
  useEffect(() => {
    if (!endTime) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const now = dayjs();
      const end = dayjs(endTime);
      const diff = end.diff(now, 'second');

      if (diff <= 0) {
        setTimeLeft('Completed');
        return;
      }

      let updateInterval = 3600;
      if (diff < 86400) updateInterval = 60;
      if (diff < 3600) updateInterval = 1;

      setTimeLeft(end.fromNow());

      timeoutId = setTimeout(tick, updateInterval * 1000);
    };

    tick();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [endTime]);

  return (
    <Card className="my-2">
      <CardHeader className="flex w-full justify-between">
        {data.txid && data.title !== 'Cooldown' && data.title !== 'Completed' ? (
          <Link
            href={`${mempoolUrl}/tx/${data.txid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 text-sm hover:underline"
            onClick={() => {
              capture(
                'unstake_transaction_link_clicked',
                {
                  txid: data.txid,
                  mempool_url: `${mempoolUrl}/tx/${data.txid}`,
                },
                { send_instantly: true, transport: 'sendBeacon' },
              );
            }}
          >
            <span>{data.title}</span>
            <ExternalLink className="w-3" />
          </Link>
        ) : (
          <span className="flex items-center space-x-1 text-sm">
            <span>{data.title}</span>
          </span>
        )}
        {data.subtitle && <span className="opacity-40">{data.subtitle}</span>}
      </CardHeader>
      <CardContent className="flex flex-col space-y-2 px-2">
        {data.progress === undefined && data.start && data.end ? (
          <ProgressDate begin={data.start} end={data.end} />
        ) : (
          <Progress value={data.progress ?? 0} max={100} />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <Chip className="flex items-center space-x-1.5" size="sm">
              <TokenLogo
                className="-ml-1"
                logo={protocol.staked.symbol}
                variant="secondary"
                size={24}
              />
              <span>{formatCurrency(pending.sAmount, protocol.staked.decimals)} </span>
            </Chip>
            <Chip className="flex space-x-0.5 py-0" size="sm">
              ➞
            </Chip>
            <Chip className="flex items-center space-x-1.5" variant="success" size="sm">
              <TokenLogo className="-ml-1" logo={data.logo} size={24} />
              <span>{formatCurrency(data.amount, data.decimals)} </span>
            </Chip>
          </div>
          <Chip
            className="flex items-center space-x-1.5 self-center whitespace-nowrap"
            variant="disabled"
            size="sm"
          >
            {data.chipLabel}
          </Chip>
        </div>
        {data.canWithdraw && (
          <Button
            variant="secondary"
            className="w-full gap-2"
            disabled={isProcessingWithdraw}
            aria-busy={isProcessingWithdraw}
            onClick={() => {
              if (isProcessingWithdraw) return;
              capture('unstake_withdraw_clicked', {
                txid: pending.txid,
                amount: pending.amount,
                sAmount: pending.sAmount,
                rune_symbol: protocol.rune.symbol,
                staked_symbol: protocol.staked.symbol,
              });
              setIsLocallyProcessing(true);
              triggerWithdraw(
                { txid: pending.txid },
                {
                  onSettled: () => {
                    if (!isMountedRef.current) return;
                    setIsLocallyProcessing(false);
                  },
                },
              );
            }}
          >
            {isProcessingWithdraw ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Awaiting signature...</span>
              </>
            ) : (
              'Withdraw'
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
