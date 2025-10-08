'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Chip } from '@/components/ui/chip';
import { config } from '@/config/public';
import { usePendingStakes } from '@/hooks/api/usePendingStakes';
import { usePendingUnstakes } from '@/hooks/api/usePendingUnstakes';
import { formatCurrency } from '@/lib/formatCurrency';

type PendingItem =
  | { kind: 'stake'; txid: string; amount: number }
  | { kind: 'unstake'; txid: string; amount: number }
  | { kind: 'withdraw'; txid: string; amount: number };

const UI = {
  MINIMIZED_HEIGHT: 32,
  FULL_HEIGHT: 53,
  AUTO_COLLAPSE_MS: 5000,
} as const;

export function PendingToasts() {
  const { address } = useLaserEyes();
  const { data: stakes } = usePendingStakes(address);
  const { data: unstakes } = usePendingUnstakes(address);

  const [isMinimized, setIsMinimized] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const autoCollapseRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const items: PendingItem[] = useMemo(() => {
    const a: PendingItem[] = (stakes || []).map((s) => ({
      kind: 'stake',
      txid: s.txid,
      amount: s.amount,
    }));
    const b: PendingItem[] = (unstakes || []).flatMap((u): PendingItem[] => {
      const confirmations = (u as { confirmations?: number }).confirmations ?? 0;
      const claimedConfirmations =
        (u as { claimedConfirmations?: number }).claimedConfirmations ?? 0;
      const hasClaim = !!(u as { claimTx?: { txid?: string } }).claimTx;

      // Unstake phase (before claim): keep until 2 confirmations
      if (!hasClaim) {
        return confirmations < 2
          ? [{ kind: 'unstake', txid: u.txid, amount: u.sAmount } satisfies PendingItem]
          : [];
      }

      // Withdraw/claim phase: keep until 1 confirmation
      const claimTxid = (u as { claimTx?: { txid?: string } }).claimTx?.txid || u.txid;
      return claimedConfirmations < 1
        ? ([{ kind: 'withdraw', txid: claimTxid, amount: u.sAmount }] as PendingItem[])
        : ([] as PendingItem[]);
    });
    return [...a, ...b];
  }, [stakes, unstakes]);

  const totalCount = items.length;
  // Collapse when clicking outside the component
  useEffect(() => {
    if (isMinimized) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const root = containerRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (target && !root.contains(target)) setIsMinimized(true);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [isMinimized]);

  useEffect(() => {
    if (!totalCount) {
      setIsMinimized(true);
      return;
    }
    // Reset minimized when new items appear (show pill)
    setIsMinimized(true);
  }, [totalCount]);

  useEffect(() => {
    if (!isMinimized && totalCount && !isHovering) {
      if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
      autoCollapseRef.current = setTimeout(() => setIsMinimized(true), UI.AUTO_COLLAPSE_MS);
    } else if (autoCollapseRef.current) {
      clearTimeout(autoCollapseRef.current);
      autoCollapseRef.current = null;
    }
    return () => {
      if (autoCollapseRef.current) clearTimeout(autoCollapseRef.current);
    };
  }, [isMinimized, totalCount, isHovering]);

  if (!totalCount) return null;

  return (
    <div className="pointer-events-none fixed top-2 left-1/2 z-[100] -translate-x-1/2">
      <div ref={containerRef} className="pointer-events-auto relative flex flex-col items-center">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="bg-card inline-flex cursor-pointer items-center justify-center rounded-full border border-white/10 py-1 pr-4 pl-4 transition-all duration-300"
          style={{
            maxHeight: UI.MINIMIZED_HEIGHT,
            opacity: isMinimized ? 1 : 0,
            transform: isMinimized ? 'scale(1)' : 'scale(0.98)',
          }}
        >
          <div className="mr-1 h-2 w-2 animate-pulse rounded-full bg-orange-500" />
          <span className="text-xs font-medium">{totalCount}</span>
        </button>

        <div
          className="mt-2 flex flex-col items-stretch gap-2"
          style={{
            opacity: isMinimized ? 0 : 1,
            transform: isMinimized ? 'translateY(-6px) scale(0.98)' : 'translateY(0) scale(1)',
            transition: 'opacity 250ms ease, transform 250ms ease',
            pointerEvents: isMinimized ? 'none' : 'auto',
            position: isMinimized ? ('absolute' as const) : ('relative' as const),
            top: isMinimized ? '100%' : undefined,
          }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {items.map((x, idx) => {
            const isStake = x.kind === 'stake';
            const label =
              x.kind === 'stake'
                ? 'Pending stake'
                : x.kind === 'unstake'
                  ? 'Pending unstake'
                  : 'Pending withdraw';
            const amountText = formatCurrency(
              Number(x.amount),
              isStake ? config.rune.decimals : config.sRune.decimals,
            );
            return (
              <div
                key={x.txid}
                className="bg-card relative flex max-h-[53px] w-[300px] items-center rounded-4xl border border-white/10 pl-4"
                style={{
                  height: UI.FULL_HEIGHT,
                  opacity: isMinimized ? 0 : 1,
                  transform: isMinimized ? 'translateY(-6px)' : 'translateY(0)',
                  transition: `opacity 300ms ${150 + idx * 30}ms, transform 300ms ${150 + idx * 30}ms`,
                }}
              >
                <div className="flex items-center space-x-2">
                  <Link
                    href={`${config.mempool.url}/tx/${x.txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 hover:underline"
                  >
                    <span className="text-[13px] leading-[1.45] font-medium md:text-sm">
                      {label}
                    </span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </div>
                <Chip
                  className="absolute right-2 flex items-center font-bold after:-my-4"
                  size="sm"
                >
                  <span className="pr-1 pl-1">{amountText}</span>
                  {isStake ? (
                    <Image src="/liquidium.svg" alt="LIQ token" width={24} height={24} />
                  ) : (
                    <span
                      className="ml-1 inline-flex items-center justify-center rounded-full bg-white"
                      style={{ width: 24, height: 24 }}
                    >
                      <Image
                        src={config.sRune.symbol}
                        alt="sLiquidium token"
                        width={16}
                        height={16}
                      />
                    </span>
                  )}
                </Chip>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
