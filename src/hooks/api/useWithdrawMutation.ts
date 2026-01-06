import { useLaserEyes } from '@omnisat/lasereyes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';

import type { POST as SEND_HANDLER } from '@/app/api/withdraw/confirm/route';
import type { POST as PSBT_HANDLER } from '@/app/api/withdraw/route';
import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { useFeeSelection } from '@/components/ui/fee-selector';
import { anonymizeAddress } from '@/lib/anonymizeAddress';
import { showErrorToast } from '@/lib/normalizeErrorMessage';
import { GENERATING_TRANSACTION_TOAST } from '@/lib/toastMessages';
import type { ApiOutput } from '@/utils/api-output';

export const useWithdrawMutation = () => {
  const context = useLaserEyes();
  const queryClient = useQueryClient();
  const { selectedRate } = useFeeSelection();
  const { capture } = useAnalytics();

  const { address, paymentAddress, signPsbt, publicKey, paymentPublicKey } = context;

  const mutation = useMutation({
    mutationFn: async ({ txid }: { txid: string }) => {
      const toastId = toast.loading('Withdrawing...');
      const maskedAddress = anonymizeAddress(address);
      try {
        const runtimeOverride =
          typeof window !== 'undefined'
            ? (window as unknown as { feeRate?: number | string }).feeRate
            : undefined;
        const parsedOverride =
          typeof runtimeOverride === 'number'
            ? runtimeOverride
            : typeof runtimeOverride === 'string'
              ? Number.parseFloat(runtimeOverride)
              : NaN;
        const feeRate = Number.isFinite(parsedOverride) ? parsedOverride : selectedRate;
        capture('withdrawal_initiated', {
          txid,
          ...(maskedAddress ? { address: maskedAddress } : {}),
          feeRate,
        });

        toast.loading(GENERATING_TRANSACTION_TOAST.title, {
          id: toastId,
          description: GENERATING_TRANSACTION_TOAST.description,
        });
        const psbtResponse = await axios.post<ApiOutput<typeof PSBT_HANDLER>>('/api/withdraw', {
          feeRate: feeRate,
          sender: { address, public: publicKey },
          payer: { address: paymentAddress, public: paymentPublicKey },
          txid,
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
        const sendResponse = await axios.post<ApiOutput<typeof SEND_HANDLER>>(
          '/api/withdraw/confirm',
          { psbt: signedPsbt.signedPsbtBase64, sender: address },
        );
        toast.success('Withdraw request sent successfully', { id: toastId, description: '' });
        capture('withdrawal_succeeded', {
          txid,
          ...(maskedAddress ? { address: maskedAddress } : {}),
        });
        return sendResponse.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (typeof error.response?.data.error === 'string') {
            const errorMessage = error.response.data.error;
            showErrorToast(errorMessage, { id: toastId, description: '' });
            capture('withdrawal_failed', {
              txid,
              ...(maskedAddress ? { address: maskedAddress } : {}),
              error_message: errorMessage,
            });
            // Propagate error so React Query marks the mutation as failed
            throw new Error(errorMessage);
          }
          const errorMessage = error.response?.data + '';
          showErrorToast(errorMessage, { id: toastId, description: '' });
          capture('withdrawal_failed', {
            txid,
            ...(maskedAddress ? { address: maskedAddress } : {}),
            error_message: errorMessage,
          });
          throw new Error(errorMessage);
        }
        const errorMessage = error instanceof Error ? error.message : 'Cannot withdraw';
        showErrorToast(errorMessage, { id: toastId, description: '' });
        capture('withdrawal_failed', {
          txid,
          ...(maskedAddress ? { address: maskedAddress } : {}),
          error_message: errorMessage,
        });
        throw new Error(errorMessage);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-unstakes', address] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['balance', address] });
      }, 500);
    },
  });

  return mutation;
};
