// Client-side types + fetch helper for the Core API Contract
// (see docs/api-contract.md). Mirrors the shape returned by
// app/api/verdict/route.ts exactly — update both together.

export type VerdictStatus = "exists" | "partial_overlap" | "no_clear_match";

export interface VerdictMatch {
  name: string;
  url: string;
  description: string;
  source: string;
  matchScore: number;
}

export interface VerdictResponse {
  requestId: string;
  idea: { raw: string; normalized: string };
  verdict: { status: VerdictStatus; headline: string; confidence: number };
  matches: VerdictMatch[];
  generatedAt: string;
}

export class VerdictError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function submitIdea(idea: string): Promise<VerdictResponse> {
  let res: Response;
  try {
    res = await fetch("/api/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea }),
    });
  } catch {
    throw new VerdictError("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.");
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new VerdictError("INTERNAL_ERROR", "Something went wrong reading the response.");
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } })?.error;
    throw new VerdictError(err?.code ?? "UNKNOWN", err?.message ?? "Something went wrong.");
  }

  return data as VerdictResponse;
}
