ALTER TABLE "stakes" ADD COLUMN "claimedAt" timestamp;--> statement-breakpoint
ALTER TABLE "stakes" ADD COLUMN "invalidatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "claimedAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "invalidatedAt" timestamp;