export const formatPercentage = (value: number | string, decimals = 2): string => {
  const num = typeof value === 'number' ? value : parseFloat(value);

  if (isNaN(num)) return '0';
  if (!Number.isFinite(num)) return '∞';

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  // Handle extremely large numbers (prevent scientific notation display)
  if (absNum >= 1e15) {
    return `${sign}∞`;
  } else if (absNum >= 1e12) {
    return `${sign}999T+`;
  } else if (absNum >= 1_000_000_000) {
    const billions = absNum / 1_000_000_000;
    // Prevent scientific notation in billion range
    if (billions >= 1000) {
      return `${sign}999B+`;
    }
    return `${sign}${billions.toFixed(1)}B`;
  } else if (absNum >= 1_000_000) {
    return `${sign}${(absNum / 1_000_000).toFixed(1)}M`;
  } else if (absNum >= 10_000) {
    return `${sign}${(absNum / 1_000).toFixed(1)}K`;
  } else if (absNum >= 1_000) {
    return `${sign}${absNum.toFixed(0)}`;
  } else {
    return `${sign}${absNum.toFixed(decimals)}`;
  }
};
