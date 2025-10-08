import type { Metadata } from 'next';

import PrivacyDoc from './content.mdx';

export const metadata: Metadata = {
  title: 'Privacy Policy | Liquidium Staking',
  description: 'Official Privacy Policy (markdown) provided by counsel.',
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <section className="legal mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
      <article>
        <PrivacyDoc />
      </article>
    </section>
  );
}
