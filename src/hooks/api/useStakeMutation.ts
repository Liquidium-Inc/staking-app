import { useLaserEyes } from '@omnisat/lasereyes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Big from 'big.js';
import { toast } from 'sonner';

import type { POST as SEND_HANDLER } from '@/app/api/stake/confirm/route';
import type { POST as PSBT_HANDLER } from '@/app/api/stake/route';
import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { useFeeSelection } from '@/components/ui/fee-selector';
import { showErrorToast } from '@/lib/normalizeErrorMessage';
import { GENERATING_TRANSACTION_TOAST } from '@/lib/toastMessages';
import type { ApiOutput } from '@/utils/api-output';

export const useStakeMutation = () => {
  const queryClient = useQueryClient();
  const { selectedRate } = useFeeSelection();
  const { capture } = useAnalytics();

  const { address, paymentAddress, signPsbt, publicKey, paymentPublicKey } = useLaserEyes();

  const mutation = useMutation({
    mutationFn: async ({
      amount,
      stakedAmount,
    }: {
      amount: Big | string | number;
      stakedAmount: Big | string | number;
    }) => {
      const toastId = toast.loading('Staking...');
      const finalFeeRate = 'feeRate' in window ? window.feeRate : selectedRate;
      try {
        toast.loading(GENERATING_TRANSACTION_TOAST.title, {
          id: toastId,
          description: GENERATING_TRANSACTION_TOAST.description,
        });

        const psbtResponse = await axios.post<ApiOutput<typeof PSBT_HANDLER>>('/api/stake', {
          feeRate: finalFeeRate,
          sender: { address, public: publicKey },
          payer: { address: paymentAddress, public: paymentPublicKey },
          amount: amount.toString(),
          sAmount: new Big(stakedAmount.toString()).round(0, 0).toFixed(0),
        });

        toast.loading('Waiting for signature...', { id: toastId, description: '' });
        const signedPsbt = await signPsbt({
          tx: psbtResponse.data.psbt,
          finalize: false,
          broadcast: false,
          inputsToSign: psbtResponse.data.toSign,
        });
        if (!signedPsbt?.signedPsbtBase64) {
          throw new Error('Failed to sign PSBT');
        }

        toast.loading('Sending transaction...', { id: toastId, description: '' });
        const response = await axios.post<ApiOutput<typeof SEND_HANDLER>>('/api/stake/confirm', {
          psbt: signedPsbt.signedPsbtBase64,
        });
        toast.success('Staked successfully', { id: toastId, description: '' });
        capture('stake_successful', {
          amount: amount.toString(),
          stakedAmount: stakedAmount.toString(),
          feeRate: finalFeeRate,
        });
        return response.data;
      } catch (error) {
        let errorMessage: string;
        if (axios.isAxiosError(error)) {
          if (typeof error.response?.data.error === 'string') {
            errorMessage = error.response.data.error;
          } else {
            errorMessage = error.response?.data + '';
          }
        } else {
          errorMessage = error instanceof Error ? error.message : 'Cannot stake';
        }

        capture('stake_failed', {
          amount: amount.toString(),
          stakedAmount: stakedAmount.toString(),
          feeRate: finalFeeRate,
          error_message: errorMessage,
        });

        showErrorToast(errorMessage, { id: toastId, description: '' });
        // Propagate error so React Query marks the mutation as failed
        throw new Error(errorMessage);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol'] });
      queryClient.invalidateQueries({ queryKey: ['pending-stakes', address] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['balance', address] });
      }, 500);
    },
  });

  return mutation;
};
