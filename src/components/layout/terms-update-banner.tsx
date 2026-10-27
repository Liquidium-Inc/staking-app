'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Effective date of the updated Terms of Use and Privacy Policy (e.g. "1 November 2026").
// The banner is hidden while this is empty. TODO: set before merge.
export const TERMS_UPDATE_EFFECTIVE_DATE = '';

const STORAGE_KEY = `liquidium_terms_update_dismissed:${TERMS_UPDATE_EFFECTIVE_DATE}`;

export function TermsUpdateBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!TERMS_UPDATE_EFFECTIVE_DATE) return;
    setIsVisible(!localStorage.getItem(STORAGE_KEY));
  }, []);

  if (!isVisible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
  };

  return (
    <div className="flex w-full justify-center px-2 py-3">
      <div className="relative w-full max-w-7xl rounded-2xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm leading-relaxed text-neutral-200 shadow-md">
        <strong className="text-white">Updated Terms and Privacy Policy.</strong> From{' '}
        {TERMS_UPDATE_EFFECTIVE_DATE}, stake.liquidium.org is operated by Liquidium Inc. (Panama), a
        subsidiary of Liquidium Foundation (Panama), which replaces Liquidium Foundation (Cayman
        Islands). Governing law and the arbitration seat move to Panama.{' '}
        <Link href="/terms" className="font-medium text-white underline underline-offset-4">
          Terms of Use
        </Link>
        {' · '}
        <Link href="/privacy" className="font-medium text-white underline underline-offset-4">
          Privacy Policy
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notice"
          className="absolute top-3 right-3 rounded-full p-0.5 text-neutral-400 transition hover:text-white focus:ring-2 focus:ring-white/30 focus:outline-none"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
