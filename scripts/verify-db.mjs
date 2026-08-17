import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const columns = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'companies'
  ORDER BY ordinal_position
`;
console.log(`COLUMNS (${columns.length}):`);
console.table(columns);

const indexes = await sql`
  SELECT indexname FROM pg_indexes WHERE tablename = 'companies'
`;
console.log("INDEXES:");
for (const idx of indexes) console.log(" -", idx.indexname);

const [inserted] = await sql`
  INSERT INTO companies (
    name, description, url, source, region, country, category_tags,
    year_founded, company_stage, target_audience, customer_type,
    business_model, pricing, core_problem, key_features,
    value_proposition, positioning, primary_competitors,
    competitive_advantage, weaknesses, opportunity_gap, funding_stage,
    traction_notes, notable_partnerships, key_takeaway, raw_snippet
  )
  VALUES (
    'Test Co', 'A test company for schema verification', 'https://example.com/test',
    'Web Search', 'african', 'Nigeria', ARRAY['fintech', 'payments'],
    2021, 'growth-stage', 'Freelancers and remote workers', 'B2C',
    'subscription', '$10/mo', 'Getting paid in USD without a US bank account',
    ARRAY['USD virtual account', 'invoicing', 'instant conversion'],
    'Fastest way for African freelancers to receive USD', 'Positioned as the neobank for African remote workers',
    ARRAY['Grey', 'Chipper Cash'], 'Strong brand trust, fast KYC', 'Limited to a few countries',
    'Could expand into underserved francophone markets', 'seed',
    '$2M raised, 50k users', 'Partnered with Flutterwave', 'Solid incumbent, but geographic gaps remain',
    'Test Co raises $2M seed round for African payments infrastructure.'
  )
  RETURNING id, name, country, year_founded, customer_type, opportunity_gap
`;
console.log("INSERTED:", inserted);

await sql`DELETE FROM companies WHERE id = ${inserted.id}`;
const remaining = await sql`SELECT count(*)::int FROM companies`;
console.log("ROWS REMAINING AFTER CLEANUP:", remaining[0].count);

await sql.end();
