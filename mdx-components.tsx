import type { MDXComponents } from 'mdx/types';

// Map or extend MDX elements if needed. Keeping default passthrough for simplicity.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
  };
}
