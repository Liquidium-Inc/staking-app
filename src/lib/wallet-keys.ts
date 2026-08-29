import { findPublicKeyForAddress } from '@/lib/address';

interface WalletAccountKeys {
  address?: string | null;
  paymentAddress?: string | null;
  publicKey?: string | null;
  paymentPublicKey?: string | null;
}

/**
 * Matches wallet-reported public keys to the addresses they actually own.
 *
 * LaserEyes' Xverse provider assigns `publicKey`/`paymentPublicKey` by array
 * index instead of by account purpose, so on Xverse mobile the two keys can
 * be swapped relative to `address`/`paymentAddress`. Sending those mismatched
 * keys makes the API reject the transaction with a wallet identity mismatch.
 * Here we re-derive ownership and swap the keys back when needed, falling
 * back to the wallet-reported values when nothing matches.
 */
export function resolveSigningKeys({
  address,
  paymentAddress,
  publicKey,
  paymentPublicKey,
}: WalletAccountKeys): { senderPublicKey: string; payerPublicKey: string } {
  const candidates = [
    ...new Set([publicKey, paymentPublicKey].filter((key): key is string => Boolean(key))),
  ];

  const senderKey = address
    ? candidates.map((key) => findPublicKeyForAddress(key, address)).find(Boolean)
    : undefined;
  const payerKey = paymentAddress
    ? (candidates
        .filter((key) => key !== senderKey)
        .map((key) => findPublicKeyForAddress(key, paymentAddress))
        .find(Boolean) ??
      candidates.map((key) => findPublicKeyForAddress(key, paymentAddress)).find(Boolean))
    : undefined;

  return {
    senderPublicKey: senderKey ?? publicKey ?? '',
    payerPublicKey: payerKey ?? paymentPublicKey ?? '',
  };
}
