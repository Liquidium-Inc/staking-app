'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Effective date of the updated Terms of Use and Privacy Policy (e.g. "1 November 2026").
// The banner is hidden while this is empty.
export const TERMS_UPDATE_EFFECTIVE_DATE = '23 November 2026';

const STORAGE_KEY = `liquidium_terms_update_accepted:${TERMS_UPDATE_EFFECTIVE_DATE}`;

export function TermsUpdateBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!TERMS_UPDATE_EFFECTIVE_DATE) return;
    try {
      setIsVisible(!localStorage.getItem(STORAGE_KEY));
    } catch {
      setIsVisible(true);
    }
  }, []);

  if (!isVisible) return null;

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Storage is blocked: the notice just comes back on the next visit.
    }
    setIsVisible(false);
  };

  return (
    <div className="flex w-full justify-center px-2 py-3">
      <div className="flex w-full max-w-7xl flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-neutral-200 shadow-md md:flex-row md:items-center md:justify-between">
        <p>
          <strong className="text-white">Updated Terms and Privacy Policy.</strong> Liquidium Inc.
          (Panama) took over the Cayman foundation&apos;s rights, obligations and data-controller
          role for stake.liquidium.org on 30 October 2026. Revised Terms and Privacy Policy take
          effect on {TERMS_UPDATE_EFFECTIVE_DATE}; until then the previous versions apply with
          Liquidium Inc. as successor. Governing law and the arbitration seat move to Panama when
          the revised Terms take effect.{' '}
          <Link href="/terms" className="font-medium text-white underline underline-offset-4">
            Terms of Use
          </Link>
          {' · '}
          <Link href="/privacy" className="font-medium text-white underline underline-offset-4">
            Privacy Policy
          </Link>
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-full bg-white px-4 py-1.5 font-medium text-black transition hover:bg-neutral-200 focus:ring-2 focus:ring-white/30 focus:outline-none"
        >
          Agree
        </button>
      </div>
    </div>
  );
}
