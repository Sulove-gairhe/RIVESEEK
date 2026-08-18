CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"cluster" text NOT NULL,
	"goal_id" numeric(20, 0) NOT NULL,
	"goal_account_pda" text NOT NULL,
	"marketplace" text NOT NULL,
	"external_listing_id" text NOT NULL,
	"title" text NOT NULL,
	"image_url" text,
	"target_price" numeric(20, 6) NOT NULL,
	"currency" text NOT NULL,
	"canonical_name" text,
	"set_name" text,
	"card_number" text,
	"year" numeric(4, 0),
	"language" text,
	"finish" text,
	"grader" text,
	"grade" numeric(3, 0),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goals_wallet_cluster_goal_id_unique" ON "savings_goals" USING btree ("wallet_id","cluster","goal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goals_cluster_pda_unique" ON "savings_goals" USING btree ("cluster","goal_account_pda");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goals_user_marketplace_listing_unique" ON "savings_goals" USING btree ("user_id","marketplace","external_listing_id");--> statement-breakpoint
CREATE INDEX "savings_goals_wallet_id_idx" ON "savings_goals" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_goals_cluster_pda_idx" ON "savings_goals" USING btree ("cluster","goal_account_pda");
