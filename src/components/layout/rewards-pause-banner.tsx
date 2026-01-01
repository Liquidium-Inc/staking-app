'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const PAUSE_END_DATE = new Date('2026-01-11T00:00:00Z');

export function RewardsPauseBanner() {
  const [expanded, setExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(() => Date.now() < PAUSE_END_DATE.getTime());

  const toggleExpanded = () => setExpanded((prev) => !prev);

  const formattedEndDate = useMemo(
    () => PAUSE_END_DATE.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
    [],
  );

  useEffect(() => {
    if (!isVisible) return;

    const remainingMs = PAUSE_END_DATE.getTime() - Date.now();
    if (remainingMs <= 0) {
      setIsVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setIsVisible(false), remainingMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="flex w-full justify-center px-2 py-3">
      <div className="w-full max-w-7xl rounded-2xl border border-amber-400/30 bg-amber-950/60 px-4 py-3 text-amber-50 shadow-md">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm leading-relaxed font-semibold md:text-base">
            Rewards are paused until {formattedEndDate} because of a technical issue.
          </div>
          <button
            type="button"
            onClick={toggleExpanded}
            className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-amber-500/20 px-3 py-1 text-sm font-medium text-amber-50 transition hover:bg-amber-500/30 focus:ring-2 focus:ring-amber-300/50 focus:outline-none"
            aria-expanded={expanded}
          >
            Read more{' '}
            {expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        {expanded && (
          <div className="mt-3 text-sm leading-relaxed text-amber-50/90">
            From December 14 to December 30, a technical issue led us to buy back about twice the
            expected daily amount. As a result, current stakers have effectively received the
            rewards projected through January 11 while we correct the issue, so staking rewards will
            remain paused until then. Thank you for your understanding while we finalize the fix.
          </div>
        )}
      </div>
    </div>
  );
}
