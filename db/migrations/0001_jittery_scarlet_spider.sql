CREATE TABLE "auth_challenges" (
	"nonce" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"domain" text NOT NULL,
	"uri" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
