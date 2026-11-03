CREATE TABLE "terms_acceptances" (
	"address" varchar(255) NOT NULL,
	"version" varchar(32) NOT NULL,
	"accepted_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "terms_acceptances_address_version_pk" PRIMARY KEY("address","version")
);
