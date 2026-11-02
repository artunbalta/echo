/**
 * What the echo is told of a trade (DECISIONS C58).
 *
 * No ML change (C7):
 *
 * - **a trade made**: `barter`, the catalogue's F9 (bargaining stance). ingest.py's generic channel-F
 *   branch reads any F9 into `risk_index` from `raw.amount`, 0.6 when none is sent. C58 sent none and
 *   called it unrouted, so every trade read as a hard bargain. A trade here is the villager's terms
 *   taken as they come, the soft end of the stance, so it says so: amount 0.2 (C59).
 * - **asking for something back for your help**: `ask_return`, G12 (reciprocity over repeated
 *   exchange), unrouted: no branch reads G12, so it moves the posterior only through the label
 *   embedding. The catalogue marks G12 [BUILD], and this is its first emitter.
 * - **pressing a villager who has already said no**: `bargain_hard`, F9. ingest.py routes it by
 *   name (assertive, dominance).
 *
 * Pure.
 */
import { SOCIAL_CUES } from "@echo/shared";
import type { EmitActionOptions } from "@/game/world/measure";

/** What `POST /api/village/trade` answers. */
export interface TradeReply {
  ok?: boolean;
  why?: string;
  gives?: string;
  words?: string;
  spares?: string[];
  pack?: Record<string, number>;
  met?: { person: string; words: string };
  changes?: import("@echo/planet").LifeChange[];
  error?: string;
}

/** How hard a trade on the villager's own terms is driven, on F9's scale: the soft end (C59). */
export const BARTER_STANCE = 0.2;

const context = (audience: number): EmitActionOptions["contextOverride"] => ({
  stakes: "low",
  public_or_private: audience > 0 ? "public" : "private",
  counterpart_status: "stranger",
});

/** The trade, as the echo is told of it: nothing, one event, or two (made, and pressed for). */
export function tradeMeasurement(
  kind: "trade" | "ask-back",
  reply: TradeReply,
  pressing: boolean,
  audience: number,
  person = "",
): { action: string; opts: EmitActionOptions }[] {
  const target = { id: `villager:${person}`, kind: "npc" as const };
  const out: { action: string; opts: EmitActionOptions }[] = [];
  if (pressing) {
    const r = SOCIAL_CUES.bargain_hard!;
    out.push({
      action: "bargain_hard",
      opts: { cue: r.cue as EmitActionOptions["cue"], channel: r.channel as EmitActionOptions["channel"], polarity: "take", raw: {}, target, contextOverride: context(audience) },
    });
  }
  if (reply.ok && kind === "trade") out.push({ action: "barter", opts: { cue: "F9", channel: "F", polarity: "take", raw: { amount: BARTER_STANCE }, target, contextOverride: context(audience) } });
  if (reply.ok && kind === "ask-back") out.push({ action: "ask_return", opts: { cue: "G12", channel: "G", polarity: "take", raw: {}, target, contextOverride: context(audience) } });
  return out;
}
