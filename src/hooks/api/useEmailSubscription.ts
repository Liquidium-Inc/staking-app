import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';

// Helper function to handle API errors
const handleApiError = (error: unknown, defaultMessage: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast.error((error as any)?.response?.data?.error || defaultMessage);
};

export const useEmailSubscription = (address: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['emailStatus', address],
    queryFn: async () => {
      if (!address) return null;
      const { data } = await axios.get('/api/email/status', {
        params: { address },
      });
      return data.data;
    },
    enabled: !!address,
  });

  const subscribeMutation = useMutation({
    mutationFn: async ({ email, agreeToTerms }: { email: string; agreeToTerms: boolean }) => {
      if (!address) {
        throw new Error('Wallet address is required to subscribe');
      }
      const { data } = await axios.post('/api/email/subscribe', {
        address,
        email,
        agreeToTerms,
      });
      return data;
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['emailStatus', address] });
        toast.success(`Verification email sent to ${variables.email}`);
      } else {
        toast.error(data.error || 'Failed to subscribe');
      }
    },
    onError: (error) => handleApiError(error, 'Failed to subscribe'),
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      if (!address) {
        throw new Error('Wallet address is required to unsubscribe');
      }
      const { data } = await axios.post('/api/email/unsubscribe', {
        address,
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        queryClient.invalidateQueries({ queryKey: ['emailStatus', address] });
      } else {
        toast.error(data.error || 'Failed to unsubscribe');
      }
    },
    onError: (error) => handleApiError(error, 'Failed to unsubscribe'),
  });

  return {
    status,
    statusLoading,
    subscribe: subscribeMutation.mutate,
    unsubscribe: unsubscribeMutation.mutate,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
  };
};
