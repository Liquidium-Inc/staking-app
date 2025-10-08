'use client';

import { Car, ChevronDown, Rocket } from 'lucide-react';
import { createContext, useContext, useMemo, useState } from 'react';

import { useAnalytics } from '@/components/privacy/analytics-consent-provider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useFeeRates } from '@/hooks/api/useFeeRates';

type FeeSpeed = 'medium' | 'fast';

interface FeeContextType {
  selectedSpeed: FeeSpeed;
  selectedRate: number | undefined;
  setSelectedSpeed: (speed: FeeSpeed) => void;
}

const FeeContext = createContext<FeeContextType | undefined>(undefined);

export function FeeProvider({ children }: { children: React.ReactNode }) {
  const [selectedSpeed, setSelectedSpeed] = useState<FeeSpeed>('medium');
  const { data: feeRates } = useFeeRates();

  const adjustedRates = useMemo(
    () => ({
      medium: typeof feeRates?.medium === 'number' ? feeRates.medium + 1 : undefined,
      fast: typeof feeRates?.fast === 'number' ? feeRates.fast + 1 : undefined,
    }),
    [feeRates?.fast, feeRates?.medium],
  );

  const selectedRate = adjustedRates[selectedSpeed];

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      selectedSpeed,
      selectedRate,
      setSelectedSpeed,
    }),
    [selectedSpeed, selectedRate],
  );

  return <FeeContext.Provider value={contextValue}>{children}</FeeContext.Provider>;
}

export function useFeeSelection() {
  const context = useContext(FeeContext);
  if (!context) {
    // Return fallback values when used outside FeeProvider
    return {
      selectedSpeed: 'medium' as const,
      selectedRate: undefined,
      setSelectedSpeed: () => {},
    };
  }
  return context;
}

export function FeeSelector() {
  const { data: feeRates } = useFeeRates();
  const { selectedSpeed, setSelectedSpeed } = useFeeSelection();
  const { capture } = useAnalytics();

  const adjustedRates = useMemo(
    () => ({
      medium: typeof feeRates?.medium === 'number' ? feeRates.medium + 1 : undefined,
      fast: typeof feeRates?.fast === 'number' ? feeRates.fast + 1 : undefined,
    }),
    [feeRates?.fast, feeRates?.medium],
  );

  // Memoize speed config to prevent recreation on every render
  const speedConfig = useMemo(
    () => ({
      medium: { icon: Car, label: 'Medium', rate: adjustedRates.medium },
      fast: { icon: Rocket, label: 'Fast', rate: adjustedRates.fast },
    }),
    [adjustedRates],
  );

  if (!feeRates) {
    return (
      <div className="flex w-full justify-between">
        <div className="flex items-center space-x-1.5 opacity-80">
          <Car className="w-4" />
          <span className="font-semibold">Fee rate</span>
        </div>
        <div className="h-9 w-20 animate-pulse rounded-full bg-gray-200/20" />
      </div>
    );
  }

  const SelectedIcon = speedConfig[selectedSpeed].icon;

  return (
    <div className="flex w-full justify-between">
      <div className="flex items-center space-x-1.5 opacity-80">
        <SelectedIcon className="w-4" />
        <span className="font-semibold">Fee rate</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-7 space-x-1.5 rounded-full border border-white/10 px-3 text-xs font-semibold text-white hover:bg-white/10"
            aria-label={`Fee rate selector, currently ${selectedSpeed} (${speedConfig[selectedSpeed]?.rate} sat/vB)`}
          >
            <span className="capitalize">{selectedSpeed}</span>
            <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-48 space-y-1 border border-white/10 bg-black p-2"
          align="end"
          role="menu"
          aria-label="Fee rate options"
        >
          {(Object.entries(speedConfig) as Array<[FeeSpeed, (typeof speedConfig)[FeeSpeed]]>).map(
            ([speed, config]) => {
              const Icon = config.icon;
              const isSelected = speed === selectedSpeed;

              return (
                <Button
                  key={speed}
                  variant="ghost"
                  className={`flex w-full justify-start space-x-3 px-3 py-2 ${
                    isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                  onClick={() => {
                    const newSpeed = speed as FeeSpeed;
                    setSelectedSpeed(newSpeed);
                    capture('fee_speed_selected', {
                      speed: newSpeed,
                      rate: config.rate,
                    });
                  }}
                  role="menuitem"
                  aria-current={isSelected ? 'true' : 'false'}
                  aria-label={`${config.label} fee rate, ${config.rate} sat/vB${isSelected ? ' (currently selected)' : ''}`}
                >
                  <Icon className="w-4" aria-hidden="true" />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{config.label}</span>
                    <span className="text-xs opacity-75">{config.rate} sat/vB</span>
                  </div>
                </Button>
              );
            },
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
