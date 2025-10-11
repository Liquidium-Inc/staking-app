CREATE TABLE "email_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "email_verifications_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "pool_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"staked" numeric NOT NULL,
	"balance" numeric NOT NULL,
	"block" integer NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "pool_balances_block_unique" UNIQUE("block")
);
--> statement-breakpoint
CREATE TABLE "stakes" (
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
CREATE TABLE "token_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"tokenSymbol" varchar(50) NOT NULL,
	"balance" numeric NOT NULL,
	"block" integer NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unstakes" (
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
