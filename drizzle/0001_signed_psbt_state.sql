ALTER TABLE "stakes" ADD COLUMN "prepareTxid" varchar(255);--> statement-breakpoint
ALTER TABLE "stakes" ADD COLUMN "claimedAt" timestamp;--> statement-breakpoint
ALTER TABLE "stakes" ADD COLUMN "broadcastAt" timestamp;--> statement-breakpoint
ALTER TABLE "stakes" ADD COLUMN "invalidatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "stakes" ADD COLUMN "lastCheckedAt" timestamp;--> statement-breakpoint
ALTER TABLE "stakes" ADD COLUMN "supersededAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "prepareTxid" varchar(255);--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "claimedAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "broadcastAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "invalidatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "lastCheckedAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "supersededAt" timestamp;--> statement-breakpoint
ALTER TABLE "stakes" ADD CONSTRAINT "stakes_prepareTxid_unique" UNIQUE("prepareTxid");--> statement-breakpoint
ALTER TABLE "unstakes" ADD CONSTRAINT "unstakes_prepareTxid_unique" UNIQUE("prepareTxid");