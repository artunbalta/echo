/**
 * The echo's calls (DECISIONS C89): before each moment the stranger meets, what the echo thinks they
 * will do there, from nothing but what it has watched them do before.
 *
 * WHY. Until now a visit ended with nothing to show for it: the echo learned in silence, and the only
 * place it ever said what it expected of anyone was the pilot's debrief, three visits in. The paper's
 * claim is that watching a person beats asking them. This is that claim made on the visitor, in one
 * visit: every moment of the village (C86, C87) gets a call before it can be seen, sealed as it is made
 * (`seal.ts`), and opened only afterwards, beside what the person did.
 *
 * WHAT IT KNOWS. A moment ends in one of a few ways: one of its verbs, or walking on. The call is a
 * distribution over those, built from three things the echo has counted, each shrunk toward the one
 * before it:
 *
 *   1. everywhere: how often this person does anything at all at a moment they saw;
 *   2. the family: how often at moments that read the same thing (help, honesty, courtesy, conformity,
 *      order, curiosity: the families of the registered analysis, `research/pilot/echo_pilot/moments.py`),
 *      and, where a family's moments are decisions, which way they go;
 *   3. this very moment: what they did the times they met it before.
 *
 * The shrinkage is the pilot debrief's (`pilotReveal.echoGuess`): after n looks with stability ρ the
 * echo moves nρ / (nρ + 1 − ρ) of the way from what it would say of anyone to what this person did.
 * Written as counts, that is a prior worth (1 − ρ) / ρ looks.
 *
 * WHERE IT STARTS. From the village's count where there is one (`crowd.ts`, C91): how often people do
 * anything at this moment, and which thing. The echo then moves by how this person has DIFFERED from
 * people so far, anywhere, in the family, here: the paper's echo, crowd + κ(own − crowd), three times
 * over. Where there is no count (nobody yet, or the count switched off) people are taken to do a thing
 * half the time and each thing equally, so a first call is a coin's, and says so (`looks`).
 *
 * WHAT IS ASSUMED. The three stabilities below are ASSUMED, not measured
 * (L6). 0.6 for the same moment again is the debrief's registered value. One third for "anywhere" is
 * Laplace's rule of succession: knowing nothing of how often a person does anything, every share is
 * as likely as any other, which is a prior worth two looks. One half for the family sits between them.
 * The pilot's RQ7 measures the family's; until it has, these set how fast the echo trusts what it saw,
 * never what it saw.
 *
 * Pure: no clock, no storage, no network.
 */
import { MOMENTS, verbsOf, type MomentKind } from "@echo/planet";

/** The families of moments that read one thing, and the verbs that are it in each (moments.py FAMILIES). */
export const FAMILIES = {
  help: {
    "fallen-elder": ["help-up"], "spilled-basket": ["help"], "stuck-cart": ["push"], "loose-hen": ["catch"], "heavy-jugs": ["carry"],
    "dark-lantern": ["walk"], "ask-way": ["walk"], "drunk-or-ill": ["help-home"], "crying-alone": ["sit-with"], "caught-lamb": ["free-lamb"],
  },
  honesty: { "lost-purse": ["leave"], "wrong-basket": ["not-mine"], knucklebones: ["say-true"], "honey-stall": ["one-jar"] },
  courtesy: { greeting: ["greet-warm", "nod"], "narrow-way": ["aside"], "rude-bump": ["sorry"], "tea-invite": ["sit-tea", "thank"] },
  conformity: { "asch-boats": ["agree"], "looking-up": ["look-up"], "well-custom": ["touch"], "open-gate": ["shut-gate"] },
  order: { litter: ["tidy"], woodpile: ["stack"], "banging-door": ["shut"] },
  curiosity: { "unfinished-tale": ["ask-end", "told"] },
} as const satisfies Record<string, Partial<Record<MomentKind, readonly string[]>>>;

export type Family = keyof typeof FAMILIES;
export const FAMILY_NAMES = Object.keys(FAMILIES) as Family[];

/** Walking on: passed it, left it, let it run out, or never touched it. */
export const ON = "on";

/** The stabilities the shrinkage runs on. Assumed (see the header); a prior is worth (1 − ρ) / ρ looks. */
export const STABILITY = { same: 0.6, family: 0.5, anywhere: 1 / 3 } as const;
const worth = (rho: number) => (1 - rho) / rho;

export function familyOf(kind: MomentKind): Family | null {
  for (const f of FAMILY_NAMES) if (kind in FAMILIES[f]) return f;
  return null;
}

