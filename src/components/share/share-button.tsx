'use client';

import { Check, Copy, Loader2, Share2, X } from 'lucide-react';
import { useState } from 'react';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { Button } from '@ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatCurrency } from '@/lib/formatCurrency';

interface ShareButtonProps {
  tokenAmount: number;
  tokenSymbol: string;
  decimals: number;
}

export function ShareButton({ tokenAmount, tokenSymbol, decimals }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const { capture } = useAnalytics();

  const roundedAmount = formatCurrency(tokenAmount, decimals);
  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/earned/${roundedAmount}`;
  const tweetText = `Check out liquid staking on Liquidium.`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      capture('share_link_copied', { token_amount: tokenAmount });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleCopyImage = async () => {
    try {
      setLoadingImage(true);
      const imageUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/earned?amount=${roundedAmount}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);

      setCopiedImage(true);
      capture('share_image_copied', { token_amount: roundedAmount });
      setTimeout(() => setCopiedImage(false), 2000);
    } catch (error) {
      console.error('Failed to copy image:', error);
    } finally {
      setLoadingImage(false);
    }
  };

  const handleShareOnX = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
    capture('share_on_x_clicked', { token_amount: roundedAmount });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-2 rounded-xl border-neutral-700"
          onClick={() => {
            setOpen(true);
            capture('share_button_clicked', { token_amount: roundedAmount });
          }}
        >
          <Share2 size={14} />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent className="bg-card w-64 border border-neutral-700" align="end">
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2 rounded-xl border-neutral-700"
            onClick={handleCopyLink}
          >
            {copiedLink ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            {copiedLink ? 'Link copied!' : 'Copy link'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2 rounded-xl border-neutral-700"
            onClick={handleCopyImage}
            disabled={loadingImage}
          >
            {loadingImage ? (
              <Loader2 size={16} className="animate-spin" />
            ) : copiedImage ? (
              <Check size={16} className="text-green-500" />
            ) : (
              <Copy size={16} />
            )}
            {loadingImage ? 'Generating...' : copiedImage ? 'Image copied!' : 'Copy image'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2 rounded-xl border-neutral-700"
            onClick={handleShareOnX}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
