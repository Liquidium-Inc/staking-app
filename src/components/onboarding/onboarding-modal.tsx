'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Droplet,
  ExternalLink,
  HandCoins,
  PiggyBank,
  Scale,
  Sprout,
  TrendingUp,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialogPortal,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
} from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const STORAGE_KEY = 'liquidium_onboarding_completed';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getSlidesContent = (handleClose: () => void) => [
  {
    id: 'welcome',
    icon: '/logo.svg',
    title: 'Welcome to Liquidium',
    content: (
      <div className="space-y-4">
        <p className="text-lg opacity-80">
          Liquidium is a suite of decentralized lending products with Bitcoin at its core.
        </p>
        <div className="mt-5 grid justify-center gap-3 md:mt-0 md:grid-cols-2">
          <Link
            href="https://liquidium.fi"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900 sm:p-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">LiquidiumFi</h4>
              <ExternalLink className="h-4 w-4 opacity-60 transition-opacity group-hover:opacity-100" />
            </div>
            <Image
              src="/onboarding/cross-chain.png"
              alt="LiquidiumFi"
              width={300}
              height={150}
              className="rounded-lg"
            />
            <p className="text-sm opacity-70">Cross-chain loans between any chain</p>
          </Link>
          <Link
            href="https://liquidium.wtf"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">LiquidiumWTF</h4>
              <ExternalLink className="h-4 w-4 opacity-60 transition-opacity group-hover:opacity-100" />
            </div>
            <Image
              src="/onboarding/wtf.png"
              alt="LiquidiumWTF"
              width={300}
              height={150}
              className="rounded-lg"
            />
            <p className="text-sm opacity-70">Peer-to-peer Ordinal and Rune loans</p>
          </Link>
        </div>
      </div>
    ),
  },
  {
    id: 'liq-token',
    icon: '/liquidium.svg',
    title: 'Meet LIQ',
    content: (
      <div className="space-y-4">
        <p className="text-lg opacity-80">
          LIQ is the native token governing the Liquidium ecosystem. Holders can vote on proposals
          and earn yield by staking their tokens.
        </p>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Scale className="h-6 w-6 text-neutral-500" />
            <h4 className="font-semibold">Governance</h4>
          </div>
          <p className="text-sm opacity-70">
            As the governance token, LIQ gives you a voice in the future direction of the protocol.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'staking',
    icon: '/sLIQ.svg',
    title: 'Stake & Earn with sLIQ',
    IconComponent: TrendingUp,
    content: (
      <div className="space-y-4">
        <p className="text-lg opacity-80">
          When you stake LIQ, you receive <strong className="text-white">sLIQ</strong> - a liquid
          staking token that represents your staked position.
        </p>
        <div className="space-y-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Droplet className="h-6 w-6 text-neutral-500" />
              <h4 className="font-semibold">Liquid & Flexible</h4>
            </div>
            <p className="text-sm opacity-70">
              sLIQ is a rune in your wallet that can be traded, sent, borrowed against, or used
              anywhere you&apos;d use a regular rune.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Sprout className="h-6 w-6 text-neutral-500" />
              <h4 className="font-semibold">Auto-Compounding</h4>
            </div>
            <p className="text-sm opacity-70">
              sLIQ automatically grows in value compared to LIQ over time, so you earn yield simply
              by holding it.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'rewards',
    IconComponent: HandCoins,
    title: 'Rewards from Buybacks',
    content: (
      <div className="space-y-4">
        <p className="text-lg opacity-80">
          30% of Liquidium&apos;s protocol revenue is used for daily LIQ token buybacks, which are
          distributed to stakers.
        </p>
        <div className="space-y-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <PiggyBank className="h-6 w-6 text-neutral-500" />
              <h4 className="font-semibold">Real Yield</h4>
            </div>
            <p className="text-sm opacity-70">
              Rewards come from actual protocol revenue - every loan generates fees that flow back
              to stakers.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <CalendarCheck className="h-6 w-6 text-neutral-500" />
              <h4 className="font-semibold">Daily Buybacks</h4>
            </div>
            <p className="text-sm opacity-70">
              LIQ tokens are bought back from the market daily and distributed to the staking pool,
              increasing the value of your sLIQ automatically.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'get-started',
    IconComponent: ArrowRight,
    title: "You're All Set!",
    content: (
      <div className="space-y-4">
        <p className="text-lg opacity-80">
          Ready to start earning? Purchase LIQ tokens from a supported marketplace, then stake them
          to begin earning yield.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="default" asChild className="w-full rounded-full py-6 text-base">
            <Link
              href="https://help.liquidium.fi/en/articles/11359560-liq-marketplaces"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleClose}
            >
              Buy LIQ
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="secondary" asChild className="w-full rounded-full py-6 text-base">
            <Link href="/stake" onClick={handleClose}>
              Start Staking
              <TrendingUp className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    ),
  },
];

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const handleClose = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onClose();
  }, [onClose]);

  const slides = getSlidesContent(handleClose);

  const handleNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setDirection(1);
      setCurrentSlide((prev) => prev + 1);
    }
  }, [currentSlide, slides.length]);

  const handlePrev = useCallback(() => {
    if (currentSlide > 0) {
      setDirection(-1);
      setCurrentSlide((prev) => prev - 1);
    }
  }, [currentSlide]);

  const handleComplete = handleClose;
  const handleSkip = handleClose;

  // keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (currentSlide === slides.length - 1) {
          handleComplete();
        } else {
          handleNext();
        }
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentSlide, handleNext, handlePrev, handleComplete, handleSkip, slides.length]);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  const currentSlideData = slides[currentSlide];

  const content = (
    <div className="flex h-full min-h-[510px] flex-col">
      {/* header */}
      <div className="flex items-center justify-between border-b border-neutral-800 p-6">
        <div className="flex items-center gap-3">
          {currentSlideData.icon ? (
            <Image
              src={currentSlideData.icon}
              alt="Icon"
              width={32}
              height={32}
              className="h-8 w-8"
            />
          ) : currentSlideData.IconComponent ? (
            <currentSlideData.IconComponent className="h-8 w-8" />
          ) : null}
          <h2 className="text-xl font-bold sm:text-2xl">{currentSlideData.title}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSkip}
          className="rounded-full"
          aria-label="Close onboarding"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* content */}
      <div className="relative flex-1 overflow-hidden p-4">
        <div className="relative h-full overflow-y-auto">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={currentSlide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: 'spring', stiffness: 400, damping: 35 },
                opacity: { duration: 0.15 },
              }}
              className="absolute inset-0 overflow-y-auto"
            >
              {currentSlideData.content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* footer */}
      <div className="border-t border-neutral-800 p-2 sm:p-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentSlide === 0}
            className="rounded-full"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>

          {/* progress dots */}
          <div className="flex gap-2">
            {slides.map((_slide, index) => (
              <button
                key={index}
                onClick={() => {
                  setDirection(index > currentSlide ? 1 : -1);
                  setCurrentSlide(index);
                }}
                className="group relative h-2 w-2 rounded-full transition-all"
                aria-label={`Go to slide ${index + 1}`}
              >
                <div
                  className={`h-full w-full rounded-full transition-all ${
                    index === currentSlide
                      ? 'w-8 bg-white'
                      : 'bg-neutral-700 group-hover:bg-neutral-600'
                  }`}
                />
              </button>
            ))}
          </div>

          {currentSlide === slides.length - 1 ? (
            <Button onClick={handleComplete} className="rounded-full">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleNext} className="rounded-full">
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleSkip()}>
        <AlertDialogPortal>
          <AlertDialogOverlay className="bg-black/80 backdrop-blur-sm" />
          <AlertDialogContent className="h-fit max-h-[90vh] min-w-xl overflow-hidden border-neutral-800 bg-neutral-950 p-0">
            {content}
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && handleSkip()}>
      <DrawerPortal>
        <DrawerOverlay className="bg-black/80 backdrop-blur-sm" />
        <DrawerContent className="h-screen w-full border-neutral-800 bg-neutral-950">
          {content}
          <DrawerClose />
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}

export function useOnboarding() {
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);

  useEffect(() => {
    const hasCompletedOnboarding = localStorage.getItem(STORAGE_KEY);
    setShouldShowOnboarding(!hasCompletedOnboarding);
  }, []);

  const markOnboardingComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShouldShowOnboarding(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setShouldShowOnboarding(true);
  }, []);

  return {
    shouldShowOnboarding,
    markOnboardingComplete,
    resetOnboarding,
  };
}
