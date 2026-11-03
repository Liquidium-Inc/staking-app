import type { Metadata } from 'next';
import Link from 'next/link';

import TermsDoc from './content.mdx';

export const metadata: Metadata = {
  title: 'Previous Terms of Use | Liquidium Staking',
  description: 'Previous Terms of Use, in force until 23 November 2026.',
  robots: { index: false },
};

export default function PreviousTermsDocPage() {
  return (
    <section className="legal mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
      <p className="mb-8 text-sm">
        This is the previous version, in force until 23 November 2026, with Liquidium Inc. in place
        of the Cayman foundation since 30 October 2026. See the current{' '}
        <Link href="/terms" className="underline">
          Terms of Use
        </Link>
        .
      </p>
      <article>
        <TermsDoc />
      </article>
    </section>
  );
}
