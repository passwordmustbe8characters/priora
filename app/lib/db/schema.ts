import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Phase 2 — Company Database Schema (see docs/db-schema.md).
 *
 * Doubles as a market-research record, not just a competitor-matching
 * cache — see docs/db-schema.md for the full reasoning on what's included
 * vs deliberately left out from the broader research-template column set
 * this was expanded from.
 *
 * `region` is set by our own ingestion pipeline (which Source Ingestion
 * track found it) so it's safe as a strict enum. `customerType` and
 * `companyStage` will be filled in by LLM extraction, so they're plain
 * text — a rigid enum would throw insert errors the moment the model
 * phrases something slightly differently than expected. Enforcing a
 * controlled vocabulary on those is the Category Tagging System
 * component's job, not this one.
 *
 * Dedup/upsert logic during ingestion is the Caching Layer component's
 * job, not this one — this component is just the storage shape.
 */

export const regionEnum = pgEnum("region", ["western", "african", "global"]);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Identity
    name: text("name").notNull(),
    description: text("description").notNull(),
    url: text("url"),
    source: text("source").notNull(), // e.g. "Product Hunt", "Crunchbase", "Web Search"
    region: regionEnum("region").notNull().default("global"),
    country: text("country"), // more granular than region, e.g. "Nigeria", "Kenya"
    categoryTags: text("category_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    yearFounded: integer("year_founded"),
    companyStage: text("company_stage"), // e.g. "startup", "growth-stage", "established"

    // Audience & business model
    targetAudience: text("target_audience"),
    customerType: text("customer_type"), // e.g. "B2C", "B2B", "B2B2C"
    businessModel: text("business_model"), // e.g. "subscription", "commission", "marketplace"
    pricing: text("pricing"),

    // Product & positioning
    coreProblem: text("core_problem"), // the problem + their particular angle on solving it
    keyFeatures: text("key_features")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    valueProposition: text("value_proposition"),
    positioning: text("positioning"), // how they frame themselves in the market

    // Competitive analysis
    primaryCompetitors: text("primary_competitors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    competitiveAdvantage: text("competitive_advantage"),
    weaknesses: text("weaknesses"),
    opportunityGap: text("opportunity_gap"), // something a new entrant could exploit

    // Traction & credibility
    fundingStage: text("funding_stage"),
    tractionNotes: text("traction_notes"), // funding amount, users, revenue, growth signals as free text
    notablePartnerships: text("notable_partnerships"),

    // Analysis meta
    keyTakeaway: text("key_takeaway"), // one-sentence conclusion
    rawSnippet: text("raw_snippet"), // source text a claim was pulled from (Phase 3 verification)

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("companies_name_idx").on(table.name),
    index("companies_country_idx").on(table.country),
    index("companies_category_tags_idx").using("gin", table.categoryTags),
    uniqueIndex("companies_url_unique")
      .on(table.url)
      .where(sql`${table.url} IS NOT NULL`),
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

/**
 * Phase 2 — Usage Analytics Dashboard (see docs/analytics.md).
 *
 * One row per POST /api/verdict call. Deliberately does NOT store the
 * raw idea text — this is for spotting aggregate category/outcome
 * patterns, not tracking individual submissions, and there's no reason
 * to hold onto potentially sensitive founder idea text longer than the
 * request needs it.
 *
 * cacheStatus/verdictStatus are plain text, not enums, on purpose — same
 * reasoning as companies.customerType/companyStage: these values are
 * read off route.ts's own existing string literals (X-Cache header
 * values, VerdictStatus), and an enum would force a migration the
 * moment either set of literals changes. outcome IS the one thing this
 * table owns itself, but kept as text too for the same forward-
 * compatibility reason.
 */
export const verdictEvents = pgTable(
  "verdict_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // Null when the request never reached the normalizer (validation_error).
    categoryTags: text("category_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    // 'HIT' (Phase 1 in-memory cache) | 'COMPANY-DB-HIT' | 'MISS' | null
    // (never reached the pipeline's cache check)
    cacheStatus: text("cache_status"),

    // 'exists' | 'partial_overlap' | 'no_clear_match' | null (errored
    // before a verdict was produced)
    verdictStatus: text("verdict_status"),

    // 'success' | 'validation_error' | 'pipeline_error' — this is the
    // free-to-verdict conversion funnel: did a submitted idea actually
    // make it to a verdict, or fall out somewhere first.
    outcome: text("outcome").notNull(),
  },
  (table) => [
    index("verdict_events_created_at_idx").on(table.createdAt),
    index("verdict_events_category_tags_idx").using("gin", table.categoryTags),
  ],
);

export type VerdictEvent = typeof verdictEvents.$inferSelect;
export type NewVerdictEvent = typeof verdictEvents.$inferInsert;
