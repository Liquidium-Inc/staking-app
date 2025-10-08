/* eslint-disable @typescript-eslint/no-explicit-any */
import { TextEncoder, TextDecoder } from 'util';

import '@testing-library/jest-dom';
import { vi } from 'vitest';

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

// Mock fetch for tests
if (typeof (globalThis as any).vi !== 'undefined') {
  (globalThis as any).fetch = (globalThis as any).vi.fn();
}

// Mock LiquidiumAPI globally with defaults that don't conflict with individual test mocks
vi.mock('@/providers/liquidium-api', () => ({
  LiquidiumAPI: vi.fn().mockImplementation(() => ({
    runeOutputs: vi.fn().mockResolvedValue({ data: [], block_height: 100 }),
    paymentOutputs: vi.fn().mockResolvedValue({ data: [], block_height: 100 }),
    runeBalance: vi.fn().mockResolvedValue({ data: [], block_height: 100 }),
  })),
  liquidiumApi: {
    runeOutputs: vi.fn().mockResolvedValue({ data: [], block_height: 100 }),
    paymentOutputs: vi.fn().mockResolvedValue({ data: [], block_height: 100 }),
    runeBalance: vi.fn().mockResolvedValue({ data: [], block_height: 100 }),
  },
}));
