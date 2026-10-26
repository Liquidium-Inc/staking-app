ALTER TABLE "stakes" ADD COLUMN "prepareTxid" varchar(255);--> statement-breakpoint
ALTER TABLE "stakes" ADD COLUMN "claimedAt" timestamp;--> statement-breakpoint
ALTER TABLE "stakes" ADD COLUMN "invalidatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "prepareTxid" varchar(255);--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "claimedAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "invalidatedAt" timestamp;--> statement-breakpoint
-- Backfill: unsettled rows keep their current txid as their identity (one row per txid).
UPDATE "stakes" SET "prepareTxid" = "txid" WHERE "id" IN (SELECT max("id") FROM "stakes" WHERE "block" IS NULL GROUP BY "txid");--> statement-breakpoint
-- Unsettled rows from before this migration may or may not have been broadcast: retire their
-- signatures and mark them as already-stale claims, so they are reconciled against the network.
UPDATE "stakes" SET "claimedAt" = "timestamp" - interval '1 hour', "psbt" = NULL WHERE "block" IS NULL;--> statement-breakpoint
-- Backfill: unsettled rows keep their current txid as their identity (one row per txid).
UPDATE "unstakes" SET "prepareTxid" = "txid" WHERE "id" IN (SELECT max("id") FROM "unstakes" WHERE "block" IS NULL GROUP BY "txid");--> statement-breakpoint
-- Unsettled rows from before this migration may or may not have been broadcast: retire their
-- signatures and mark them as already-stale claims, so they are reconciled against the network.
UPDATE "unstakes" SET "claimedAt" = "timestamp" - interval '1 hour', "psbt" = NULL WHERE "block" IS NULL;--> statement-breakpoint
ALTER TABLE "stakes" ADD CONSTRAINT "stakes_prepareTxid_unique" UNIQUE("prepareTxid");--> statement-breakpoint
ALTER TABLE "unstakes" ADD CONSTRAINT "unstakes_prepareTxid_unique" UNIQUE("prepareTxid");