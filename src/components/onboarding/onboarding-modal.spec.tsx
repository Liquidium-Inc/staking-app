import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingModal } from './onboarding-modal';

const mockUseMediaQuery = vi.fn<(query: string) => boolean>();

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('OnboardingModal', () => {
  beforeEach(() => {
    mockUseMediaQuery.mockReset();
  });

  it('provides an accessible hidden description for the desktop alert dialog', () => {
    mockUseMediaQuery.mockReturnValue(true);

    render(<OnboardingModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Onboarding step 1 of 5.')).toBeInTheDocument();
  });

  it('provides an accessible hidden description for the mobile drawer', () => {
    mockUseMediaQuery.mockReturnValue(false);

    render(<OnboardingModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Onboarding step 1 of 5.')).toBeInTheDocument();
  });
});
