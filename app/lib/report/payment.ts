import { createHmac, timingSafeEqual } from "crypto";

/**
 * Phase 3 — Payment Integration (Paystack). Plain `fetch` against
 * Paystack's REST API rather than a wrapper SDK — Paystack doesn't
 * maintain an official one, and the whole surface used here is two
 * calls, matching this codebase's existing convention (the ingestion
 * connectors all use bare fetch too).
 *
 * Real external-account note: USD support on Paystack depends on the
 * merchant account actually having the USD channel enabled — that's a
 * Paystack dashboard setting, not something this code can guarantee.
 * Worth confirming before shipping the $15 international tier live.
 */

const PAYSTACK_BASE = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

// Smallest currency unit, matching Paystack's own convention — kobo for
// NGN, cents for USD.
export const PRICING: Record<"NGN" | "USD", number> = {
  NGN: 5000 * 100,
  USD: 15 * 100,
};

export async function initializePaystackTransaction(params: {
  email: string;
  currency: "NGN" | "USD";
  reportJobId: string;
  callbackUrl: string;
}): Promise<{ checkoutUrl: string; amount: number; reference: string }> {
  const amount = PRICING[params.currency];

  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount,
      currency: params.currency,
      callback_url: params.callbackUrl,
      metadata: { report_job_id: params.reportJobId },
    }),
  });

  const json = (await res.json()) as {
    status: boolean;
    message?: string;
    data?: { authorization_url: string; reference: string };
  };

  if (!res.ok || !json.status || !json.data) {
    throw new Error(`Paystack initialize failed: ${json.message || res.status}`);
  }

  return { checkoutUrl: json.data.authorization_url, amount, reference: json.data.reference };
}

/** Paystack signs the raw webhook body with HMAC-SHA512 using the
 * secret key, sent in the x-paystack-signature header — verifying this
 * is a security requirement per the spec, not optional. Must be run
 * against the exact raw request body text, before any JSON parsing. */
export function verifyPaystackSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", getSecretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface PaystackWebhookPayload {
  event: string;
  data: {
    reference: string;
    amount: number;
    customer: { email: string };
    metadata?: { report_job_id?: string };
  };
}
