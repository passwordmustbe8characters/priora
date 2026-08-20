import { getDb } from "./client";
import { pricingFeedback } from "./schema";

export interface PricingFeedbackInput {
  currency: "NGN" | "USD";
  sliderValue: number; // smallest currency unit — kobo or cents
  email?: string | null;
  ideaText?: string | null;
}

export async function createPricingFeedback(input: PricingFeedbackInput): Promise<void> {
  const db = getDb();
  await db.insert(pricingFeedback).values({
    currency: input.currency,
    sliderValue: input.sliderValue,
    email: input.email || null,
    ideaText: input.ideaText || null,
  });
}