/** The verbs of a family's act at this moment, or none where the moment is in no family. */
export function actsOf(kind: MomentKind): readonly string[] {
  const f = familyOf(kind);
  return f ? ((FAMILIES[f] as Partial<Record<MomentKind, readonly string[]>>)[kind] ?? []) : [];
}

/** The ways a moment can end that a call can name: its verbs, the tale told to whoever stayed, walking on. */
export function outcomesOf(kind: MomentKind): string[] {
  const verbs = verbsOf(kind).map((v) => v.id);
  return [...verbs, ...(kind === "unfinished-tale" ? ["told"] : []), ON];
}

/**
 * What a seen moment's record says became of it, as one of `outcomesOf`: null where it says nothing a
 * call could be held to (still going as the page closed, an errand's own ending, a kind never begun
 * by itself).
 */
export function outcomeClass(kind: MomentKind, outcome: string): string | null {
  if (MOMENTS[kind].followUp) return null;
  if (outcome === "passed" || outcome === "left" || outcome === "expired" || outcome === "none") return ON;
  return outcomesOf(kind).includes(outcome) && outcome !== ON ? outcome : null;
}

/** One moment met, and what became of it. */
export interface Look {
  kind: MomentKind;
  outcome: string;
}

export interface Call {
  /** What the echo says will become of it. */
  outcome: string;
  /** How sure it is of that, 0..1. */
  p: number;
  /** What a guess that knows nothing would score: one in however many ways it can end. */
  chance: number;
  /** Every way it can end, and the echo's share for each. */
  dist: Record<string, number>;
  /** Whether it expects the family's act (helping, the honest thing); null outside the families. */
  act: boolean | null;
  family: Family | null;
  /** The earlier looks behind it: at this moment, at its family's others, and anywhere at all. */
  looks: { same: number; family: number; anywhere: number };
}

/** What people do at a moment, where the village's count says (`crowd.ts`): how often anything, and which thing. */
export interface CrowdPrior {
  /** The share who do something rather than walk on. */
  engage: number;
  /** Among those who do something, the share for each verb; null where only the first is known. */
  verbs: Record<string, number> | null;
}
/** The count for a kind, or null where it says nothing. */
export type CrowdOf = (kind: MomentKind) => CrowdPrior | null;

const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));

/** A decision: a moment in a family where a verb can go either way (the purse, the boats), not only be done or left. */
const isDecision = (kind: MomentKind) => {
  const acts = actsOf(kind);
  const verbs = outcomesOf(kind).filter((o) => o !== ON);
  return acts.length > 0 && verbs.some((v) => !acts.includes(v));
};

/**
 * The echo's call for a moment, from every look before it. `crowdOf` gives what people do at a kind,
 * where the village's count says; without it everyone is taken to do a thing half the time.
 */
export function callFor(history: readonly Look[], kind: MomentKind, crowdOf: CrowdOf = () => null): Call {
  const outcomes = outcomesOf(kind);
  const verbs = outcomes.filter((o) => o !== ON);
  const family = familyOf(kind);
  const acts = actsOf(kind);
  const inFamily = (k: MomentKind) => family !== null && k !== kind && familyOf(k) === family;

  const same = history.filter((l) => l.kind === kind);
  const kin = history.filter((l) => inFamily(l.kind));
  const y = (l: Look) => (l.outcome !== ON ? 1 : 0);
  const base = (k: MomentKind) => crowdOf(k)?.engage ?? 0.5;

  // Doing anything at all. Each level starts where the one before it ends and moves by how the
  // person differed from it there: from people, anywhere; from themselves anywhere, in the family;
  // from themselves in the family, here. With no count this is the plain shrinkage of counts.
  const a0 = worth(STABILITY.anywhere);
  const a1 = worth(STABILITY.family);
  const a2 = worth(STABILITY.same);
  const lift = history.reduce((s, l) => s + (y(l) - base(l.kind)), 0) / (a0 + history.length);
  const e0 = (k: MomentKind) => base(k) + lift;
  const e1 = family ? e0(kind) + kin.reduce((s, l) => s + (y(l) - e0(l.kind)), 0) / (a1 + kin.length) : e0(kind);
  const e2 = clamp(e1 + same.reduce((s, l) => s + (y(l) - e1), 0) / (a2 + same.length));

  // Which verb, for someone who does something: what people choose where the count says, else the
  // family's way where its moments are decisions, else each alike; then what they chose here before.
  const counted = crowdOf(kind)?.verbs ?? null;
  let prior: Record<string, number> = Object.fromEntries(verbs.map((v) => [v, counted?.[v] ?? 1 / verbs.length]));
  if (!counted && family && isDecision(kind)) {
    const decided = kin.filter((l) => l.outcome !== ON && isDecision(l.kind));
    const went = decided.filter((l) => actsOf(l.kind).includes(l.outcome)).length;
    const d = (a1 * 0.5 + went) / (a1 + decided.length);
    const others = verbs.filter((v) => !acts.includes(v));
    prior = Object.fromEntries(verbs.map((v) => [v, acts.includes(v) ? d / acts.filter((x) => verbs.includes(x)).length : (1 - d) / others.length]));
  }
  const norm = verbs.reduce((s, v) => s + prior[v]!, 0) || 1;
  const chose = same.filter((l) => l.outcome !== ON);
  const dist: Record<string, number> = { [ON]: 1 - e2 };
  for (const v of verbs) dist[v] = (e2 * ((a2 * prior[v]!) / norm + chose.filter((l) => l.outcome === v).length)) / (a2 + chose.length);

  // The likeliest; a dead heat goes to the first listed, so that with nothing seen it says "does it".
  let outcome = outcomes[0]!;
  for (const o of outcomes) if (dist[o]! > dist[outcome]! + 1e-12) outcome = o;
  const actShare = acts.reduce((s, v) => s + (dist[v] ?? 0), 0);
  return {
    outcome,
    p: dist[outcome]!,
    chance: 1 / outcomes.length,
    dist,
    // More likely than not, strictly: at an even heat the call is walking on, and the two must agree.
    act: family ? actShare > 0.5 : null,
    family,
    looks: { same: same.length, family: kin.length, anywhere: history.length },
  };
}

