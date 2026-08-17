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
