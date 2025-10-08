import type { Metadata } from 'next';

import TermsDoc from './content.mdx';

export const metadata: Metadata = {
  title: 'Terms of Use | Liquidium Staking',
  description: 'Official Terms of Use (markdown) provided by counsel.',
  alternates: {
    canonical: '/terms',
  },
};

export default function TermsPage() {
  return (
    <section className="legal mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
      <article>
        <TermsDoc />
      </article>
    </section>
  );
}
