/**
 * Deterministic, profile-weighted outcome resolution (§8/§9). Pure + isomorphic. Used by
 * the MockEngine to decide book / abandon / defect coherently from a traveler's hidden
 * profile, and as the fallback classifier when the LLM doesn't return a clean verdict.
 * Same profile id → same outcome, so the dashboard is stable and explainable.
 */
import type { NoPurchaseReason, Outcome, Sentiment, TravelerProfile } from "../types";
import { budgetBandOf, rngFromId } from "./profiles";

const OBJECTION_TO_REASON: Record<TravelerProfile["primaryObjection"], NoPurchaseReason> = {
  price: "price",
  schedule: "schedule",
  route: "route",
  "loyalty-to-competitor": "competitor",
  "just-browsing": "browsing",
};

/** Base probability of booking, nudged by segment / budget / loyalty / objection. */
function bookProbability(p: TravelerProfile): number {
  let prob = 0.5;
  if (p.segment === "business") prob += 0.15;
  if (p.segment === "student") prob -= 0.1;
  if (p.segment === "family") prob -= 0.05;
  if (p.budgetSensitivity === "high") prob -= 0.15;
  if (p.budgetSensitivity === "low") prob += 0.1;
  if (p.loyalty === "frequent") prob += 0.2;
  if (p.loyalty === "none") prob -= 0.05;
  if (p.primaryObjection === "just-browsing") prob -= 0.3;
  if (p.primaryObjection === "loyalty-to-competitor") prob -= 0.2;
  if (p.primaryObjection === "price" && p.budgetSensitivity === "high") prob -= 0.15;
  if (p.flexibleDestination) prob += 0.05; // easier to satisfy on schedule/route
  return Math.max(0.05, Math.min(0.92, prob));
}

export function resolveOutcome(
  p: TravelerProfile,
  opts: { isHuman?: boolean; dwellSeconds?: number; transcriptId: string } = { transcriptId: "" },
): Outcome {
  const r = rngFromId(p.id + "|outcome");
  const booked = r() < bookProbability(p);
  const reason: NoPurchaseReason | undefined = booked ? undefined : OBJECTION_TO_REASON[p.primaryObjection];

  // A non-booking competitor-loyal or browsing visitor may defect to another island.
  let defectedTo: string | undefined;
  if (!booked && (p.primaryObjection === "loyalty-to-competitor" || p.primaryObjection === "just-browsing")) {
    if (r() < 0.6) defectedTo = p.consideredAlternatives[0];
  }

  const sentiment: Sentiment = booked
    ? "positive"
    : reason === "browsing" || defectedTo
      ? "negative"
      : "neutral";

  return {
    visitorId: p.id,
    isHuman: opts.isHuman ?? false,
    segment: p.segment,
    destinationRequested: p.desiredDestination,
    budgetBand: budgetBandOf(p),
    partySize: p.partySize,
    booked,
    noPurchaseReason: reason,
    defectedTo,
    sentiment,
    dwellSeconds: opts.dwellSeconds ?? Math.round(20 + r() * 90),
    transcriptId: opts.transcriptId,
  };
}
