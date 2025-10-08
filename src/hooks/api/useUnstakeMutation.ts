import { useLaserEyes } from '@omnisat/lasereyes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type Big from 'big.js';
import { toast } from 'sonner';

import type { POST as SEND_HANDLER } from '@/app/api/unstake/confirm/route';
import type { POST as PSBT_HANDLER } from '@/app/api/unstake/route';
import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { useFeeSelection } from '@/components/ui/fee-selector';
import { showErrorToast } from '@/lib/normalizeErrorMessage';
import type { ApiOutput } from '@/utils/api-output';

export const useUnstakeMutation = () => {
  const context = useLaserEyes();
  const queryClient = useQueryClient();
  const { selectedRate } = useFeeSelection();
  const { capture } = useAnalytics();

  const { address, paymentAddress, signPsbt, publicKey, paymentPublicKey } = context;

  const mutation = useMutation({
    mutationFn: async ({
      amount,
      stakedAmount,
    }: {
      amount: Big | string | number;
      stakedAmount: Big | string | number;
    }) => {
      const toastId = toast.loading('Unstaking...');
      try {
        toast.loading('Generating Transaction...', { id: toastId });
        const psbtResponse = await axios.post<ApiOutput<typeof PSBT_HANDLER>>('/api/unstake', {
          feeRate: 'feeRate' in window ? window.feeRate : selectedRate,
          sender: { address, public: publicKey },
          payer: { address: paymentAddress, public: paymentPublicKey },
          amount: amount.toString(),
          sAmount: stakedAmount.toString(),
        });

        toast.loading('Waiting for signature...', { id: toastId });
        const signedPsbt = await signPsbt({
          tx: psbtResponse.data.psbt,
          finalize: false,
          broadcast: false,
          inputsToSign: psbtResponse.data.toSign,
        });
        if (!signedPsbt?.signedPsbtBase64) {
          throw new Error('Failed to sign PSBT');
        }

        toast.loading('Sending transaction...', { id: toastId });
        const sendResponse = await axios.post<ApiOutput<typeof SEND_HANDLER>>(
          '/api/unstake/confirm',
          { psbt: signedPsbt.signedPsbtBase64 },
        );
        toast.success('Unstaked request sent successfully', { id: toastId });
        capture('unstake_request_succeeded', {
          amount: amount.toString(),
          stakedAmount: stakedAmount.toString(),
        });
        return sendResponse.data;
      } catch (error) {
        capture('unstake_request_failed', {
          amount: amount.toString(),
          stakedAmount: stakedAmount.toString(),
          error: error instanceof Error ? error.message : JSON.stringify(error),
        });
        if (axios.isAxiosError(error)) {
          if (typeof error.response?.data.error === 'string') {
            const errorMessage = error.response.data.error;
            showErrorToast(errorMessage, { id: toastId });
            // Propagate error so React Query marks the mutation as failed
            throw new Error(errorMessage);
          }
          const errorMessage = error.response?.data + '';
          showErrorToast(errorMessage, { id: toastId });
          throw new Error(errorMessage);
        }
        const errorMessage = error instanceof Error ? error.message : 'Cannot unstake';
        showErrorToast(errorMessage, { id: toastId });
        throw new Error(errorMessage);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol'] });
      queryClient.invalidateQueries({ queryKey: ['pending-unstakes', address] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['balance', address] });
      }, 500);
    },
  });

  return mutation;
};
