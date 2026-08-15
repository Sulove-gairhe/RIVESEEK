import { eq } from "drizzle-orm"; // 1. Import eq
import {
  boolean,
  index,
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
    // 2. Wrap with eq(table.isPrimary, true)
    uniqueIndex("wallets_one_primary_per_user")
      .on(table.userId)
      .where(eq(table.isPrimary, true)),
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
