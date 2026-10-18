/**
 * What the echo is told of a trade (DECISIONS C58).
 *
 * No ML change (C7). Two labels are unrouted and move the posterior only through the action-label
 * embedding: nothing anchored has their definition, and attaching them to the nearest live feature
 * would be the silent re-route the cross-cutting rules forbid. The third is routed by name:
 *
 * - **a trade made**: `barter`, the catalogue's F9 (bargaining stance), unrouted. One thing for one,
 *   on the villager's terms.
 * - **asking for something back for your help**: `ask_return`, G12 (reciprocity over repeated
 *   exchange), unrouted. The catalogue marks G12 [BUILD], and this is its first emitter.
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
  if (reply.ok && kind === "trade") out.push({ action: "barter", opts: { cue: "F9", channel: "F", polarity: "take", raw: {}, target, contextOverride: context(audience) } });
  if (reply.ok && kind === "ask-back") out.push({ action: "ask_return", opts: { cue: "G12", channel: "G", polarity: "take", raw: {}, target, contextOverride: context(audience) } });
  return out;
}
