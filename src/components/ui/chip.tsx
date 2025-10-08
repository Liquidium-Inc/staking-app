import { cva, VariantProps } from 'class-variance-authority';
import React from 'react';

/**
 * Chip component for displaying small, rounded labels or tags.
 *
 * Props:
 * - children: ReactNode - The content to display inside the chip.
 * - className: string (optional) - Additional classes for styling.
 * - variant: "default" | "success" | "warning" | "error" | "info" (optional) - Color variant.
 * - size: "sm" | "md" | "lg" (optional) - Size of the chip.
 * - ...props: any other props (e.g., onClick)
 */

const chipVariants = cva(
  'border-2 font-semibold border-gray-500/15 inline-flex items-center rounded-full select-none',
  {
    variants: {
      variant: {
        default: '',
        disabled: 'text-white/40',
        success: 'text-green-500',
        warning: 'text-yellow-500',
        error: 'text-red-500',
        info: 'text-blue-500',
      },
      size: {
        sm: 'text-xs px-1 py-0.5',
        md: 'text-sm px-3 py-1',
        lg: 'text-base px-4 py-1.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

interface ChipProps extends VariantProps<typeof chipVariants> {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  className?: string;
}

export function Chip({ children, className, variant, size, ...props }: ChipProps) {
  return (
    <span className={chipVariants({ variant, className, size })} {...props}>
      {children}
    </span>
  );
}
