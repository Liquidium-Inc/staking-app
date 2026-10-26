ALTER TABLE "stakes" ADD COLUMN "invalidatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "unstakes" ADD COLUMN "invalidatedAt" timestamp;