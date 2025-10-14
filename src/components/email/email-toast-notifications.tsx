'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

// Error message mapping for cleaner code
const ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'Verification link is invalid. Please try again.',
  invalid_token: 'Verification link is invalid or expired.',
  token_expired: 'Verification link has expired. Please request a new one.',
  verification_failed: 'Email verification failed. Please try again.',
  missing_address: 'Unsubscribe link is invalid. Please try again.',
  unsubscribe_failed: 'Failed to unsubscribe. Please try again.',
};

export function EmailToastNotifications() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const emailVerified = searchParams.get('email_verified');
    const emailUnsubscribed = searchParams.get('email_unsubscribed');
    const emailSent = searchParams.get('email_sent');
    const error = searchParams.get('error');

    // Success messages
    if (emailVerified === 'true') {
      toast.success('Email verified successfully! You will receive weekly staking reports.');
    }

    if (emailUnsubscribed === 'true') {
      toast.success('Successfully unsubscribed from weekly reports.');
    }

    if (emailSent === 'true') {
      const email = searchParams.get('email')?.trim();
      if (email) {
        toast.success(`Verification email sent to ${email}`);
      } else {
        toast.success('Verification email sent.');
      }
    }

    // Error messages with mapping
    if (error) {
      toast.error(ERROR_MESSAGES[error] || 'An error occurred. Please try again.');
    }
  }, [searchParams]);

  // This component doesn't render anything, just shows toasts
  return null;
}
