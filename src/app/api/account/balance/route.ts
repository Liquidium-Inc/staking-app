import { config } from '@/config/config';

import { mempoolBalances } from './mempoolBalances';
import { walletBalances } from './walletBalances';

export const GET = config.protocol.mempoolBalance ? mempoolBalances : walletBalances;
