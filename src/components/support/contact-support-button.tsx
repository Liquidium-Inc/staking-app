'use client';

import { isSupportWidgetEnabled, support } from '@/lib/support';

type ContactSupportButtonProps = {
  className?: string;
  label?: string;
};

export function ContactSupportButton({
  className,
  label = 'Contact support',
}: ContactSupportButtonProps) {
  if (!isSupportWidgetEnabled) return null;

  return (
    <button type="button" onClick={() => support.open()} className={className}>
      {label}
    </button>
  );
}
