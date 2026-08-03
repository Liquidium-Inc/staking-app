import { z } from 'zod';

export const TransactionErrorCode = {
  MixedRuneUtxo: 'mixed_rune_utxo',
  WalletIdentityMismatch: 'wallet_identity_mismatch',
} as const;

export const TransactionStage = {
  PrepareStake: 'prepare_stake',
  SignStake: 'sign_stake',
  ConfirmStake: 'confirm_stake',
  PrepareUnstake: 'prepare_unstake',
  SignUnstake: 'sign_unstake',
  ConfirmUnstake: 'confirm_unstake',
  PrepareWithdrawal: 'prepare_withdrawal',
  SignWithdrawal: 'sign_withdrawal',
  ConfirmWithdrawal: 'confirm_withdrawal',
} as const;

export const UNKNOWN_WALLET_PROVIDER = 'unknown';

export const mixedRuneUtxoErrorResponseSchema = z.object({
  error: z.string(),
  error_code: z.literal(TransactionErrorCode.MixedRuneUtxo),
});

export const MIXED_RUNE_UTXO_ERROR_MESSAGE =
  'Your Rune balance is stored together with another Rune in the same Bitcoin UTXO. Liquidium cannot use mixed-Rune UTXOs. Separate the Runes in your wallet and try again.';

export const WALLET_IDENTITY_MISMATCH_ERROR_MESSAGE =
  'Fee payer must be controlled by the authenticated wallet';
