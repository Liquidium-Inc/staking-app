import { z } from 'zod';

import { config as publicConfig } from '@/config/public';

import { createBudget, type Budget } from './budget';
import {
  MS_PER_SECOND,
  SUPPORT_LIST_DEFAULT_LIMIT,
  SUPPORT_LIST_MAX_LIMIT,
  SupportErrorCode,
} from './constants';
import {
  loadActivityHistory,
  readStakes,
  readUnstakes,
  resolveUnstakeChains,
  toStakeFacts,
  toUnstakeFacts,
} from './facts';
import { stakeItem, unstakeItem } from './summary';
import { StakeState, UnstakeState } from './types';

export const SUPPORT_LIST_KINDS = ['stakes', 'unstakes', 'activity'] as const;
type ListKind = (typeof SUPPORT_LIST_KINDS)[number];

const MAX_CURSOR_LENGTH = 512;
const MAX_QUERY_LENGTH = 128;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const listRequestSchema = z.object({
  kind: z.string().max(64),
  filter: z.unknown().optional(),
  cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
  limit: z.number().int().positive().optional(),
});

const dateBound = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const oneOrMany = <Value extends z.ZodType>(value: Value) =>
  z.union([value, z.array(value).min(1)]);
const commonFilter = {
  from: dateBound.optional(),
  to: dateBound.optional(),
  q: z.string().trim().min(1).max(MAX_QUERY_LENGTH).optional(),
};

const FILTER_SCHEMAS = {
  stakes: z.strictObject({ state: oneOrMany(z.enum(StakeState)).optional(), ...commonFilter }),
  unstakes: z.strictObject({ state: oneOrMany(z.enum(UnstakeState)).optional(), ...commonFilter }),
  activity: z.strictObject(commonFilter),
} satisfies Record<ListKind, z.ZodType>;

type ListFilter = { states?: string[]; fromMs?: number; toMs?: number; q?: string };
type Cursor = { ts: number; key: number | string };
export type ListRequest = {
  kind: ListKind;
  filter: ListFilter;
  cursor: Cursor | null;
  limit: number;
};

const isDateOnly = (value: string) => !value.includes('T');

function encodeCursor({ ts, key }: Cursor) {
  return Buffer.from(JSON.stringify([ts, key])).toString('base64url');
}

function decodeCursor(cursor: string): Cursor | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [ts, key] = value;
    if (!Number.isFinite(ts) || !(typeof key === 'string' || Number.isFinite(key))) return null;
    return { ts, key };
  } catch {
    return null;
  }
}

/** Validates kind, filter and cursor; returns the error code to answer with otherwise. */
export function parseListRequest(
  body: z.infer<typeof listRequestSchema>,
): { request: ListRequest } | { error: SupportErrorCode } {
  if (!(SUPPORT_LIST_KINDS as readonly string[]).includes(body.kind)) {
    return { error: SupportErrorCode.BadKind };
  }
  const kind = body.kind as ListKind;

  const parsed = FILTER_SCHEMAS[kind].safeParse(body.filter ?? {});
  if (!parsed.success) return { error: SupportErrorCode.BadFilter };
  const { state, from, to, q } = parsed.data as {
    state?: string | string[];
    from?: string;
    to?: string;
    q?: string;
  };

  const cursor = body.cursor === undefined ? null : decodeCursor(body.cursor);
  if (body.cursor !== undefined && !cursor) return { error: SupportErrorCode.BadRequest };

  return {
    request: {
      kind,
      filter: {
        states: state === undefined ? undefined : [state].flat(),
        fromMs: from === undefined ? undefined : Date.parse(from),
        // Inclusive: a bare date covers that whole UTC day.
        toMs: to === undefined ? undefined : Date.parse(to) + (isDateOnly(to) ? MS_PER_DAY - 1 : 0),
        q,
      },
      cursor,
      limit: Math.min(body.limit ?? SUPPORT_LIST_DEFAULT_LIMIT, SUPPORT_LIST_MAX_LIMIT),
    },
  };
}

type ListEntry<T> = Cursor & { state?: string; ids: (string | null)[]; value: T };

const newestFirst = (left: Cursor, right: Cursor) =>
  right.ts - left.ts || (left.key < right.key ? 1 : left.key > right.key ? -1 : 0);

