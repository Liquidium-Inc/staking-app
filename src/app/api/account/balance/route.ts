import type { NextRequest } from 'next/server';

import { config } from '@/config/config';
import { protectPublicBalanceRoute } from '@/lib/public-balance-route';

import { mempoolBalances } from './mempoolBalances';
import { walletBalances } from './walletBalances';

const getBalance = config.protocol.mempoolBalance ? mempoolBalances : walletBalances;

export const GET = (request: NextRequest) =>
  protectPublicBalanceRoute(request, 'balance', getBalance);
