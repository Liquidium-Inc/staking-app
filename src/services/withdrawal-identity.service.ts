import type * as bitcoin from 'bitcoinjs-lib';

import { findPublicKeyForAddress } from '@/lib/address';

export const WalletKeyPairing = {
  Direct: 'direct',
  Swapped: 'swapped',
  Unmatched: 'unmatched',
} as const;
export type WalletKeyPairing = (typeof WalletKeyPairing)[keyof typeof WalletKeyPairing];

export interface WalletKeyPairingResult {
  senderKey?: string;
  payerKey?: string;
  pairing: WalletKeyPairing;
}

/**
 * Matches the sender/payer public keys to the addresses they own.
 *
 * LaserEyes' Xverse provider assigns the two account pubkeys by array index,
 * so some wallets (Xverse mobile) report them swapped. Both accounts belong
 * to the same authenticated wallet, so the swapped pairing is accepted when
 * each key owns the other address. The returned keys are always the matched,
 * PSBT-usable forms.
 */
export function resolveWalletKeyPairing(
  sender: { public: string; address: string },
  payer: { public: string; address: string },
  network: bitcoin.Network,
): WalletKeyPairingResult {
  const senderKey = findPublicKeyForAddress(sender.public, sender.address, network);
  const payerKey = findPublicKeyForAddress(payer.public, payer.address, network);

  if (senderKey && payerKey) {
    return { senderKey, payerKey, pairing: WalletKeyPairing.Direct };
  }

  const swappedSenderKey = findPublicKeyForAddress(payer.public, sender.address, network);
  const swappedPayerKey = findPublicKeyForAddress(sender.public, payer.address, network);
  if (swappedSenderKey && swappedPayerKey) {
    return {
      senderKey: swappedSenderKey,
      payerKey: swappedPayerKey,
      pairing: WalletKeyPairing.Swapped,
    };
  }

  return { pairing: WalletKeyPairing.Unmatched };
}
