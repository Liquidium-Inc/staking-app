import type { Metadata } from 'next';

import PrivacyDoc from './content.mdx';

export const metadata: Metadata = {
  title: 'Previous Privacy Policy | Liquidium Staking',
  description: 'Previous Privacy Policy, in force until 23 November 2026.',
  robots: { index: false },
};

export default function PreviousPrivacyDocPage() {
  return (
    <section className="legal mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
      <article>
        <PrivacyDoc />
      </article>
    </section>
  );
}
