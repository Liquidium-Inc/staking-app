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
import { GENERATING_TRANSACTION_TOAST } from '@/lib/toastMessages';
import { TransactionStage } from '@/lib/transaction-errors';
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
      let stage: (typeof TransactionStage)[keyof typeof TransactionStage] =
        TransactionStage.PrepareUnstake;
      try {
        toast.loading(GENERATING_TRANSACTION_TOAST.title, {
          id: toastId,
          description: GENERATING_TRANSACTION_TOAST.description,
        });
        const psbtResponse = await axios.post<ApiOutput<typeof PSBT_HANDLER>>('/api/unstake', {
          feeRate: 'feeRate' in window ? window.feeRate : selectedRate,
          sender: { address, public: publicKey },
          payer: { address: paymentAddress, public: paymentPublicKey },
          amount: amount.toString(),
          sAmount: stakedAmount.toString(),
        });

        stage = TransactionStage.SignUnstake;
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

        stage = TransactionStage.ConfirmUnstake;
        toast.loading('Sending transaction...', { id: toastId, description: '' });
        const sendResponse = await axios.post<ApiOutput<typeof SEND_HANDLER>>(
          '/api/unstake/confirm',
          { psbt: signedPsbt.signedPsbtBase64 },
        );
        toast.success('Unstaked request sent successfully', { id: toastId, description: '' });
        capture('unstake_request_succeeded', {
          amount: amount.toString(),
          stakedAmount: stakedAmount.toString(),
        });
        return sendResponse.data;
      } catch (error) {
        const responseData = axios.isAxiosError<{
          error?: string;
          error_code?: string;
          code?: string;
        }>(error)
          ? error.response?.data
          : undefined;
        const responseError =
          responseData && typeof responseData.error === 'string' ? responseData.error : undefined;
        const responseErrorCode =
          responseData && typeof responseData.error_code === 'string'
            ? responseData.error_code
            : responseData && typeof responseData.code === 'string'
              ? responseData.code
              : undefined;
        const fallbackResponseError =
          axios.isAxiosError(error) && error.response?.data != null
            ? String(error.response.data)
            : undefined;
        const errorMessage =
          responseError ??
          fallbackResponseError ??
          (error instanceof Error ? error.message : 'Cannot unstake');
        capture('unstake_request_failed', {
          amount: amount.toString(),
          stakedAmount: stakedAmount.toString(),
          error: errorMessage,
          error_message: errorMessage,
          error_code: responseErrorCode,
          stage,
        });
        showErrorToast(errorMessage, { id: toastId, description: '' });
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
