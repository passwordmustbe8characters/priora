import { getOpenAI, VERDICT_MODEL } from "../openai";
import type { CompetitorProfile, DeepReportContent } from "./types";

/**
 * Phase 3 — Hallucination Verification Pass. Re-checks every
 * `content_type: "fact"` claim against the source snippet it was
 * supposedly drawn from, before Report Document Assembly ever sees the
 * data. Synthesis content is explicitly out of scope here — it's
 * reasoning, not a factual claim (see generator.ts's own synthesis
 * prompt, which already enforces internal-consistency-only reasoning).
 *
 * A small number of batched, parallel LLM calls (chunked ~9 claims per
 * call — see verifyDeepReport's own comment on why) rather than the
 * spec's literal "one LLM call," and definitely not one call per claim
 * — chunking keeps each individual call fast while still batching, and
 * concurrency keeps total wall-clock time close to one call's latency
 * rather than the sum of all of them.
 *
 * PER-FIELD verification, not whole-profile — this is a deliberate
 * deviation from an earlier, simpler design that bundled a competitor's
 * name + description + pricing + fundingStage + targetUser into one
 * pass/fail claim. Live testing surfaced that design as broken in
 * practice: with 8 competitors from real research, a bundled claim
 * failed verification ~90-100% of the time even when the core company
 * facts were solidly sourced, because the model would find some
 * peripheral, unmentioned-but-not-contradicted sub-detail (e.g.
 * "the snippet doesn't say whether fees are published") and fail the
 * whole bundle over it — see the reasoning transcripts from that
 * testing, which consistently showed correct partial support followed
 * by an all-or-nothing rejection. Every paid report would have shipped
 * with an empty competitor list.
 *
 * The fix: verify each competitor's CORE claim (name + description)
 * separately from its optional sub-fields (pricing/fundingStage/
 * targetUser, already nullable in the schema). A failing core claim
 * drops the whole competitor (nothing worth keeping without a verified
 * identity/description). A failing sub-claim just nulls out that one
 * field — the competitor stays, thinner but accurate, which is the
 * spec's own stated trade-off, now applied at the right granularity.
 *
 * Removal semantics for the two prose sections (executiveSummary /
 * marketLandscape.fact) are unchanged from the original design — single
 * required blocks with nothing to drop down to, so a failing one MUST
 * come back with a corrected version; a neutral, honestly-hedged
 * fallback replaces it if the model doesn't supply one.
 */

const VERIFY_SYSTEM_PROMPT = `You are Priora's fact-checker for a paid report. You'll get a numbered list of factual claims, each paired with the source snippet it was supposedly drawn from. For each one, decide whether the claim holds up.

THE RULE — read carefully, this is the part you keep getting wrong: SILENCE IS NOT A FAILURE REASON. A claim fails ONLY for CONTRADICTION (the snippet states something different) or FABRICATION (a specific number/name/fact that has no basis anywhere in the snippet, invented from nothing). A claim does NOT fail just because the snippet doesn't happen to mention every element of it. Claims are compound sentences describing a company — they will almost always include some detail the snippet doesn't individually spell out. That is normal and expected, not a defect.

Worked example — PASSES: Claim: "Acme is a Nigerian invoicing app with a US bank account feature and instant reminders." Snippet: "Acme: built for Nigerian freelancers. Includes a dedicated US bank account for receiving USD, and automated reminders." → holdsUp: true. Every element traces to the snippet; "instant" vs "automated" is a harmless paraphrase, not a fabrication.

Worked example — FAILS: Claim: "Acme raised $5M in a 2023 Series A." Snippet: "Acme: built for Nigerian freelancers, no funding information available." → holdsUp: false. The $5M/Series A/2023 figures have zero basis in the snippet — that's invention, not silence-tolerance.

Worked example — still PASSES despite one uncovered detail: Claim: "Acme offers a mobile app, WhatsApp invoicing, and a loyalty rewards program." Snippet: "Acme: WhatsApp invoicing, mobile app for iOS and Android." → holdsUp: true. The snippet doesn't mention "loyalty rewards," but nothing contradicts it either, and it's not a suspiciously specific invented number/name — treat unaddressed minor claim elements as acceptable synthesis, not fabrication, UNLESS the claim is entirely about that one unaddressed element (in which case there's nothing to verify it against, so it should fail).

Apply this same rule whether the claim is one sentence or several sentences describing a company.

For claims marked "requiresCorrection: true" in the input, if the claim doesn't hold up, also provide a corrected version that only states what the snippet actually supports — hedge or generalize rather than removing detail that IS supported, but never assert something the snippet doesn't back up. Match the original claim's addressing style if it speaks to the reader directly ("you"/"your") — don't introduce third-person phrasing like "the founder" that wasn't there. For claims not marked "requiresCorrection", just return holdsUp — a corrected version isn't needed, that claim will simply be dropped if it fails.

For every claim, first write one short sentence in "reasoning" naming the SPECIFIC contradicted or fabricated detail, if any. If your reasoning would only describe something the snippet is silent on (not contradicted, not fabricated), that is not a valid failure reason — holdsUp must be true.`;

const VERIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    results: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          index: { type: "number" as const },
          reasoning: { type: "string" as const },
          holdsUp: { type: "boolean" as const },
          correctedText: { type: ["string", "null"] as const },
        },
        required: ["index", "reasoning", "holdsUp", "correctedText"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

interface VerifyResult {
  index: number;
  reasoning: string;
  holdsUp: boolean;
  correctedText: string | null;
}

interface Claim {
  index: number;
  text: string;
  sourceSnippet: string | null;
  requiresCorrection: boolean; // true only for the two prose sections
}

async function runVerification(claims: Claim[]): Promise<Map<number, VerifyResult>> {
  const results = new Map<number, VerifyResult>();
  if (claims.length === 0) return results;

  const client = getOpenAI();
  const body = claims
    .map(
      (c) =>
        `${c.index}. Claim: ${c.text}\n   Source snippet: ${c.sourceSnippet ?? "(no snippet provided — treat as unverified)"}\n   requiresCorrection: ${c.requiresCorrection}`,
    )
    .join("\n\n");

  // Explicit output budget: per-field verification means more, smaller
  // claims than the earlier whole-profile design, and each now carries a
  // reasoning sentence too — without a generous ceiling here, a batch
  // with many claims risks the response getting cut off mid-array
  // (silently losing whatever claims came after the cutoff, which then
  // fail closed). Sized well above what even a full 8-competitor report
  // (~26 claims: 2 prose + up to 8x3 fields) should need.
  const requestArgs = {
    model: VERDICT_MODEL,
    reasoning: { effort: "medium" as const },
    max_output_tokens: 6000,
    input: [
      { role: "system" as const, content: VERIFY_SYSTEM_PROMPT },
      { role: "user" as const, content: body },
    ],
    text: { format: { type: "json_schema" as const, name: "verify_claims", schema: VERIFY_SCHEMA, strict: true } },
  };

  let raw: string | null;
  try {
    const response = await client.responses.create(requestArgs);
    raw = response.output_text;
  } catch (err) {
    // Retry once, per the spec's edge case — a transient failure
    // shouldn't sink verification outright.
    console.error("verification call failed, retrying once:", err);
    const response = await client.responses.create(requestArgs);
    raw = response.output_text;
  }

  if (!raw) throw new Error("Empty response from hallucination verification pass");
  const parsed = JSON.parse(raw) as { results: VerifyResult[] };
  for (const r of parsed.results) results.set(r.index, r);
  return results;
}

const PROSE_EXEC_SUMMARY_INDEX = 0;
const PROSE_MARKET_LANDSCAPE_INDEX = 1;
const COMPETITOR_CLAIMS_START = 2;

// Per competitor: one required core claim, plus up to 3 optional
// sub-field claims (only created when that field is actually populated).
type CompetitorClaimKind = "core" | "pricing" | "fundingStage" | "targetUser";

// Keyed as `${competitorIndex}:${kind}` -> claim index, so results can be
// looked back up per competitor/field without re-scanning arrays.
function buildCompetitorClaims(
  competitors: CompetitorProfile[],
): { claims: Claim[]; claimIndexByRef: Map<string, number> } {
  const claims: Claim[] = [];
  const claimIndexByRef = new Map<string, number>();
  let index = COMPETITOR_CLAIMS_START;

  const addClaim = (
    competitorIndex: number,
    kind: CompetitorClaimKind,
    text: string,
    sourceSnippet: string | null,
    requiresCorrection = false,
  ) => {
    claims.push({ index, text, sourceSnippet, requiresCorrection });
    claimIndexByRef.set(`${competitorIndex}:${kind}`, index);
    index++;
  };

  competitors.forEach((c, i) => {
    // requiresCorrection: true — live testing showed the model reliably
    // pinpoints the exact unsupported clause in a multi-fact description
    // (e.g. "supports X, Y, Z but not W") yet still fails the whole
    // claim over it. Since it can already name the problem, have it fix
    // the problem: trim the unsupported detail and keep the competitor,
    // rather than discarding an otherwise well-sourced profile over one
    // clause. See reassembly logic below for the drop-only-if-nothing-
    // salvageable fallback.
    addClaim(i, "core", `${c.companyName}: ${c.description}`, c.sourceSnippet, true);

    if (c.pricing || c.entryPrice || c.topPrice || c.pricingModel) {
      const parts = [
        c.pricing && `Pricing: ${c.pricing}.`,
        c.entryPrice && `Entry price: ${c.entryPrice}.`,
        c.topPrice && `Top price: ${c.topPrice}.`,
        c.pricingModel && `Pricing model: ${c.pricingModel}.`,
      ].filter(Boolean);
      addClaim(i, "pricing", `${c.companyName} pricing — ${parts.join(" ")}`, c.sourceSnippet);
    }

    if (c.fundingStage) {
      addClaim(i, "fundingStage", `${c.companyName} funding stage: ${c.fundingStage}`, c.sourceSnippet);
    }

    if (c.targetUser) {
      addClaim(i, "targetUser", `${c.companyName} target user: ${c.targetUser}`, c.sourceSnippet);
    }
  });

  return { claims, claimIndexByRef };
}

export async function verifyDeepReport(report: DeepReportContent): Promise<DeepReportContent> {
  const claims: Claim[] = [
    {
      index: PROSE_EXEC_SUMMARY_INDEX,
      text: report.executiveSummary.text,
      sourceSnippet: report.executiveSummary.sourceSnippet,
      requiresCorrection: true,
    },
    {
      index: PROSE_MARKET_LANDSCAPE_INDEX,
      text: report.marketLandscape.fact.text,
      sourceSnippet: report.marketLandscape.fact.sourceSnippet,
      requiresCorrection: true,
    },
  ];

  const { claims: competitorClaims, claimIndexByRef } = buildCompetitorClaims(report.competitors);
  claims.push(...competitorClaims);

  // Chunked + parallel, not one call for every claim — confirmed live
  // (production, not assumed) that one big call with a full 8-competitor
  // report's ~26 claims at "medium" effort was slow enough to exceed
  // Vercel Hobby's 60s hard per-invocation cap, silently killing the
  // whole generation job mid-verification with no error ever recorded
  // (research+synthesize alone already spend ~40s of that budget before
  // verification even starts). Splitting into smaller concurrent calls
  // cuts wall-clock latency without touching effort/quality — a single
  // slow call becomes several faster ones running at once, rather than
  // trading away the hard-won fix to verification's earlier over-
  // rejection bug by dropping back to "low" effort.
  const CHUNK_SIZE = 9;
  const chunks: Claim[][] = [];
  for (let i = 0; i < claims.length; i += CHUNK_SIZE) chunks.push(claims.slice(i, i + CHUNK_SIZE));
  const resultMaps = await Promise.all(chunks.map((chunk) => runVerification(chunk)));
  const results = new Map<number, VerifyResult>();
  for (const map of resultMaps) for (const [index, result] of map) results.set(index, result);

  const executiveSummaryResult = results.get(PROSE_EXEC_SUMMARY_INDEX);
  const executiveSummary =
    !executiveSummaryResult || executiveSummaryResult.holdsUp
      ? report.executiveSummary
      : {
          ...report.executiveSummary,
          text:
            executiveSummaryResult.correctedText ||
            "A confident executive summary couldn't be fully verified against sources for this pass — see the competitor profiles below for what was independently confirmed.",
        };

  const marketLandscapeResult = results.get(PROSE_MARKET_LANDSCAPE_INDEX);
  const marketLandscapeFact =
    !marketLandscapeResult || marketLandscapeResult.holdsUp
      ? report.marketLandscape.fact
      : {
          ...report.marketLandscape.fact,
          text:
            marketLandscapeResult.correctedText ||
            "Detailed market landscape findings couldn't be fully verified against sources for this pass.",
        };

  // Reassemble competitors from the per-field results. Core claims are
  // corrected (unsupported clause trimmed), not dropped, unless there's
  // nothing salvageable at all — see addClaim's comment above for why.
  // Sub-field claims (pricing/fundingStage/targetUser) still null out
  // outright on failure rather than get corrected — they're single
  // discrete facts already, nothing left to trim down to.
  const getResult = (competitorIndex: number, kind: CompetitorClaimKind): VerifyResult | undefined => {
    const claimIndex = claimIndexByRef.get(`${competitorIndex}:${kind}`);
    return claimIndex === undefined ? undefined : results.get(claimIndex);
  };
  const holdsUp = (competitorIndex: number, kind: CompetitorClaimKind): boolean =>
    getResult(competitorIndex, kind)?.holdsUp === true;

  const competitors: CompetitorProfile[] = [];
  report.competitors.forEach((c, i) => {
    const coreResult = getResult(i, "core");
    // No result at all (shouldn't happen, but fail closed) drops the
    // profile — nothing to correct without a result to correct from.
    if (!coreResult) return;

    let description = c.description;
    if (!coreResult.holdsUp) {
      // Failed, but has a corrected description to fall back to — trim
      // to what's actually supported and keep the competitor.
      if (coreResult.correctedText) {
        description = coreResult.correctedText;
      } else {
        // Failed with nothing to salvage — genuinely nothing verified
        // about this company, drop it.
        return;
      }
    }

    let next: CompetitorProfile = { ...c, description };
    if ((c.pricing || c.entryPrice || c.topPrice || c.pricingModel) && !holdsUp(i, "pricing")) {
      next = { ...next, pricing: null, entryPrice: null, topPrice: null, pricingModel: null };
    }
    if (c.fundingStage && !holdsUp(i, "fundingStage")) {
      next = { ...next, fundingStage: null };
    }
    if (c.targetUser && !holdsUp(i, "targetUser")) {
      next = { ...next, targetUser: null };
    }
    competitors.push(next);
  });

  return {
    ...report,
    executiveSummary,
    marketLandscape: { ...report.marketLandscape, fact: marketLandscapeFact },
    competitors,
  };
}
