'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useWalletAuth } from '@/components/wallet/wallet-auth-provider';

async function fetchPendingVersion(): Promise<string | null> {
  const response = await fetch('/api/terms', { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to load terms status');
  const { pendingVersion } = (await response.json()) as { pendingVersion: string | null };
  return pendingVersion;
}

async function acceptVersion(version: string) {
  const response = await fetch('/api/terms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to save terms acceptance');
}

export function TermsGate() {
  const { status, address } = useWalletAuth();
  const queryClient = useQueryClient();
  const queryKey = ['terms', address];
  const [agreed, setAgreed] = useState(false);
  // Not blocking: someone who doesn't agree can still unstake and withdraw.
  const [postponedFor, setPostponedFor] = useState<string>();

  const { data: pendingVersion } = useQuery({
    queryKey,
    queryFn: fetchPendingVersion,
    enabled: status === 'authenticated',
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: acceptVersion,
    onSuccess: () => queryClient.setQueryData(queryKey, null),
    onError: () => toast.error('Could not save your agreement. Please try again.'),
  });

  if (status !== 'authenticated' || !pendingVersion || postponedFor === address) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Updates to our Terms of Use</AlertDialogTitle>
          <AlertDialogDescription>
            Liquidium Inc. (Panama) now operates this site. Revised{' '}
            <Link href="/terms" target="_blank" className="text-foreground underline">
              Terms of Use
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" className="text-foreground underline">
              Privacy Policy
            </Link>{' '}
            take effect on 23 November 2026.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked === true)}
          />
          <span>I agree to the updated Terms of Use and Privacy Policy (v{pendingVersion}).</span>
        </label>
        <AlertDialogFooter>
          <Button
            variant="outline"
            disabled={accept.isPending}
            onClick={() => setPostponedFor(address)}
          >
            Not now
          </Button>
          <Button
            disabled={!agreed || accept.isPending}
            onClick={() => accept.mutate(pendingVersion)}
          >
            Agree &amp; continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
