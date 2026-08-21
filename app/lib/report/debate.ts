import { getOpenAI, VERDICT_MODEL } from "../openai";
import type { CompetitorProfile, DeepReportContent, DebateContent } from "./types";

/**
 * Phase 3, Section 11 — "The Case For / The Case Against." Two
 * genuinely separate LLM calls (never one call asked to produce both
 * sides — the spec's own reasoning: keeping them separate reduces the
 * risk of one side unconsciously softening to agree with the other),
 * run in parallel since neither is allowed to see the other's output
 * anyway. Grounded ONLY in the already-verified report content — this
 * runs as its own stage after Hallucination Verification, not before,
 * specifically so the debate reasons over facts that already passed
 * verification rather than the raw pre-verification research.
 *
 * Deliberately NOT run back through Hallucination Verification itself,
 * despite the spec's own edge-case note suggesting that ("extend its
 * checklist to check bull/bear output too"). Every other synthesis
 * content in this report (marketLandscape.synthesis, synthesisSections)
 * is already exempt from fact-checking, per the spec's own earlier,
 * more fundamental rule: synthesis is reasoning, not a factual claim,
 * and is checked only for internal consistency, not against source
 * snippets. Bull/bear is tagged content_type: "synthesis" for exactly
 * that reason. Building a special-case verification pass for this one
 * synthesis block, and not the others, would be an inconsistent
 * architecture for an unclear marginal benefit — the grounding
 * instruction below already does the real work of keeping this
 * tethered to the verified data, the same way every other synthesis
 * prompt in this codebase relies on instruction rather than a second
 * verification pass. Flagged as a deliberate deviation, not an
 * oversight.
 */

const GROUNDING_NOTE =
  "You may not introduce any company, statistic, or claim not present in the data above — reason only from what's given.";

function summarizeForDebate(report: DeepReportContent): string {
  const competitorLines = report.competitors
    .map((c: CompetitorProfile) => {
      const parts = [
        c.pricing && `pricing: ${c.pricing}`,
        c.fundingStage && `funding: ${c.fundingStage}`,
        c.targetUser && `target user: ${c.targetUser}`,
      ].filter(Boolean);
      return `- ${c.companyName} (${c.category}): ${c.description}${parts.length ? ` [${parts.join("; ")}]` : ""}`;
    })
    .join("\n");

  return `Idea: ${report.ideaOneLiner}

Executive summary: ${report.executiveSummary.text}

Market landscape: ${report.marketLandscape.fact.text}

Competitors found (${report.competitors.length} total):
${competitorLines || "(none found)"}`;
}

const BULL_SYSTEM_PROMPT = `You argue the strongest honest case FOR proceeding with this idea, using ONLY the competitor data provided below. Do not soften your position to seem balanced — a separate agent argues the other side, that is not your job. If the data genuinely doesn't support a strong case, say so honestly rather than manufacturing optimism — e.g. if there's little competition, that can be framed honestly as an opening, but don't overstate it if the data doesn't support that read. Write 3-5 sentences. Address the reader directly as "you"/"your" throughout — never third person like "the founder" or "the user." ${GROUNDING_NOTE}`;

const BEAR_SYSTEM_PROMPT = `You argue the strongest honest case FOR reconsidering or pivoting this idea, using ONLY the competitor data provided below. Do not soften your position to seem balanced — a separate agent argues the other side, that is not your job. If the data genuinely doesn't support a strong case, say so honestly rather than manufacturing pessimism — e.g. if there's little competition, note honestly that this could mean no market rather than open opportunity, if the data supports that read. Write 3-5 sentences. Address the reader directly as "you"/"your" throughout — never third person like "the founder" or "the user." ${GROUNDING_NOTE}`;

const CASE_SCHEMA = {
  type: "object" as const,
  properties: { caseText: { type: "string" as const } },
  required: ["caseText"],
  additionalProperties: false,
};

async function runCase(systemPrompt: string, dataSummary: string, schemaName: string): Promise<string> {
  const client = getOpenAI();
  const response = await client.responses.create({
    model: VERDICT_MODEL,
    // "low" effort, no web_search — this reasons over data already
    // gathered and verified, no new research needed, same Vercel
    // Hobby-cap reasoning as generator.ts's two calls.
    reasoning: { effort: "low" },
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: dataSummary },
    ],
    text: { format: { type: "json_schema", name: schemaName, schema: CASE_SCHEMA, strict: true } },
  });
  const raw = response.output_text;
  if (!raw) throw new Error(`Empty response from ${schemaName} debate call`);
  return (JSON.parse(raw) as { caseText: string }).caseText;
}

export async function generateDebate(report: DeepReportContent): Promise<DebateContent> {
  const dataSummary = summarizeForDebate(report);

  const [bullText, bearText] = await Promise.all([
    runCase(BULL_SYSTEM_PROMPT, dataSummary, "bull_case"),
    runCase(BEAR_SYSTEM_PROMPT, dataSummary, "bear_case"),
  ]);

  return {
    bullCase: { contentType: "synthesis", text: bullText },
    bearCase: { contentType: "synthesis", text: bearText },
  };
}
