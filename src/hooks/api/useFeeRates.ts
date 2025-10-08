import { useQuery } from '@tanstack/react-query';

export interface FeeRates {
  slow: number;
  medium: number;
  fast: number;
}

export function useFeeRates() {
  return useQuery({
    queryKey: ['fee-rates'],
    queryFn: async (): Promise<FeeRates> => {
      const response = await fetch('/api/fee-rates');
      if (!response.ok) {
        throw new Error(`Failed to fetch fee rates: ${response.status}`);
      }
      const data = await response.json();

      // Validate response structure
      if (
        !data ||
        typeof data.slow !== 'number' ||
        typeof data.medium !== 'number' ||
        typeof data.fast !== 'number'
      ) {
        throw new Error('Invalid fee rates response structure');
      }

      return data;
    },
    staleTime: 60_000, // 1 minute
    refetchInterval: 60_000, // Refetch every minute
    retry: 3, // Retry failed requests 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    refetchOnWindowFocus: false, // Don't refetch on window focus for fee rates
  });
}
