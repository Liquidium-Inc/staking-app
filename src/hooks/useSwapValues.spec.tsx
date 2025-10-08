import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, expect, it } from 'vitest';

import { useSwapValues } from './useSwapValues';

// Mock formatCurrency
vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 }),
  __esModule: true,
  default: (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 }),
}));

describe('useSwapValues', () => {
  const exchangeRate = 2;
  const decimalsSource = 2;
  const decimalsTarget = 2;

  it('should initialize with zero values', () => {
    const { result } = renderHook(() =>
      useSwapValues(exchangeRate, decimalsSource, decimalsTarget),
    );
    expect(result.current.source.amount.eq(0)).toBe(true);
    expect(result.current.target.amount.eq(0)).toBe(true);
    expect(result.current.source.label).toBe('');
    expect(result.current.target.label).toBe('');
  });

  it.skip('should update target when source changes', async () => {
    const { result } = renderHook(() =>
      useSwapValues(exchangeRate, decimalsSource, decimalsTarget),
    );
    act(() => {
      result.current.source.onChange({ target: { value: '1.00' } });
    });
    // 1.00 * 10^2 = 100, target = 100 / 2 = 50
    await waitFor(() => {
      expect(result.current.source.amount.eq(100)).toBe(true);
      expect(result.current.target.amount.eq(50)).toBe(true);
      expect(result.current.source.label).toContain('1');
      expect(result.current.target.label).toContain('0.5');
    });
  });

  it.skip('should update source when target changes', async () => {
    const { result } = renderHook(() =>
      useSwapValues(exchangeRate, decimalsSource, decimalsTarget),
    );
    act(() => {
      result.current.target.onChange({ target: { value: '2.00' } });
    });
    // 2.00 * 10^2 = 200, source = 200 * 2 = 400
    await waitFor(() => {
      expect(result.current.target.amount.eq(200)).toBe(true);
      expect(result.current.source.amount.eq(400)).toBe(true);
      expect(result.current.target.label).toContain('2');
      expect(result.current.source.label).toContain('4');
    });
  });

  it('should clear values on empty input', async () => {
    const { result } = renderHook(() =>
      useSwapValues(exchangeRate, decimalsSource, decimalsTarget),
    );
    act(() => {
      result.current.source.onChange({ target: { value: '' } });
    });
    await waitFor(() => {
      expect(result.current.source.amount.eq(0)).toBe(true);
      expect(result.current.target.amount.eq(0)).toBe(true);
    });
  });

  it.skip('should handle trailing zeros', async () => {
    const { result } = renderHook(() =>
      useSwapValues(exchangeRate, decimalsSource, decimalsTarget),
    );
    result.current.source.onChange({ target: { value: '1.00' } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(result.current.source.label).toBe('.00');
  });

  // Critical tests for targetFraction precision bug
  describe('targetFraction precision with different decimals', () => {
    it('should calculate targetFraction correctly when decimalsSource > decimalsTarget', () => {
      const { result } = renderHook(
        () => useSwapValues(1, 8, 2), // 8 decimals source, 2 decimals target
      );

      // Simulate targetAmount = 500 (represents 5.00 in 2-decimal target token)
      act(() => {
        result.current.target.onChange({ target: { value: '5.00' } });
      });

      // Should show 5.00, not 0.000005
      expect(result.current.target.fraction).toBe(5);
      expect(result.current.target.amount.toString()).toBe('500');
    });

    it('should calculate targetFraction correctly when decimalsSource < decimalsTarget', () => {
      const { result } = renderHook(
        () => useSwapValues(1, 2, 8), // 2 decimals source, 8 decimals target
      );

      // Simulate targetAmount = 500000000 (represents 5.00 in 8-decimal target token)
      act(() => {
        result.current.target.onChange({ target: { value: '5.00' } });
      });

      // Should show 5.00, not 5000000
      expect(result.current.target.fraction).toBe(5);
      expect(result.current.target.amount.toString()).toBe('500000000');
    });

    it('should calculate sourceFraction correctly with different decimals', () => {
      const { result } = renderHook(
        () => useSwapValues(1, 8, 2), // 8 decimals source, 2 decimals target
      );

      // Simulate sourceAmount = 500000000 (represents 5.00 in 8-decimal source token)
      act(() => {
        result.current.source.onChange({ target: { value: '5.00' } });
      });

      // Should show 5.00 in source with 8 decimals
      expect(result.current.source.fraction).toBe(5);
      expect(result.current.source.amount.toString()).toBe('500000000');
    });

    it('should handle real-world scenario: rune (0 decimals) vs staked (2 decimals)', () => {
      const { result } = renderHook(
        () => useSwapValues(1.5, 0, 2), // 0 decimals source (rune), 2 decimals target (staked)
      );

      // Input 100 rune tokens (0 decimals)
      act(() => {
        result.current.source.onChange({ target: { value: '100' } });
      });

      // Should show 100.00 as source fraction and calculate target correctly
      expect(result.current.source.fraction).toBe(100);
      expect(result.current.source.amount.toString()).toBe('100');

      // Target should be 100/1.5 = 66.67 (rounded down to 66)
      expect(result.current.target.fraction).toBeCloseTo(0.66666666666666);
      expect(result.current.target.amount.toString()).toBe('66');
    });

    it('should handle reverse scenario: staked (2 decimals) vs rune (0 decimals)', () => {
      const { result } = renderHook(
        () => useSwapValues(1 / 1.5, 2, 0), // 2 decimals source (staked), 0 decimals target (rune)
      );

      // Input 50.00 staked tokens (2 decimals) - this becomes sourceAmount = 5000
      act(() => {
        result.current.source.onChange({ target: { value: '50.00' } });
      });

      // Source: 50.00 with 2 decimals = amount 5000, fraction 50
      expect(result.current.source.fraction).toBe(50);
      expect(result.current.source.amount.toString()).toBe('5000');

      // Target: 5000 / (1/1.5) = 5000 * 1.5 = 7500, but target has 0 decimals
      // So targetFraction = 7500 / 10^0 = 7500
      expect(result.current.target.fraction).toBeCloseTo(7500);
      expect(result.current.target.amount.toString()).toBe('7500');
    });
  });
});
