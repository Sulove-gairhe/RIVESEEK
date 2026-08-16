import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { neon, neonConfig } from "@neondatabase/serverless";
import { config } from "dotenv";

neonConfig.fetchFunction = (
  url: string | URL | Request,
  options?: Record<string, unknown>
) => {
  return new Promise<Response>((resolve, reject) => {
    const urlObj = new URL(url.toString());
    const reqOptions: https.RequestOptions = {
      method: (options?.method as string) || "GET",
      headers: (options?.headers as Record<string, string>) || {},
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      timeout: 10000,
      family: 4,
    };
    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
          status: res.statusCode ?? 500,
          statusText: res.statusMessage ?? "",
          json: async () => JSON.parse(data),
          text: async () => data,
        } as unknown as Response);
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    if (options?.body) {
      req.write(options.body);
    }
    req.end();
  });
};

config({ path: ".env.local" });

const runMigration = async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is missing in .env.local");
  }

  const sql = neon(dbUrl);

  const migrationsDir = path.join(process.cwd(), "db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No .sql migration files found in db/migrations.");
    process.exit(0);
  }

  console.log(`⏳ Running ${files.length} migration file(s) on Neon...`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sqlQuery = fs.readFileSync(filePath, "utf8");

    console.log(`Applying ${file}...`);

    await sql.query('CREATE SCHEMA IF NOT EXISTS "drizzle";');

    const statements = sqlQuery
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      const sanitizedStatement = statement.replace(/=\s*\$1/g, "= true");
      try {
        await sql.query(sanitizedStatement);
      } catch (err: unknown) {
        const errorObj = err as { code?: string; message?: string };
        if (
          errorObj?.code === "42P07" ||
          errorObj?.code === "42710" ||
          errorObj?.message?.includes("already exists")
        ) {
          console.log(`  (Skipping existing statement: ${errorObj.message})`);
        } else {
          throw err;
        }
      }
    }
  }

  console.log("✅ Migrations completed successfully!");
  process.exit(0);
};

runMigration().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
