import axios from 'axios';
import Big from 'big.js';
import { NextResponse } from 'next/server';

import { config as publicConfig } from '@/config/public';

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

const BTC_BALANCE_DECIMALS = 100_000_000;

const getBaseMempoolUrl = () => publicConfig.mempool.url.replace(/\/$/, '');

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  const baseUrl = getBaseMempoolUrl();
  const { data } = await axios.get<MempoolAddressResponse>(`${baseUrl}/api/address/${address}`);

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
    balance_btc: totalBalanceSats.div(BTC_BALANCE_DECIMALS).toFixed(8),
  });
};
