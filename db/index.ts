import "server-only";

import { setDefaultResultOrder } from "node:dns";
import { drizzle } from "drizzle-orm/neon-http";

if (process.env.NEON_PREFER_IPV4 === "1") {
  setDefaultResultOrder("ipv4first");
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

export const db = drizzle(databaseUrl);