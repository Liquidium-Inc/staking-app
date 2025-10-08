export const formatCurrency = (
  amount: number | string,
  decimals = 2,
  significant?: number,
): string => {
  const parsedAmount = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(parsedAmount)) return '';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    maximumSignificantDigits: significant,
  }).format(parsedAmount);
};

formatCurrency.inverse = (value: string, decimals = 2): number => {
  const num = parseFloat(value.replace(/,/g, ''));
  return Math.floor(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
};
