import { NextResponse } from 'next/server';

import { client } from '@/providers/redis';

export const GET = async () => {
  if (!client) return NextResponse.json({ error: 'Redis is disabled' }, { status: 500 });
  const keys = await client.keys('utxo:*');
  if (keys.length === 0) return NextResponse.json([]);
  const assigned = await client.mget(keys);

  const entries = keys.map((key, i) => ({
    utxo: key.replace('utxo:', ''),
    address: assigned[i],
  }));

  return NextResponse.json(entries);
};
