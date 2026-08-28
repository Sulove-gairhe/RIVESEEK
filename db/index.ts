import "server-only";

import { setDefaultResultOrder } from "node:dns";
import { drizzle } from "drizzle-orm/neon-http";

if (process.env.NEON_PREFER_IPV4 === "1") {
  setDefaultResultOrder("ipv4first");
}

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. Add it to the deployment environment before using database-backed routes."
    );
  }

  return drizzle(databaseUrl);
}

type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

export function getDb(): Database {
  database ??= createDatabase();
  return database;
}

/**
 * Keep the existing db API while deferring environment validation until a
 * database-backed request actually runs. Next.js imports route modules while
 * collecting build metadata, which must not require runtime-only secrets.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
