'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'Verification link is invalid. Please try again.',
  invalid_token: 'Verification link is invalid or expired.',
  token_expired: 'Verification link has expired. Please request a new one.',
  verification_failed: 'Email verification failed. Please try again.',
  missing_address: 'Unsubscribe link is invalid. Please try again.',
  token_address_mismatch: 'Token does not match address.',
  unsubscribe_failed: 'Failed to unsubscribe. Please try again.',
};

export function FlashQueryToasts() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const emailVerified = searchParams.get('email_verified') === 'true';
    const emailUnsubscribed = searchParams.get('email_unsubscribed') === 'true';
    const emailSent = searchParams.get('email_sent') === 'true';
    const email = searchParams.get('email')?.trim();
    const error = searchParams.get('error');

    let didToast = false;

    if (emailVerified) {
      toast.success('Email verified successfully! You will receive weekly staking reports.');
      didToast = true;
    }

    if (emailUnsubscribed) {
      toast.success('Successfully unsubscribed from weekly reports.');
      didToast = true;
    }

    if (emailSent) {
      toast.success(email ? `Verification email sent to ${email}` : 'Verification email sent.');
      didToast = true;
    }

    if (error) {
      toast.error(ERROR_MESSAGES[error] || 'An error occurred. Please try again.');
      didToast = true;
    }

    if (didToast && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      ['email_verified', 'email_unsubscribed', 'email_sent', 'email', 'error'].forEach((k) =>
        url.searchParams.delete(k),
      );
      window.history.replaceState(null, '', url.toString());
    }
  }, [searchParams]);

  return null;
}
