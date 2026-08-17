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
    const client = postgres(url, { max: 1 }); // serverless: one connection per invocation
    instance = drizzle(client, { schema });
  }
  return instance;
}
