import { resolve } from 'path';

import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => {
  return {
    plugins: [],
    test: {
      globals: true,
      coverage: {
        include: ['src/**/*.ts'],
        exclude: ['**/__generated__/**', '**/*.spec.ts', '**/*.test.ts'],
        reporter: ['html', 'text'],
      },
      env: loadEnv('test', process.cwd(), ''),
      setupFiles: [resolve('src/test-setup.ts')],
      alias: {
        '@/': `${resolve('src')}/`,
        '@ui/': `${resolve('src/components/ui')}/`,
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: ['src/**/*.{spec,test}.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            environment: 'jsdom',
            include: ['src/**/*.{spec,test}.tsx'],
          },
        },
      ],
    },
  };
});
