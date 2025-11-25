'use client';

import { CheckIcon, MailIcon } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
  ItemActions,
  ItemFooter,
  ItemGroup,
  ItemHeader,
} from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useEmailSubscription } from '@/hooks/api/useEmailSubscription';

// Simple email validation
const isValidEmail = (email: string): boolean => {
  return email.trim() !== '' && email.includes('@');
};

const formatAddressForAnalytics = (address: string): string => {
  return address.slice(0, 6) + '...';
};

export const EmailSubscription = ({ address }: { address: string }) => {
  const [email, setEmail] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const { capture } = useAnalytics();

  const { status, statusLoading, subscribe, unsubscribe, isSubscribing } =
    useEmailSubscription(address);

  const maskedAddress = formatAddressForAnalytics(address);
  const subscriptionStatus = status?.subscribed ? status : null;
  const isSubscribed = Boolean(subscriptionStatus);
  const isSwitchChecked = isFormOpen || isSubscribed || isSubscribing;

  const handleSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!isValidEmail(trimmedEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!agreeToTerms) {
      toast.error('Please agree to the privacy policy');
      return;
    }

    capture('email_subscribe_attempt', { address: maskedAddress });
    subscribe({ email: trimmedEmail, agreeToTerms });
    setEmail('');
    setAgreeToTerms(false);
    setIsFormOpen(false);
  };

  const handleToggle = (checked: boolean) => {
    if (checked) {
      setIsFormOpen(true);
      return;
    }

    setIsFormOpen(false);
    setEmail('');
    setAgreeToTerms(false);

    if (isSubscribed) {
      capture('email_unsubscribe_attempt', { address: maskedAddress });
      unsubscribe();
    }
  };

  if (statusLoading) {
    return (
      <ItemGroup className="mb-3 text-xs">
        <Item
          variant="outline"
          size="sm"
          className="bg-card/30 rounded-[18px] border border-gray-500/30"
        >
          <div className="flex w-full items-center justify-between gap-3">
            <Skeleton className="bg-muted/40 h-3.5 w-28" />
            <Skeleton className="bg-muted/40 h-4 w-12" />
          </div>
        </Item>
      </ItemGroup>
    );
  }

  return (
    <ItemGroup className="mb-3 text-xs">
      <Item
        variant="outline"
        size="sm"
        className="bg-card/30 rounded-[18px] border border-gray-500/30"
      >
        <ItemContent className="gap-1.5">
          <ItemHeader className="items-center gap-3">
            <div className="flex flex-1 items-center gap-3">
              <span className="text-gray-400">
                <MailIcon className="h-3.5 w-3.5" />
              </span>
              <div className="flex-1 space-y-1">
                <ItemTitle className="text-xs font-medium text-gray-300">Weekly reports</ItemTitle>
                <ItemDescription className="text-xs text-gray-500">
                  Get personalized summaries
                </ItemDescription>
              </div>
            </div>
            <ItemActions className="items-center self-center">
              <Switch
                aria-label="Toggle weekly reports"
                checked={isSwitchChecked}
                onCheckedChange={handleToggle}
                className="data-[state=checked]:bg-gray-200/80 data-[state=unchecked]:bg-gray-700"
              />
            </ItemActions>
          </ItemHeader>

          {isSubscribed && subscriptionStatus && (
            <div className="flex flex-col gap-1 rounded-xl border border-gray-500/30 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                <Chip
                  size="sm"
                  variant={subscriptionStatus.isVerified ? 'success' : 'warning'}
                  className="gap-1 bg-black/30 px-2 py-0.5"
                >
                  {subscriptionStatus.isVerified ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    <MailIcon className="size-3" />
                  )}
                  {subscriptionStatus.isVerified ? 'Subscribed' : 'Verify email'}
                </Chip>
                <span className="truncate">{subscriptionStatus.email}</span>
              </div>
              {!subscriptionStatus.isVerified && (
                <span className="text-[11px] text-gray-400/80">
                  We sent a confirmation email. Please verify to start receiving reports.
                </span>
              )}
            </div>
          )}

          {isFormOpen && (
            <ItemFooter className="w-full flex-col items-start gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Checkbox
                  id="privacy-policy"
                  checked={agreeToTerms}
                  onCheckedChange={(checked) => setAgreeToTerms(checked === true)}
                  className="rounded-[6px]"
                />
                <Label htmlFor="privacy-policy" className="cursor-pointer text-xs leading-none">
                  I agree to the{' '}
                  <a
                    href="/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-200 underline decoration-gray-400 underline-offset-4 transition-colors hover:text-white"
                  >
                    Privacy Policy
                  </a>
                </Label>
              </div>

              <form onSubmit={handleSubscribe} className="w-full">
                <InputGroup className="w-full overflow-hidden rounded-full border border-gray-500/40 bg-black/10">
                  <InputGroupInput
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 px-4 text-xs text-gray-200 placeholder:text-gray-500"
                  />
                  <InputGroupAddon
                    align="inline-end"
                    className="!gap-0 !py-[2px] !pr-[4px] has-[>button]:!mr-0"
                  >
                    <InputGroupButton
                      type="submit"
                      disabled={isSubscribing}
                      size="icon-xs"
                      variant="default"
                      className="size-6 rounded-full bg-white text-gray-900 hover:bg-white/90"
                    >
                      <CheckIcon className="size-3" />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
            </ItemFooter>
          )}
        </ItemContent>
      </Item>
    </ItemGroup>
  );
};
