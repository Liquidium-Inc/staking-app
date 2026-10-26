import { z } from 'zod';

export const TransactionErrorCode = {
  MixedRuneUtxo: 'mixed_rune_utxo',
  WalletIdentityMismatch: 'wallet_identity_mismatch',
  SignatureExpired: 'signature_expired',
  AlreadySubmitted: 'already_submitted',
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

export const INSUFFICIENT_WITHDRAWAL_FEE_BALANCE_ERROR_MESSAGE =
  'Not enough BTC for the network fee. Add BTC to your Bitcoin payment address, then try withdrawing again.';

export const SIGNATURE_EXPIRED_ERROR_MESSAGE =
  'This transaction request has expired. Please start again to create a new transaction.';

export const ALREADY_SUBMITTED_ERROR_MESSAGE =
  'This transaction was already submitted. Check your pending transactions before trying again.';

export const alreadySubmittedErrorResponseSchema = z.object({
  error: z.literal(ALREADY_SUBMITTED_ERROR_MESSAGE),
  error_code: z.literal(TransactionErrorCode.AlreadySubmitted),
});

/** Error codes whose message already tells the user what to do, so no generic retry hint. */
export const NO_RETRY_HINT_ERROR_CODES: readonly string[] = [
  TransactionErrorCode.SignatureExpired,
  TransactionErrorCode.AlreadySubmitted,
];

export const signatureExpiredErrorResponseSchema = z.object({
  error: z.literal(SIGNATURE_EXPIRED_ERROR_MESSAGE),
  error_code: z.literal(TransactionErrorCode.SignatureExpired),
});

export const PROTOCOL_FEE_PAYER_ERROR_MESSAGE = 'Protocol wallets cannot pay transaction fees';

export const protocolFeePayerErrorResponseSchema = z.object({
  error: z.literal(PROTOCOL_FEE_PAYER_ERROR_MESSAGE),
});
