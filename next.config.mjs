import createMDX from '@next/mdx';

const withMDX = createMDX({
  // Support both .mdx and .md if needed, safe with Turbopack
  extension: /\.(md|mdx)$/,
  options: {
    // With Turbopack, plugin names can be strings; we keep none for now
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only generate browser source maps when explicitly enabled (per PostHog docs)
  productionBrowserSourceMaps: process.env.GENERATE_SOURCEMAPS === 'true',
  // Enable MDX pages alongside TS/JS
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  eslint: {
    // Ensure Next looks under the src/ directory for lintable files
    dirs: ['src'],
  },
  experimental: {
    // Enable Rust-based MDX compiler for Turbopack
    mdxRs: true,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/stake',
        permanent: false,
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  // PostHog rewrites
  async rewrites() {
    return [
      {
        source: '/relay-axzt/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/relay-axzt/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
};

export default withMDX(nextConfig);
