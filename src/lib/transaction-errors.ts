export const TransactionErrorCode = {
  MixedRuneUtxo: 'mixed_rune_utxo',
  WalletIdentityMismatch: 'wallet_identity_mismatch',
} as const;

export const MIXED_RUNE_UTXO_ERROR_MESSAGE =
  'Your Rune balance is stored together with another Rune in the same Bitcoin UTXO. Liquidium cannot use mixed-Rune UTXOs. Separate the Runes in your wallet and try again.';

export const WALLET_IDENTITY_MISMATCH_ERROR_MESSAGE =
  'Fee payer must be controlled by the authenticated wallet';
