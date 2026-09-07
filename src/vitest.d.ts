import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import 'vitest';

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void>, T> extends TestingLibraryMatchers<T, R> {}
}