/** Filters, orders newest first (creation time, then id) and cuts one page after the cursor. */
export function pageEntries<T>(entries: ListEntry<T>[], request: ListRequest) {
  const { filter, cursor, limit } = request;
  const matching = entries
    .filter(
      (entry) =>
        (!filter.states || (entry.state !== undefined && filter.states.includes(entry.state))) &&
        (filter.fromMs === undefined || entry.ts >= filter.fromMs) &&
        (filter.toMs === undefined || entry.ts <= filter.toMs) &&
        (filter.q === undefined || entry.ids.includes(filter.q)),
    )
    .sort(newestFirst);
  const rest = cursor ? matching.filter((entry) => newestFirst(cursor, entry) < 0) : matching;
  const page = rest.slice(0, limit);
  const last = page.at(-1);
  return {
    values: page.map((entry) => entry.value),
    total: matching.length,
    nextCursor: rest.length > limit && last ? encodeCursor(last) : undefined,
  };
}

function response<T>(
  items: unknown[],
  page: ReturnType<typeof pageEntries<T>>,
  totalExact: boolean,
) {
  return {
    items,
    total: page.total,
    totalExact,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    // Items carry txids only; the address's own wallet value is in /context.
    values: [],
  };
}

/**
 * One page of facts. A state filter needs every row's state, so all unsettled
 * rows are checked on chain; otherwise only the page's rows are.
 */
async function pageFacts<
  Row extends { id: number; timestamp: Date },
  Fact extends { state: string },
>(
  rows: Row[],
  request: ListRequest,
  ids: (row: Row) => (string | null)[],
  toFacts: (rows: Row[]) => Promise<{ items: Fact[]; statesExact: boolean }>,
) {
  const entry = <T>(row: Row, value: T, state?: string): ListEntry<T> => ({
    ts: row.timestamp.getTime(),
    key: row.id,
    state,
    ids: ids(row),
    value,
  });
  if (!request.filter.states) {
    const page = pageEntries(
      rows.map((row) => entry(row, row)),
      request,
    );
    const { items } = await toFacts(page.values);
    return { page: { ...page, values: items }, statesExact: true };
  }
  const { items, statesExact } = await toFacts(rows);
  const page = pageEntries(
    items.map((fact, index) => entry(rows[index], fact, fact.state)),
    request,
  );
  return { page, statesExact };
}

/**
 * One page of the address's stakes, unstakes or rune activity. Our records are
 * read in full (per address, user-initiated) so totals and pages are exact;
 * chain checks only run where the page or a state filter needs them.
 */
export async function listSupportItems(
  address: string,
  request: ListRequest,
  nowMs = Date.now(),
  budget: Budget = createBudget(),
) {
  if (request.kind === 'stakes') {
    const { rows, totalExact } = await readStakes(address);
    const { page, statesExact } = await pageFacts(
      rows,
      request,
      (row) => [row.txid],
      (some) => toStakeFacts(some, budget),
    );
    // A state filter is only exact when every unsettled row's state was confirmed on chain.
    return response(page.values.map(stakeItem), page, totalExact && statesExact);
  }

  if (request.kind === 'unstakes') {
    const { rows, totalExact } = await readUnstakes(address);
    const { page, statesExact } = await pageFacts(
      rows,
      request,
      (row) => [row.txid, row.claimTx],
      (some) => toUnstakeFacts(some, budget),
    );
    const withdrawTimeMs = publicConfig.protocol.withdrawTime * MS_PER_SECOND;
    const items = (await resolveUnstakeChains(page.values, budget)).map((unstake) =>
      unstakeItem(unstake, withdrawTimeMs, nowMs),
    );
    return response(items, page, totalExact && statesExact);
  }

  const history = await loadActivityHistory(address, budget);
  const page = pageEntries(
    history.items.map((activity) => ({
      ts: new Date(activity.ts).valueOf(),
      key: `${activity.token}:${activity.direction}:${activity.outpoint}`,
      ids: [activity.outpoint, activity.outpoint.split(':')[0]],
      value: activity,
    })),
    request,
  );
  return response(page.values, page, history.totalExact);
}