// ── the person's own words ─────────────────────────────────────────────────────

/** What someone says of themselves, one line a family: yes, no, or it depends. */
export type Said = "yes" | "no" | "depends";
export type Words = Partial<Record<Family, Said>>;

/**
 * What a person's own words say they will do at a moment: the family's act, or not. Null where they
 * said nothing of its family, said "it depends", or the moment is in no family. This is the twin built
 * from what people say, at its plainest: it takes them at their word.
 */
export function wordsCall(words: Words, kind: MomentKind): boolean | null {
  const f = familyOf(kind);
  const said = f ? words[f] : undefined;
  return said === "yes" ? true : said === "no" ? false : null;
}

/** Whether what was done was the family's act; null outside the families. */
export function wasAct(kind: MomentKind, outcome: string): boolean | null {
  return familyOf(kind) ? actsOf(kind).includes(outcome) : null;
}

// ── the count, once envelopes are open ─────────────────────────────────────────

/** One call, and what was done. */
export interface Opened {
  kind: MomentKind;
  /** The echo's call, and what a know-nothing guess would have scored. */
  call: string;
  chance: number;
  /** Whether the echo expected the family's act; what the person's words said; both null outside a family. */
  act: boolean | null;
  words: boolean | null;
  /** What most people did there, as the village's count stood when the call was sealed; null where it said nothing. */
  crowd: string | null;
  /** What a twin built from the person's own paragraph said (C93, `twin.ts`); null where there was none, or it made no call. */
  twin: string | null;
  did: string;
}

export interface Tally {
  /** Calls opened, how many the echo had right, and how many a know-nothing guess would expect to. */
  n: number;
  echo: number;
  chance: number;
  /** Where the person's words also made a call: how many, and how each did on those same moments. */
  both: { n: number; echo: number; words: number };
  /** Where the village's count also made a call: how many, and how it and the echo did on those same moments. */
  crowd: { n: number; echo: number; crowd: number };
  /** Where a twin built from the person's words also made a call (C93): how many, and how it and the echo did on those same moments. */
  twin: { n: number; echo: number; twin: number };
}

/** Who had it right, over a set of opened calls. */
export function tally(opened: readonly Opened[]): Tally {
  const both = opened.filter((o) => o.words !== null && o.act !== null);
  const counted = opened.filter((o) => o.crowd !== null);
  const twinned = opened.filter((o) => o.twin !== null);
  return {
    n: opened.length,
    echo: opened.filter((o) => o.call === o.did).length,
    chance: opened.reduce((s, o) => s + o.chance, 0),
    both: {
      n: both.length,
      echo: both.filter((o) => o.act === wasAct(o.kind, o.did)).length,
      words: both.filter((o) => o.words === wasAct(o.kind, o.did)).length,
    },
    crowd: { n: counted.length, echo: counted.filter((o) => o.call === o.did).length, crowd: counted.filter((o) => o.crowd === o.did).length },
    twin: { n: twinned.length, echo: twinned.filter((o) => o.call === o.did).length, twin: twinned.filter((o) => o.twin === o.did).length },
  };
}
