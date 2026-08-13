import OpenAI from "openai";

let client: OpenAI | null = null;

/** Lazily constructed so a missing key surfaces as a clean 502, not a boot crash. */
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

// Cheapest current tier that still supports the web_search tool — this
// pipeline is normalization + judging search results, not heavy reasoning,
// so the budget tier is the right fit. Override via env without a code change.
export const VERDICT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
