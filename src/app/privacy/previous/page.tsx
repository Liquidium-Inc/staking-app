import type { Metadata } from 'next';
import Link from 'next/link';

import PrivacyDoc from './content.mdx';

export const metadata: Metadata = {
  title: 'Previous Privacy Policy | Liquidium Staking',
  description: 'Previous Privacy Policy, in force until 23 November 2026.',
  robots: { index: false },
};

export default function PreviousPrivacyDocPage() {
  return (
    <section className="legal mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
      <p className="mb-8 text-sm">
        This is the previous version, in force until 23 November 2026, with Liquidium Inc. in place
        of the Cayman foundation since 30 October 2026. See the current{' '}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
      <article>
        <PrivacyDoc />
      </article>
    </section>
  );
}
