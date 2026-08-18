import { eq, sql } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    chain: text("chain").notNull(),
    address: text("address").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("wallets_chain_address_unique").on(table.chain, table.address),
    uniqueIndex("wallets_one_primary_per_user")
      .on(table.userId)
      .where(sql`${table.isPrimary} = true`),
    index("wallets_user_id_idx").on(table.userId),
  ]
);

export const authChallenges = pgTable("auth_challenges", {
  nonce: text("nonce").primaryKey(),
  address: text("address").notNull(),
  domain: text("domain").notNull(),
  uri: text("uri").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});

export const goalMirrors = pgTable(
  "goal_mirrors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    cluster: text("cluster").notNull(),
    accountAddress: text("account_address").notNull(),
    ownerAddress: text("owner_address").notNull(),
    goalId: numeric("goal_id", { precision: 20, scale: 0 }).notNull(),
    fundingMint: text("funding_mint").notNull(),
    vaultToken: text("vault_token").notNull(),
    maximumBudget: numeric("maximum_budget", { precision: 20, scale: 0 }).notNull(),
    vaultBalance: numeric("vault_balance", { precision: 20, scale: 0 }).notNull(),
    status: text("status").notNull(),
    lastObservedSlot: numeric("last_observed_slot", { precision: 20, scale: 0 }),
    onChainCreatedAt: timestamp("on_chain_created_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("goal_mirrors_cluster_account_address_unique").on(
      table.cluster,
      table.accountAddress
    ),
    uniqueIndex("goal_mirrors_cluster_owner_goal_id_unique").on(
      table.cluster,
      table.ownerAddress,
      table.goalId
    ),
    index("goal_mirrors_wallet_id_idx").on(table.walletId),
  ]
);

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    cluster: text("cluster").notNull(),
    goalId: numeric("goal_id", { precision: 20, scale: 0 }).notNull(),
    goalAccountPda: text("goal_account_pda").notNull(),
    marketplace: text("marketplace").notNull(),
    externalListingId: text("external_listing_id").notNull(),
    title: text("title").notNull(),
    imageUrl: text("image_url"),
    targetPrice: numeric("target_price", { precision: 20, scale: 6 }).notNull(),
    currency: text("currency").notNull(),
    canonicalName: text("canonical_name"),
    setName: text("set_name"),
    cardNumber: text("card_number"),
    year: numeric("year", { precision: 4, scale: 0 }),
    language: text("language"),
    finish: text("finish"),
    grader: text("grader"),
    grade: numeric("grade", { precision: 3, scale: 0 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("savings_goals_wallet_cluster_goal_id_unique").on(
      table.walletId,
      table.cluster,
      table.goalId
    ),
    uniqueIndex("savings_goals_cluster_pda_unique").on(
      table.cluster,
      table.goalAccountPda
    ),
    uniqueIndex("savings_goals_user_marketplace_listing_unique").on(
      table.userId,
      table.marketplace,
      table.externalListingId
    ),
    index("savings_goals_wallet_id_idx").on(table.walletId),
    index("savings_goals_user_id_idx").on(table.userId),
    index("savings_goals_cluster_pda_idx").on(
      table.cluster,
      table.goalAccountPda
    ),
  ]
);
