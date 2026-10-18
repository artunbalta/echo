/**
 * An act, as the echo hears it (DECISIONS C45): the behavioural event a performed verb becomes.
 *
 * THE MANNER, NOT A VERDICT. The registry says which action label an act is sent under; this says
 * what the browser measured about HOW it was done, in the raw signals ingest.py already reads:
 * `dwell_ms` (how long it took), `still_ms` (how long they sat still, for sitting), `decision_latency_ms`
 * (from the thing coming within reach to the key being pressed), `thoroughness01` (how much of the act
 * was done before they walked off), and `distance` for an approach. Nothing here says what any of it
 * means for a person; W does.
 *
 * WALKING AWAY IS AN ACT TOO (cue-catalog's refusal rule). An act begun and abandoned is sent as its
 * refusal twin where ingest.py has one (`pass_by` for help, `shirk_work` for a shift, `stay_safe` for
 * the mine, `abandon_gather` for driftwood), and otherwise as the same label with `polarity: refuse`.
 *
 * WHO COULD SEE IT is the event's audience: the villagers out of doors within thirty metres. The same
 * act watched and unwatched is a different datum (G3), and the engine keeps them apart by privacy.
 *
 * Pure, so the tests read it directly.
 */
import type { EventContext, TargetKind } from "@echo/shared";
import type { ThingKind, Verb } from "@echo/planet";

import type { EmitActionOptions } from "@/game/world/measure";

export interface Manner {
  /** Milliseconds the act lasted, whether it was finished or not. */
  heldMs: number;
  /** Milliseconds from the thing coming within reach to the key being pressed. */
  decisionMs: number;
  /** True when the person walked away before the act was done. */
  abandoned: boolean;
  /** Metres from the body to the thing when the act began. */
  distanceM: number;
  /**
   * For the pet cue (D11, C55): how much there is in it — the bond the stranger has with this dog, as
   * ingest.py reads `pet_attach` from `raw.amount`. Absent, a stroke is 0.6.
   */
  amount?: number;
}

export interface Measurement {
  action: string;
  opts: EmitActionOptions;
}

const STRUCTURES = new Set(["house", "ruin", "well", "dock", "boat", "mine", "bench"]);
const PLACES = new Set(["field", "grave", "water"]);

/** What kind of target an act was done to, in the event schema's terms. */
export function targetKindOf(kind: ThingKind): TargetKind {
  if (kind === "self") return "self"; // making something (C47)
  if (kind === "villager") return "npc";
  if (kind === "dog") return "pet"; // the schema's own word for it (C55)
  if (STRUCTURES.has(kind)) return "structure";
  if (PLACES.has(kind)) return "place";
  return "resource";
}

/** The behavioural event a performed verb becomes. */
export function measurementFor(verb: Verb, thing: { ref: string; kind: ThingKind }, manner: Manner, audience: number): Measurement {
  const { measure } = verb;
  const finished = !manner.abandoned;
  const fraction = verb.holdS > 0 ? Math.min(1, manner.heldMs / (verb.holdS * 1000)) : 1;
  const raw: Record<string, unknown> = {
    dwell_ms: Math.round(manner.heldMs),
    decision_latency_ms: Math.round(Math.max(0, manner.decisionMs)),
    thoroughness01: Number(fraction.toFixed(3)),
  };
  // Sitting is the one act whose whole content is its stillness (sit_still reads still_ms).
  if (verb.pose === "sit") raw.still_ms = Math.round(manner.heldMs);
  // An approach is read by the G route only with a distance (ingest.py's G branch).
  if (measure.channel === "G" || measure.channel === "A") raw.distance = Number(manner.distanceM.toFixed(2));
  // The pet cue's amount (C55): a stroke from someone it barely knows is a little; shooing it is nothing.
  if (measure.cue.startsWith("D11")) raw.amount = Number((measure.action === "shoo_pet" ? 0.05 : (manner.amount ?? 0.6)).toFixed(3));
  const context: Partial<EventContext> = {
    stakes: verb.stakes,
    audience_size: audience,
    public_or_private: audience > 0 ? "public" : "private",
    counterpart_status: verb.owner === "none" ? "none" : "stranger",
  };
  return {
    action: finished ? measure.action : (measure.abandon ?? measure.action),
    opts: {
      cue: measure.cue,
      channel: measure.channel,
      polarity: finished ? "take" : "refuse",
      raw,
      target: { id: thing.ref, kind: targetKindOf(thing.kind) },
      contextOverride: context,
    },
  };
}

/** Whether an act needs the server: it leaves a mark on the shared world, or touches somebody. */
export function touchesTheWorld(verb: Verb): boolean {
  return verb.deed !== null || (verb.effect !== null && verb.effect.lastsDays > 0);
}

/**
 * The verbs a person can do right now: a gift needs something in the hand, a pick-up needs room in the
 * pack (C47: "empty-handed" means the pack has room), and from a boat you can only bring it back.
 */
export function verbsInHand(verbs: readonly Verb[], held: string | null, aboard = false, room = held === null): Verb[] {
  return verbs.filter((v) => {
    if (v.needs === "aboard") return aboard;
    if (aboard) return false;
    // A verb that takes only some things (food, to an animal; C55) is for the hand that holds one of them.
    if (v.needs === "carrying" && v.takes) return held !== null && v.takes.includes(held);
    return v.needs === "carrying" ? held !== null : v.needs === "empty-handed" ? room : true;
  });
}

/** A recipe as a verb, so making something is an act like any other: a pose, a length, a measurement. */
export function recipeVerb(r: { id: string; label: string; holdS: number; measure: Verb["measure"]; beat: string }): Verb {
  return { id: `make:${r.id}`, label: r.label, holdS: r.holdS, pose: "build", reachM: 0, stakes: "low", measure: r.measure, effect: null, deed: null, owner: "none", beat: r.beat };
}
