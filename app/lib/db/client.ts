import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | null = null;

/** Lazily constructed, same pattern as getOpenAI() — a missing env var
 * surfaces as a clean error at call time, not a boot crash. */
export function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    const client = postgres(url, {
      max: 1, // serverless: one connection per invocation
      // Neon's pooled endpoint (the `-pooler` hostname this project's
      // DATABASE_URL already correctly uses for serverless) runs
      // PgBouncer in transaction mode, which does not support
      // server-side prepared statements (Neon's own docs: "connections
      // are returned to the pool after each transaction... this limits
      // ... PREPARE/DEALLOCATE"). postgres.js defaults to prepare:
      // true — sending every query as a prepared statement — which is
      // exactly incompatible with that. Confirmed live: the admin
      // analytics page (the heaviest query load in the app, several
      // sequential/parallel queries per load) started 500ing in
      // production the moment more queries were added to it, while an
      // identical local script against the same database worked fine
      // (a local script doesn't hit Neon's pooler the same way a
      // warm, reused Vercel lambda instance does). Disabling prepared
      // statements is Neon's own documented fix for exactly this.
      prepare: false,
    });
    instance = drizzle(client, { schema });
  }
  return instance;
}
