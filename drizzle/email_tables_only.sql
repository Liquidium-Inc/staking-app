-- Add email_subscriptions table
CREATE TABLE IF NOT EXISTS "email_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "email_subscriptions_address_email_unique" UNIQUE("address", "email")
);

-- Add email_verifications table
CREATE TABLE IF NOT EXISTS "email_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "email_verifications_token_unique" UNIQUE("token")
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_email_subscriptions_address" ON "email_subscriptions"("address");
CREATE INDEX IF NOT EXISTS "idx_email_subscriptions_email" ON "email_subscriptions"("email");
CREATE INDEX IF NOT EXISTS "idx_email_subscriptions_verified_active" ON "email_subscriptions"("is_verified", "is_active");
CREATE INDEX IF NOT EXISTS "idx_email_verifications_token" ON "email_verifications"("token");
CREATE INDEX IF NOT EXISTS "idx_email_verifications_email" ON "email_verifications"("email");
CREATE INDEX IF NOT EXISTS "idx_email_verifications_expires_at" ON "email_verifications"("expires_at");