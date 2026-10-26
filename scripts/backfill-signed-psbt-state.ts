/**
 * Backfills the signed-PSBT state columns for rows written by code from before migration 0001.
 * Idempotent; run after the migration and again after the deploy (see PR #72):
 *   DATABASE_URL=... pnpm db:backfill-signed-psbt
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { backfillSignedPsbtState } from '../src/db/backfill-signed-psbt-state';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

console.log(JSON.stringify(await backfillSignedPsbtState(drizzle(neon(url)))));
