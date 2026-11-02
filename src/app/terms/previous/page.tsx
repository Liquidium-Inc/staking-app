import type { Metadata } from 'next';

import TermsDoc from './content.mdx';

export const metadata: Metadata = {
  title: 'Previous Terms of Use | Liquidium Staking',
  description: 'Previous Terms of Use, in force until 23 November 2026.',
  robots: { index: false },
};

export default function PreviousTermsDocPage() {
  return (
    <section className="legal mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
      <article>
        <TermsDoc />
      </article>
    </section>
  );
}
