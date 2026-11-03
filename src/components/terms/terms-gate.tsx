'use client';

import { useLaserEyes } from '@omnisat/lasereyes-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useWalletAuth } from '@/components/wallet/wallet-auth-provider';
import { addressesMatch } from '@/lib/address';

const queryKeyFor = (address: string) => ['terms', address];

async function fetchPendingVersion(address: string): Promise<string | null> {
  const response = await fetch(`/api/terms?address=${encodeURIComponent(address)}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to load terms status');
  const { pendingVersion } = (await response.json()) as { pendingVersion: string | null };
  return pendingVersion;
}

async function acceptVersion({ address, version }: { address: string; version: string }) {
  const response = await fetch('/api/terms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, version }),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to save terms acceptance');
}

function TermsPrompt({
  address,
  version,
  onPostpone,
}: {
  address: string;
  version: string;
  onPostpone: () => void;
}) {
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const accept = useMutation({
    mutationFn: acceptVersion,
    onSuccess: (_, variables) => queryClient.setQueryData(queryKeyFor(variables.address), null),
    onError: () => toast.error('Could not save your agreement. Please try again.'),
  });

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
            take effect on 23 November 2026. If you don&apos;t agree, you can still unstake and
            withdraw.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked === true)}
          />
          <span>I agree to the updated Terms of Use and Privacy Policy (v{version}).</span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={accept.isPending} onClick={onPostpone}>
            Not now
          </AlertDialogCancel>
          <Button
            disabled={!agreed || accept.isPending}
            onClick={() => accept.mutate({ address, version })}
          >
            Agree &amp; continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TermsGate() {
  const { status, address: authAddress } = useWalletAuth();
  const { connected, address: walletAddress } = useLaserEyes((state) => ({
    connected: state.connected,
    address: state.address,
  }));
  const [postponedFor, setPostponedFor] = useState<string>();

  const address =
    status === 'authenticated' && connected && addressesMatch(authAddress, walletAddress)
      ? walletAddress
      : undefined;

  // No long-lived cache: a wallet's answer can change between connections.
  const { data: pendingVersion } = useQuery({
    queryKey: queryKeyFor(address ?? ''),
    queryFn: () => fetchPendingVersion(address as string),
    enabled: !!address,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!address || !pendingVersion || postponedFor === address) return null;

  return (
    <TermsPrompt
      key={`${address}:${pendingVersion}`}
      address={address}
      version={pendingVersion}
      onPostpone={() => setPostponedFor(address)}
    />
  );
}
