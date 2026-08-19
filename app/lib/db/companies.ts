import { and, eq, gt, sql } from "drizzle-orm";
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

// Requiring only ONE shared tag (Postgres's && overlap operator) is too
// loose in practice — generic tags like "marketplace" or "b2b" show up
// across wildly unrelated businesses, so a single shared tag produced real
// false-hits in testing (a ride-hailing idea matched cocoa-export
// companies purely because both happened to be tagged "marketplace").
// Requiring at least 2 shared tags is a cheap, meaningful precision bump.
const MIN_SHARED_TAGS = 2;

/**
 * Companies sharing at least MIN_SHARED_TAGS category tags with the given
 * ones, still inside the freshness window — candidates for a cache-hit
 * match pass instead of paying for a fresh live search.
 *
 * One freshness clock per row (last_updated_at), not per column — see
 * docs/db-schema.md for why field-level staleness tracking is overkill
 * for this stage.
 */
export async function findFreshCandidates(categoryTags: string[], limit = 10): Promise<Company[]> {
  if (categoryTags.length < MIN_SHARED_TAGS) return [];
  const db = getDb();
  const tagsLiteral = toPgTextArrayLiteral(categoryTags);
  return db
    .select()
    .from(companies)
    .where(
      and(
        sql`(
          SELECT count(*) FROM unnest(${companies.categoryTags}) AS tag
          WHERE tag = ANY(${tagsLiteral}::text[])
        ) >= ${MIN_SHARED_TAGS}`,
        gt(companies.lastUpdatedAt, ttlCutoff()),
      ),
    )
    .limit(limit);
}

export interface UpsertResult {
  inserted: number;
  failed: number;
  errors: string[];
}

/**
 * Insert newly found companies, or refresh them (bumping last_updated_at)
 * if a company with the same URL already exists. Rows without a URL are
 * always inserted fresh — the unique index only applies where url is set,
 * so there's nothing to conflict against for those.
 *
 * Returns a per-batch result instead of throwing on the first failure —
 * one bad row (e.g. a duplicate name-only entry with no URL to key on)
 * shouldn't sink the whole batch, and the caller needs to know what
 * actually happened rather than trust a silent success.
 */
export async function upsertCompanies(rows: NewCompany[]): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, failed: 0, errors: [] };
  if (rows.length === 0) return result;

  const db = getDb();
  for (const row of rows) {
    try {
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
      result.inserted++;
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${row.name}: ${message}`);
    }
  }
  return result;
}

/** Every company's id + current category_tags — used by the Category
 * Tagging System's backfill (app/lib/backfill.ts) to re-normalize rows
 * inserted before the shared taxonomy existed. */
export async function listCompanyTags(limit = 500): Promise<{ id: string; categoryTags: string[] }[]> {
  const db = getDb();
  return db.select({ id: companies.id, categoryTags: companies.categoryTags }).from(companies).limit(limit);
}

/** Overwrites just category_tags for one row — deliberately doesn't
 * touch last_updated_at. Re-tagging isn't re-verifying the underlying
 * company data, so it shouldn't reset the cache-freshness clock. */
export async function updateCategoryTags(id: string, categoryTags: string[]): Promise<void> {
  const db = getDb();
  await db.update(companies).set({ categoryTags }).where(eq(companies.id, id));
}
