import { trace } from '@opentelemetry/api';
import dedent from 'dedent';
import { Redis } from 'ioredis';

import { config } from '@/config/config';
import { spanWrap } from '@/lib/tracing';

const tracer = trace.getTracer('providers-redis');

export const client = config.db.redis ? new Redis(config.db.redis) : null;

if (!client) {
  console.warn('Redis is disabled so no locking mechanism will be implemented.');
  console.warn('Some transactions may revert');
}

async function lockUTXO(utxo: string, value: string, expiration = 60) {
  return await spanWrap(tracer, 'lockUtxo', async (span) => {
    span.setAttribute('utxo', utxo);

    if (!client) return true;

    const key = `utxo:${utxo}`;
    const response = await client.set(key, value, 'EX', expiration, 'NX');
    return response === 'OK';
  });
}

async function extendLockUtxos(utxos: string[], value: string, expiration = 1800) {
  return await spanWrap(tracer, 'extendLockUtxos', async () => {
    if (!client || utxos.length === 0) return true;

    const script = dedent`
    local success = true
    for i, key in ipairs(KEYS) do
      if redis.call('get', key) ~= ARGV[1] then
        success = false
        break
      end
    end
    
    if success then
      for i, key in ipairs(KEYS) do
        redis.call('expire', key, ARGV[2])
      end
      return 1
    else
      return 0
    end
  `;

    const keys = utxos.map((utxo) => `utxo:${utxo}`);
    const response = await client.eval(script, keys.length, ...keys, value, expiration.toString());
    return response === 1;
  });
}

async function freeUTXOs(utxos: string[], value: string) {
  return await spanWrap(tracer, 'freeUTXOs', async (_span) => {
    if (!client || utxos.length === 0) return true;

    const script = dedent`
    local success = true
    for i, key in ipairs(KEYS) do
      if redis.call('get', key) ~= ARGV[1] then
        success = false
        break
      end
    end
    
    if success then
      for i, key in ipairs(KEYS) do
        redis.call('del', key)
      end
      return 1
    else
      return 0
    end
  `;

    const keys = utxos.map((utxo) => `utxo:${utxo}`);
    const response = await client.eval(script, keys.length, ...keys, value);
    return response === 1;
  });
}

export const redis = {
  client,
  utxo: {
    lock: lockUTXO,
    extend: extendLockUtxos,
    free: freeUTXOs,
  },
};
