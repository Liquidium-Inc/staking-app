'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { addressesMatch } from '@/lib/address';

type AuthStatus = 'idle' | 'pending' | 'authenticated' | 'error';

type WalletAuthState = {
  status: AuthStatus;
  address?: string;
  expiresAt?: string;
  error?: string | null;
};

type WalletAuthContextValue = WalletAuthState & {
  refresh: () => Promise<void>;
};

const WalletAuthContext = createContext<WalletAuthContextValue | undefined>(undefined);

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (typeof value === 'object' && value !== null && value.constructor?.name === 'Uint8Array')
  );
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer ||
    (typeof value === 'object' && value !== null && value.constructor?.name === 'ArrayBuffer')
  );
}

function arrayBufferToBase64(
  buffer: ArrayBuffer | ArrayBufferLike,
  byteOffset = 0,
  length?: number,
): string {
  const view = new Uint8Array(buffer as ArrayBuffer, byteOffset, length);
  const bytes = length != null ? view : new Uint8Array(buffer as ArrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractSignature(raw: unknown, depth = 0): string {
  if (depth > 4 || raw == null) return '';

  if (typeof raw === 'string') {
    return raw.trim();
  }

  if (typeof raw === 'number' || typeof raw === 'bigint') {
    return String(raw);
  }

  if (isUint8Array(raw)) {
    return arrayBufferToBase64(raw.buffer, raw.byteOffset, raw.byteLength);
  }

  if (isArrayBuffer(raw)) {
    return arrayBufferToBase64(raw);
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const extracted = extractSignature(item, depth + 1);
      if (extracted) return extracted;
    }
    return '';
  }

  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const preferredKeys = ['signature', 'sig', 'signedMessage', 'result', 'data', 'value'];

    for (const key of preferredKeys) {
      if (key in record) {
        const extracted = extractSignature(record[key], depth + 1);
        if (extracted) return extracted;
      }
    }

    for (const value of Object.values(record)) {
      const extracted = extractSignature(value, depth + 1);
      if (extracted) return extracted;
    }
  }

  return '';
}

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

type SessionPayload = {
  authenticated: boolean;
  address?: string;
  expiresAt?: string;
};

async function fetchSession(): Promise<{ address: string; expiresAt: string } | null> {
  try {
    const response = await fetch('/api/auth/session', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) return null;

    const data = (await response.json()) as SessionPayload;

    if (!data.authenticated || !data.address || !data.expiresAt) {
      return null;
    }

    return {
      address: data.address,
      expiresAt: data.expiresAt,
    };
  } catch {
    return null;
  }
}

export function WalletAuthProvider({ children }: { children: React.ReactNode }) {
  const { connected, address, signMessage, disconnect } = useLaserEyes((state) => ({
    connected: state.connected,
    address: state.address,
    signMessage: state.signMessage,
    disconnect: state.disconnect,
  }));

  const [state, setState] = useState<WalletAuthState>({ status: 'idle' });
  const handshakeRef = useRef<Promise<void> | null>(null);

  const ensureAuthenticated = useCallback(async () => {
    if (!connected || !address) {
      setState({ status: 'idle' });
      return;
    }

    const trimmedAddress = address.trim();
    const existingSession = await fetchSession();

    if (
      existingSession &&
      existingSession.address &&
      addressesMatch(existingSession.address, trimmedAddress)
    ) {
      setState({
        status: 'authenticated',
        address: existingSession.address,
        expiresAt: existingSession.expiresAt,
        error: null,
      });
      return;
    }

    if (!signMessage) {
      setState({ status: 'error', error: 'Wallet does not support message signing.' });
      return;
    }

    setState({ status: 'pending' });

    if (!handshakeRef.current) {
      handshakeRef.current = (async () => {
        try {
          const response = await fetchWithTimeout('/api/auth/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address }),
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to request signature message.');
          }

          const payload = (await response.json()) as { message: string; nonce: string };

          const rawSignature = await signMessage(payload.message, { toSignAddress: address });
          const signaturePayload = extractSignature(rawSignature);

          if (!signaturePayload) {
            throw new Error('Wallet did not provide a signature payload');
          }

          const verifyResponse = await fetchWithTimeout('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address,
              signature: signaturePayload,
              nonce: payload.nonce,
            }),
            credentials: 'include',
          });

          if (!verifyResponse.ok) {
            throw new Error('Wallet signature verification failed.');
          }

          const verified = (await verifyResponse.json()) as {
            address: string;
            expiresAt: string;
          };

          setState({
            status: 'authenticated',
            address: verified.address,
            expiresAt: verified.expiresAt,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Wallet authentication failed.';
          setState({ status: 'error', error: message });
          toast.error(message);
          disconnect();
        } finally {
          handshakeRef.current = null;
        }
      })();
    }

    await handshakeRef.current;
  }, [connected, address, signMessage, disconnect]);

  useEffect(() => {
    ensureAuthenticated();
  }, [ensureAuthenticated]);

  const contextValue = useMemo<WalletAuthContextValue>(
    () => ({
      status: state.status,
      address: state.address,
      expiresAt: state.expiresAt,
      error: state.error,
      refresh: ensureAuthenticated,
    }),
    [state, ensureAuthenticated],
  );

  return <WalletAuthContext.Provider value={contextValue}>{children}</WalletAuthContext.Provider>;
}

export function useWalletAuth() {
  const context = useContext(WalletAuthContext);
  if (!context) {
    throw new Error('useWalletAuth must be used within a WalletAuthProvider');
  }
  return context;
}
