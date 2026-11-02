import { db } from '@/db';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';

import { createBudget, withinBudget } from './budget';

// The exchange-rate pusher runs every 10 minutes; three missed runs is unhealthy.
export const EXCHANGE_RATE_PUSH_MAX_AGE_MS = 30 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

type HealthCheck = { ok: boolean; detail?: string };

async function check(run: () => Promise<HealthCheck>): Promise<HealthCheck> {
  try {
    return await run();
  } catch {
    return { ok: false, detail: 'unreachable' };
  }
}

export async function getSupportHealth(nowMs = Date.now()) {
  const budget = createBudget();
  const latestSnapshot = withinBudget(budget, () => db.poolBalance.getLatest());
  const [database, exchangeRatePush, mempoolCheck, canisterCheck] = await Promise.all([
    check(async () => {
      await latestSnapshot;
      return { ok: true };
    }),
    check(async () => {
      const latest = await latestSnapshot;
      if (!latest) return { ok: false, detail: 'no exchange rate snapshot recorded' };
      const ageMs = nowMs - latest.timestamp.getTime();
      return {
        ok: ageMs <= EXCHANGE_RATE_PUSH_MAX_AGE_MS,
        detail: `last exchange rate snapshot ${Math.floor(ageMs / MS_PER_MINUTE)} min ago`,
      };
    }),
    check(async () => {
      const tip = await withinBudget(budget, () => mempool.blocks.getBlocksTipHeight());
      return { ok: true, detail: `tip ${tip}` };
    }),
    check(async () => {
      await withinBudget(budget, () => canister.getExchangeRate());
      return { ok: true };
    }),
  ]);

  const checks = {
    database,
    exchangeRatePush,
    mempool: mempoolCheck,
    canister: canisterCheck,
  };
  return { ok: Object.values(checks).every((entry) => entry.ok), checks };
}
