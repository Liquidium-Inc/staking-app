'use client';

import { Cookie } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Define prop types
interface CookieConsentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'small' | 'mini';
  demo?: boolean;
  forceOpen?: boolean;
  onAcceptCallback?: () => void;
  onDeclineCallback?: () => void;
  description?: string;
  learnMoreHref?: string;
}

const CookieConsent = React.forwardRef<HTMLDivElement, CookieConsentProps>(
  (
    {
      variant = 'default',
      demo = false,
      forceOpen = false,
      onAcceptCallback = () => {},
      onDeclineCallback = () => {},
      className,
      description = 'We use cookies to ensure you get the best experience on our website. For more information on how we use cookies, please see our cookie policy.',
      learnMoreHref = '#',
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [hide, setHide] = React.useState(false);

    const handleAccept = React.useCallback(() => {
      setIsOpen(false);
      document.cookie = 'cookieConsent=true; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT';
      setTimeout(() => {
        setHide(true);
      }, 700);
      onAcceptCallback();
    }, [onAcceptCallback]);

    const handleDecline = React.useCallback(() => {
      setIsOpen(false);
      // Store declined choice for 6 months (GDPR compliance - reasonable period for refusal records)
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 6);
      document.cookie = `cookieConsent=false; path=/; expires=${expiryDate.toUTCString()}`;
      setTimeout(() => {
        setHide(true);
      }, 700);
      onDeclineCallback();
    }, [onDeclineCallback]);

    React.useEffect(() => {
      try {
        setIsOpen(true);
        if (
          !forceOpen &&
          (document.cookie.includes('cookieConsent=true') ||
            document.cookie.includes('cookieConsent=false')) &&
          !demo
        ) {
          setIsOpen(false);
          setTimeout(() => {
            setHide(true);
          }, 700);
        } else if (forceOpen) {
          setHide(false);
        }
      } catch (error) {
        console.warn('Cookie consent error:', error);
      }
    }, [demo, forceOpen]);

    if (hide) return null;

    const containerClasses = cn(
      'fixed z-50 transition-all duration-700',
      !isOpen ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100',
      className,
    );

    const wrapperClass =
      variant === 'mini'
        ? 'left-0 right-0 bottom-4 w-full sm:left-4 sm:max-w-3xl'
        : 'bottom-0 left-0 right-0 w-full px-4 sm:bottom-4 sm:left-4 sm:right-auto sm:w-auto sm:px-0';

    const commonWrapperProps = {
      ref,
      className: cn(containerClasses, wrapperClass),
      ...props,
    };

    if (variant === 'default') {
      return (
        <div {...commonWrapperProps}>
          <Card className="m-3 mx-auto w-full max-w-md px-4 py-5 shadow-lg sm:m-0 sm:mx-0 sm:px-5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-0 pb-4">
              <CardTitle className="text-lg">We use cookies</CardTitle>
              <Cookie className="h-5 w-5" />
            </CardHeader>
            <CardContent className="space-y-3 px-0">
              <CardDescription>{description}</CardDescription>
              <p className="text-muted-foreground text-xs">
                By clicking <span className="font-medium">Accept</span>, you agree to our use of
                cookies.
              </p>
              <a
                href={learnMoreHref}
                className="text-primary text-xs underline underline-offset-4 hover:no-underline"
              >
                Learn more
              </a>
            </CardContent>
            <CardFooter className="flex gap-3 px-0 pt-4 pb-0">
              <Button
                onClick={handleDecline}
                variant="ghost"
                className="flex-1 rounded-full border border-white/20 bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Decline
              </Button>
              <Button
                onClick={handleAccept}
                variant="secondary"
                className="flex-1 rounded-full px-6 py-3 text-sm font-semibold"
              >
                Accept
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    if (variant === 'small') {
      return (
        <div {...commonWrapperProps}>
          <Card className="m-3 shadow-lg">
            <CardHeader className="flex h-0 flex-row items-center justify-between space-y-0 px-4 pb-2">
              <CardTitle className="text-base">We use cookies</CardTitle>
              <Cookie className="h-4 w-4" />
            </CardHeader>
            <CardContent className="px-4 pt-0 pb-2">
              <CardDescription className="text-sm">{description}</CardDescription>
            </CardContent>
            <CardFooter className="flex h-0 gap-2 px-4 py-2">
              <Button
                onClick={handleDecline}
                variant="secondary"
                size="sm"
                className="flex-1 rounded-full"
              >
                Decline
              </Button>
              <Button onClick={handleAccept} size="sm" className="flex-1 rounded-full">
                Accept
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    if (variant === 'mini') {
      return (
        <div {...commonWrapperProps}>
          <Card className="mx-3 p-0 py-3 shadow-lg">
            <CardContent className="grid gap-4 p-0 px-3.5 sm:flex">
              <CardDescription className="flex-1 text-xs sm:text-sm">{description}</CardDescription>
              <div className="flex items-center justify-end gap-2 sm:gap-3">
                <Button
                  onClick={handleDecline}
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                >
                  Decline
                  <span className="sr-only sm:hidden">Decline</span>
                </Button>
                <Button onClick={handleAccept} size="sm" className="h-7 text-xs">
                  Accept
                  <span className="sr-only sm:hidden">Accept</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return null;
  },
);

CookieConsent.displayName = 'CookieConsent';
export { CookieConsent };
export default CookieConsent;
