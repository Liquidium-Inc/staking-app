import { SUPPORT_PROVIDER_TIMEOUT_MS, SUPPORT_REQUEST_BUDGET_MS } from './constants';

/**
 * Wall-clock budget for one support request's remote reads (mempool, Ordiscan,
 * canister). The Worker gives up after a few seconds, so reads past the
 * deadline are skipped and the response says what it couldn't check.
 */
export type Budget = { deadlineMs: number };

export function createBudget(ms = SUPPORT_REQUEST_BUDGET_MS, nowMs = Date.now()): Budget {
  return { deadlineMs: nowMs + ms };
}

export class BudgetExceededError extends Error {
  constructor() {
    super('support request budget exceeded');
  }
}

/**
 * Runs one remote read, rejecting with BudgetExceededError once its own
 * timeout or the request deadline passes. Past the deadline it isn't started.
 */
export async function withinBudget<T>(
  budget: Budget,
  read: () => Promise<T>,
  timeoutMs = SUPPORT_PROVIDER_TIMEOUT_MS,
): Promise<T> {
  const remainingMs = budget.deadlineMs - Date.now();
  if (remainingMs <= 0) throw new BudgetExceededError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BudgetExceededError()), Math.min(timeoutMs, remainingMs));
  });
  try {
    return await Promise.race([read(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
