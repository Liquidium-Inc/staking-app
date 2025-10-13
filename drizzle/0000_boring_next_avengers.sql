CREATE TABLE IF NOT EXISTS "email_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "email_subscriptions_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"purpose" varchar(20) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "email_verifications_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pool_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"staked" numeric NOT NULL,
	"balance" numeric NOT NULL,
	"block" integer NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "pool_balances_block_unique" UNIQUE("block")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stakes" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"address" varchar(255) NOT NULL,
	"amount" numeric NOT NULL,
	"sAmount" numeric NOT NULL,
	"block" integer,
	"txid" varchar(255) NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"psbt" text,
	CONSTRAINT "stakes_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"tokenSymbol" varchar(50) NOT NULL,
	"balance" numeric NOT NULL,
	"block" integer NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unstakes" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"address" varchar(255) NOT NULL,
	"amount" numeric NOT NULL,
	"sAmount" numeric NOT NULL,
	"block" integer,
	"txid" varchar(255) NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"claimTx" varchar(255),
	"claimTxBlock" integer,
	"psbt" text,
	CONSTRAINT "unstakes_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_auth_nonces" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"nonce" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "wallet_auth_nonces_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_active_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "wallet_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "email_subscriptions_email_idx" ON "email_subscriptions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_verifications_address_idx" ON "email_verifications" USING btree ("address");--> statement-breakpoint
CREATE INDEX "email_verifications_email_idx" ON "email_verifications" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_verifications_expires_at_idx" ON "email_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "wallet_auth_nonces_expires_at_idx" ON "wallet_auth_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_sessions_address_unique" ON "wallet_sessions" USING btree ("address");--> statement-breakpoint
CREATE INDEX "wallet_sessions_expires_at_idx" ON "wallet_sessions" USING btree ("expires_at");