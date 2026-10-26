/**
 * Backfills the signed-PSBT state columns for rows written by code from before migration 0001.
 * Idempotent; see the deploy procedure in PR #72:
 *   DATABASE_URL=... pnpm db:backfill-signed-psbt
 *   DATABASE_URL=... pnpm db:backfill-signed-psbt --since 2026-11-01T10:00:00Z   # after a rollback
 * Exits with code 1 if any row was skipped (unreadable PSBT) and needs manual repair.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { backfillSignedPsbtState } from '../src/db/backfill-signed-psbt-state';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const sinceIndex = process.argv.indexOf('--since');
const since = sinceIndex === -1 ? undefined : new Date(process.argv[sinceIndex + 1]);
if (since && Number.isNaN(since.getTime())) throw new Error('--since needs an ISO timestamp');

const summary = await backfillSignedPsbtState(drizzle(neon(url)), { since });
console.log(JSON.stringify(summary));
if (Object.values(summary).some((table) => table.skipped.length > 0)) {
  console.error('Some rows have an unreadable PSBT and were left untouched; repair them manually.');
  process.exitCode = 1;
}
