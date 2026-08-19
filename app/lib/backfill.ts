import { normalizeCategoryTags } from "./category-tagging";
import { listCompanyTags, updateCategoryTags } from "./db/companies";

/**
 * One-off fix for company rows inserted before the Category Tagging
 * System existed (or before a later taxonomy update) — re-runs their
 * existing categoryTags through the current normalizeCategoryTags() and
 * writes back only what actually changed. Doesn't re-verify or refresh
 * anything else about the row (see updateCategoryTags' own doc comment
 * on why last_updated_at is deliberately untouched) — this only fixes
 * tags, nothing else.
 */
export interface BackfillResult {
  checked: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((t) => setB.has(t));
}

export async function backfillCategoryTags(limit = 500): Promise<BackfillResult> {
  const rows = await listCompanyTags(limit);
  const result: BackfillResult = { checked: rows.length, updated: 0, unchanged: 0, errors: [] };
  if (rows.length === 0) return result;

  const canonicalSets = await normalizeCategoryTags(rows.map((r) => r.categoryTags));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const newTags = canonicalSets[i] ?? row.categoryTags;
    if (sameTags(newTags, row.categoryTags)) {
      result.unchanged++;
      continue;
    }
    try {
      await updateCategoryTags(row.id, newTags);
      result.updated++;
    } catch (err) {
      result.errors.push(`${row.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
