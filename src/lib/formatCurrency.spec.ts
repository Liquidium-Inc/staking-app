import { describe, it, expect } from 'vitest';

import { formatCurrency } from './formatCurrency';

describe('formatCurrency', () => {
  it('formats a number correctly', () => {
    expect(formatCurrency(1234.56)).toBe('1,234.56');
  });

  it('formats a string number correctly', () => {
    expect(formatCurrency('1234.56')).toBe('1,234.56');
  });

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('0');
  });

  it('formats negative numbers correctly', () => {
    expect(formatCurrency(-1234.56)).toBe('-1,234.56');
  });

  it('returns empty string for non-numeric string', () => {
    expect(formatCurrency('abc')).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(formatCurrency(NaN)).toBe('');
  });

  it('formats integer numbers with two decimals', () => {
    expect(formatCurrency(1000)).toBe('1,000');
  });

  it('formats string integers with two decimals', () => {
    expect(formatCurrency('1000')).toBe('1,000');
  });

  it('formats numbers with more than two decimals', () => {
    expect(formatCurrency(1234.5678)).toBe('1,234.57');
  });

  it('formats string numbers with more than two decimals', () => {
    expect(formatCurrency('1234.5678')).toBe('1,234.57');
  });
});
