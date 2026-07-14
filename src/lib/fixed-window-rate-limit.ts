import type { Redis } from 'ioredis';

const INCREMENT_WITH_EXPIRY_SCRIPT = `
local count = redis.call('incr', KEYS[1])
if count == 1 then
  redis.call('pexpire', KEYS[1], ARGV[1])
end
return count
`;

export async function consumeFixedWindowRateLimit(
  client: Pick<Redis, 'eval'>,
  key: string,
  windowMs: number,
): Promise<number> {
  const count = await client.eval(INCREMENT_WITH_EXPIRY_SCRIPT, 1, key, windowMs.toString());
  if (typeof count !== 'number') throw new Error('Invalid rate limit response');
  return count;
}
