import { render, screen } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/config/public';

import PortfolioPage from './page';

type LaserState = {
  address?: string;
  isInitializing: boolean;
  isConnecting: boolean;
};

type ProtocolQuery = {
  data: {
    exchangeRate: number;
    btc: { price: number };
    canisterAddress: string;
    rune: {
      id: string;
      symbol: string;
      decimals: number;
      priceSats: number;
    };
    staked: {
      id: string;
      symbol: string;
      decimals: number;
    };
    historicRates: Array<{ rate: number; timestamp: string; block: number }>;
    apy: {
      window: number;
      monthly: number;
      daily: number;
      yearly: number;
    };
  };
  fetchStatus: 'idle' | 'fetching';
  dataUpdatedAt: number;
};

type BalanceQuery = {
  data?: number;
  fetchStatus: 'idle' | 'fetching';
};

type ActivityQuery = {
  data?: Array<{
    event_type: 'input' | 'output';
    outpoint: string;
    amount: string;
    timestamp: string;
    rune_id: string;
    decimals: number;
  }>;
  fetchStatus: 'idle' | 'fetching';
};

const mockLaserState: LaserState = {
  address: undefined,
  isInitializing: false,
  isConnecting: false,
};

const mockProtocolQuery = vi.fn<() => ProtocolQuery>();
const mockBalanceQuery = vi.fn<() => BalanceQuery>();
const mockActivityQuery = vi.fn<() => ActivityQuery>();

vi.mock('@omnisat/lasereyes-react', () => ({
  useLaserEyes: (selector?: (state: LaserState) => unknown) =>
    selector ? selector(mockLaserState) : mockLaserState,
}));

vi.mock('@/hooks/api/useProtocol', () => ({
  useProtocol: () => mockProtocolQuery(),
}));

vi.mock('@/hooks/api/useBalance', () => ({
  useBalance: () => mockBalanceQuery(),
}));

vi.mock('@/hooks/api/useWalletActivity', () => ({
  useWalletActivity: () => mockActivityQuery(),
}));

vi.mock('@/components/privacy/analytics-consent-provider', () => ({
  useAnalytics: () => ({ capture: vi.fn() }),
}));

vi.mock('@/components/share/share-button', () => ({
  ShareButton: () => null,
}));

vi.mock('@/components/ui/token', () => ({
  TokenLogo: ({ logo }: { logo: string }) => <div>{logo}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('recharts', () => ({
  Area: () => null,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const protocolData: ProtocolQuery['data'] = {
  exchangeRate: Number.POSITIVE_INFINITY,
  btc: { price: 100_000 },
  canisterAddress: '',
  rune: {
    id: config.rune.id,
    symbol: config.rune.symbol,
    decimals: config.rune.decimals,
    priceSats: 32,
  },
  staked: {
    id: config.sRune.id,
    symbol: config.sRune.symbol,
    decimals: config.sRune.decimals,
  },
  historicRates: [],
  apy: {
    window: 30,
    monthly: 0.0169,
    daily: 0.00054,
    yearly: 0.2233,
  },
};

function renderPage() {
  return render(<PortfolioPage />);
}

describe('PortfolioPage', () => {
  beforeEach(() => {
    mockLaserState.address = undefined;
    mockLaserState.isInitializing = false;
    mockLaserState.isConnecting = false;

    mockProtocolQuery.mockReturnValue({
      data: protocolData,
      fetchStatus: 'idle',
      dataUpdatedAt: Date.now(),
    });
    mockBalanceQuery.mockReturnValue({
      data: 0,
      fetchStatus: 'idle',
    });
    mockActivityQuery.mockReturnValue({
      data: [],
      fetchStatus: 'idle',
    });
  });

  it('renders skeletons during wallet or protocol loading instead of unavailable text', () => {
    mockLaserState.isInitializing = true;
    mockProtocolQuery.mockReturnValue({
      data: protocolData,
      fetchStatus: 'fetching',
      dataUpdatedAt: 0,
    });
    mockBalanceQuery.mockReturnValue({
      data: undefined,
      fetchStatus: 'fetching',
    });
    mockActivityQuery.mockReturnValue({
      data: undefined,
      fetchStatus: 'fetching',
    });

    const { container } = renderPage();

    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders unavailable only after the protocol has finished without a usable rate', () => {
    renderPage();

    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        'Portfolio values are temporarily unavailable because no exchange rate has been published yet.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders real values once the exchange rate is available', () => {
    mockProtocolQuery.mockReturnValue({
      data: {
        ...protocolData,
        exchangeRate: 1.12818,
      },
      fetchStatus: 'idle',
      dataUpdatedAt: Date.now(),
    });

    renderPage();

    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('1.12818')).toBeInTheDocument();
    expect(screen.getByText('22.33%')).toBeInTheDocument();
  });
});
