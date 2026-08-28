CREATE TABLE "goal_mirrors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"cluster" text NOT NULL,
	"account_address" text NOT NULL,
	"owner_address" text NOT NULL,
	"goal_id" numeric(20, 0) NOT NULL,
	"funding_mint" text NOT NULL,
	"vault_token" text NOT NULL,
	"maximum_budget" numeric(20, 0) NOT NULL,
	"vault_balance" numeric(20, 0) NOT NULL,
	"status" text NOT NULL,
	"last_observed_slot" numeric(20, 0),
	"on_chain_created_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "wallets_one_primary_per_user";--> statement-breakpoint
ALTER TABLE "goal_mirrors" ADD CONSTRAINT "goal_mirrors_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_mirrors_cluster_account_address_unique" ON "goal_mirrors" USING btree ("cluster","account_address");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_mirrors_cluster_owner_goal_id_unique" ON "goal_mirrors" USING btree ("cluster","owner_address","goal_id");--> statement-breakpoint
CREATE INDEX "goal_mirrors_wallet_id_idx" ON "goal_mirrors" USING btree ("wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_one_primary_per_user" ON "wallets" USING btree ("user_id") WHERE "wallets"."is_primary" = true;