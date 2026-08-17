import { and, gt, sql } from "drizzle-orm";
import { getDb } from "./client";
import { companies, type Company, type NewCompany } from "./schema";

const DEFAULT_TTL_DAYS = 30;

function ttlCutoff(): Date {
  const days = Number(process.env.COMPANY_CACHE_TTL_DAYS) || DEFAULT_TTL_DAYS;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Drizzle's sql`` template expands a plain JS array into a comma-separated
// parameter LIST ($1, $2, $3) — fine for an IN (...) clause, wrong for the
// && overlap operator, which needs one array-typed parameter. Building the
// Postgres array literal ourselves and casting it collapses that back down
// to a single string parameter that ::text[] can parse correctly.
function toPgTextArrayLiteral(values: string[]): string {
  const escaped = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
}

/**
 * Companies whose category tags overlap the given tags and whose data is
 * still inside the freshness window — candidates for a cache-hit match
 * pass instead of paying for a fresh live search.
 *
 * One freshness clock per row (last_updated_at), not per column — see
 * docs/db-schema.md for why field-level staleness tracking is overkill
 * for this stage.
 */
export async function findFreshCandidates(categoryTags: string[], limit = 10): Promise<Company[]> {
  if (categoryTags.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(companies)
    .where(
      and(
        sql`${companies.categoryTags} && ${toPgTextArrayLiteral(categoryTags)}::text[]`,
        gt(companies.lastUpdatedAt, ttlCutoff()),
      ),
    )
    .limit(limit);
}

/**
 * Insert newly found companies, or refresh them (bumping last_updated_at)
 * if a company with the same URL already exists. Rows without a URL are
 * always inserted fresh — the unique index only applies where url is set,
 * so there's nothing to conflict against for those.
 */
export async function upsertCompanies(rows: NewCompany[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  for (const row of rows) {
    if (row.url) {
      await db
        .insert(companies)
        .values(row)
        .onConflictDoUpdate({
          target: companies.url,
          targetWhere: sql`${companies.url} is not null`,
          set: { ...row, lastUpdatedAt: new Date() },
        });
    } else {
      await db.insert(companies).values(row);
    }
  }
}
