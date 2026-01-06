import axios from 'axios';
import Big from 'big.js';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { config as publicConfig } from '@/config/public';
import { SATOSHIS_PER_BTC } from '@/lib/bitcoin-units';
import { logger } from '@/lib/logger';

type MempoolStats = {
  tx_count: number;
  funded_txo_count: number;
  funded_txo_sum: number;
  spent_txo_count: number;
  spent_txo_sum: number;
};

type MempoolAddressResponse = {
  address: string;
  chain_stats: MempoolStats;
  mempool_stats: MempoolStats;
};

const getBaseMempoolUrl = () => publicConfig.mempool.url.replace(/\/$/, '');

const querySchema = z.object({
  address: z.string().trim().min(1, 'Address is required'),
});

const MEMPOOL_TIMEOUT_MS = 10_000;
const ERROR_INVALID_QUERY = 'Invalid query parameters';
const ERROR_FETCH_FAILED = 'Failed to fetch BTC balance';
const ERROR_FETCH_TIMEOUT = 'BTC balance request timed out';

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parseResult = querySchema.safeParse({ address: searchParams.get('address') });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: ERROR_INVALID_QUERY, details: parseResult.error.issues },
      { status: 400 },
    );
  }

  const { address } = parseResult.data;

  try {
    const baseUrl = getBaseMempoolUrl();
    const { data } = await axios.get<MempoolAddressResponse>(`${baseUrl}/api/address/${address}`, {
      timeout: MEMPOOL_TIMEOUT_MS,
    });

    const chainBalanceSats = new Big(data.chain_stats.funded_txo_sum).minus(
      data.chain_stats.spent_txo_sum,
    );
    const mempoolBalanceSats = new Big(data.mempool_stats.funded_txo_sum).minus(
      data.mempool_stats.spent_txo_sum,
    );
    const totalBalanceSats = chainBalanceSats.plus(mempoolBalanceSats);

    return NextResponse.json({
      address: data.address,
      balance_sats: totalBalanceSats.round(0, 0).toFixed(0),
      balance_btc: totalBalanceSats.div(SATOSHIS_PER_BTC).toFixed(8),
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      if (isTimeout) {
        logger.warn('BTC balance request timed out', { address, error: error.message });
        return NextResponse.json({ error: ERROR_FETCH_TIMEOUT }, { status: 504 });
      }
    }
    logger.error('Failed to fetch BTC balance', { address, error });
    return NextResponse.json({ error: ERROR_FETCH_FAILED }, { status: 502 });
  }
};
