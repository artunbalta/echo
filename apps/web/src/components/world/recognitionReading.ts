/**
 * What the recognition meter is allowed to say on a parcel, and nothing else.
 *
 * The meter's copy is "your echo knows you N", and on ground with no stations the whole difficulty
 * is which N. Every candidate below was measured against the shipped routes before one was picked,
 * because the inspector was already refuted once for printing a claim the code contradicted
 * (DECISIONS.md C15) and a bar is a much easier place to do it again: a filled bar reads as a
 * result whatever the label above it says.
 *
 * THE NUMBER IS THE POSTERIOR'S RESOLVED UNCERTAINTY, 1 - mean(diag(Sigma)) / prior_var. It is the
 * one quantity on this route that (a) the ML service actually returns, (b) the service itself
 * normalises exactly this way (`unc01` at services/ml/echo_ml/app.py:472, and the same
 * `1 - uncertainty` the world's own meter already uses at lib/useEcho.ts:50, so the two routes
 * report one unit), and (c) MOVES while a person only walks. The chain re-reads GET
 * /api/agent/persona after every locomotion window that lands (measure.ts seed(force)), so this
 * number is a fresh read of stored state and never a client-side accumulation.
 *
 * THE OTHER THREE PARTS OF THE WORLD METER'S BLEND ARE STRUCTURALLY DEAD HERE, which is why the
 * blend is not reused. `evidence` is 1 - exp(-behaviors/12) and `behaviors` is len(st.behaviors),
 * which only grows on /observe; a bare parcel has no bounded act, so it emits none and that term is
 * pinned at 0 forever. `reliability` needs calibration buckets, and nothing on this route creates
 * one. Blending them in would put a ceiling of 0.65 on the headline for reasons that have nothing
 * to do with the person, which is a made-up number wearing a measured one's clothes.
 *
 * AND THE NUMBER IS SHOWN WITH THE EVIDENCE IT WAS BOUGHT WITH, because measured against the live
 * service on 2026-09-04 through the shipped routes, one passive_locomotion window takes mean(var)
 * from 1.000 to 0.174 and eight windows take it to 0.031: 83% after a second and a half of walking,
 * 97% after twelve seconds. That is a Kalman filter committing hard on two scalars whose rows in W
 * touch all eight axes, not an echo learning who somebody is, and "it knows you 97%" alone would be
 * exactly the refuted move. So the meter always prints the window count beside the percentage, and
 * the constellation beside it counts the axes the service would actually NAME, which over the same
 * 24 windows went from 0 of 8 to 0 of 8. A person reading "97% sure · names nothing of you yet · 12
 * windows" learns the true thing: it got very sure very fast, on very little, and can still assert
 * nothing about them.
 *
 * NOTHING IS INVENTED WHEN THERE IS NOTHING TO SAY. Consent unset or declined is `off` and draws no
 * fill at all, because a bar at 0% reads as a measurement and "not measuring" is not zero. A mocked
 * posterior is `offline` and carries the route's own reason instead of a percentage, the way
 * DuskReading labels a mocked reading. A real posterior that arrived without covariance is
 * `no_variance`: the certainty cannot be computed from a mean alone and is not guessed at.
 */

import { AXIS_POLES, PERSONA_AXIS_KEYS, describeAxes, vectorToAxes } from "@echo/shared";

import { LOG_SIZE, type ConsentState, type MeasureLogEntry, type Posterior } from "../../game/world/measure";
import { t, type Lang } from "../../lib/i18n";

/**
 * Sigma's diagonal before any evidence: services/ml/echo_ml/config.py:12, `prior_var = 1.0`. It is
 * the denominator that turns a variance into a share of the uncertainty the echo started with, and
 * it is the same denominator the service uses on itself (app.py:472). Confirmed against the live
 * service: a user with no history answers /persona with var = [1,1,1,1,1,1,1,1] at version 0.
 */
export const PRIOR_VAR = 1;

/**
 * The variance above which the service refuses to assert an axis at all: persona.py:546,
 * `if post.var[i] > 0.6: continue`. The OTHER half of its decode rule, the |mu| >= 0.33 test and
 * the words it picks, is `describeAxes` in @echo/shared, which persona.py mirrors line for line, so
 * only this half is written down here.
 */
export const ASSERT_VAR_MAX = 0.6;

/** A locomotion window that reached the service. A mocked send moved nothing, so it is not one. */
export const LOCOMOTION_ACTION = "passive_locomotion";

export interface MeasuredReading {
  kind: "measured";
  /** 1 - mean(var)/prior_var, clamped to 0..1. The tide's width and the headline percentage. */
  certainty01: number;
  /** mean(diag(Sigma)) as the service reported it, before the normalisation above. */
  meanVar: number;
  /** The trait phrases the service's own decode would assert. Empty is the common answer here. */
  named: string[];
  /** Locomotion windows that reached the service, as far as the log can still see. */
  windows: number;
  /** True once the log ring is full: `windows` is then a floor rather than a session total. */
  windowsAtLeast: boolean;
  eventsHeld: number;
  version: number | null;
  source: "seed" | "event";
  at: number;
}

export type RecognitionReading =
  | { kind: "off"; consent: "unset" | "declined" }
  | { kind: "waiting" }
  | { kind: "offline"; reason: string }
  | { kind: "no_variance"; version: number | null }
  | MeasuredReading;

export interface ReadingInput {
  consent: ConsentState;
  posterior: Posterior | null;
  log: readonly MeasureLogEntry[];
}

/** Every state the meter can be in, decided in one place so the copy below cannot drift from it. */
export function recognitionReading({ consent, posterior, log }: ReadingInput): RecognitionReading {
  if (consent !== "accepted") return { kind: "off", consent };
  if (!posterior) return { kind: "waiting" };
  if (posterior.mocked) return { kind: "offline", reason: posterior.reason ?? "no reason given" };
  if (!posterior.var || posterior.var.length !== PERSONA_AXIS_KEYS.length || !posterior.var.every(Number.isFinite)) {
    return { kind: "no_variance", version: posterior.version };
  }

  const meanVar = posterior.var.reduce((s, v) => s + v, 0) / posterior.var.length;
  const windows = log.filter((e) => e.action === LOCOMOTION_ACTION && e.mocked === false).length;
  return {
    kind: "measured",
    certainty01: clamp01(1 - meanVar / PRIOR_VAR),
    meanVar,
    named: namedAxes(posterior),
    windows,
    // The log is a ring of LOG_SIZE. Once it is full, older windows have been dropped from view and
    // the count is a floor; saying so is cheap and a count that quietly stops rising is not.
    windowsAtLeast: log.length >= LOG_SIZE,
    eventsHeld: log.length,
    version: posterior.version,
    source: posterior.source,
    at: posterior.at,
  };
}

/**
 * The axes the service would put a word to, by its own rule. An axis it is too uncertain about is
 * passed in as 0, which `describeAxes` then skips for the same reason `decode_traits` does: its
 * |mu| test cannot be met by a zero. So the variance gate is the only thing written here, and the
 * threshold, the poles and the "strongly" intensity all stay in the one shared file the Python
 * mirrors (packages/shared/src/persona.ts:76, services/ml/echo_ml/persona.py:540).
 */
export function namedAxes(posterior: Posterior): string[] {
  const v = posterior.var;
  if (!v) return [];
  return describeAxes(vectorToAxes(posterior.mu.map((mu, i) => (Number.isFinite(v[i]) && v[i] <= ASSERT_VAR_MAX ? mu : 0))));
}

/**
 * The one line the meter says, on hover or tap. It is here rather than in the JSX so a guard can read
 * it. Plain words (C68): an offline service is "cannot hear you", not the route's reason code; the
 * code is the inspector's to show, which already names it beside the posterior.
 */
export function headline(r: RecognitionReading, lang: Lang = "en"): string {
  switch (r.kind) {
    case "off":
      return t(lang, r.consent === "declined" ? "meter.offDeclined" : "meter.offUnset");
    case "waiting":
      return t(lang, "meter.waiting");
    case "offline":
      return t(lang, "meter.offline");
    case "no_variance":
      return t(lang, "meter.noVariance");
    case "measured": {
      const n = Math.round(r.certainty01 * 100);
      const pct = lang === "tr" ? `%${n} ${t(lang, "meter.sure")}` : `${n}% ${t(lang, "meter.sure")}`;
      const names = r.named.length ? t(lang, "meter.names", { n: r.named.length, of: PERSONA_AXIS_KEYS.length }) : t(lang, "meter.namesNone");
      const count = `${r.windows}${r.windowsAtLeast ? "+" : ""}`;
      return `${pct} · ${names} · ${count} ${t(lang, r.windows === 1 && !r.windowsAtLeast ? "meter.window" : "meter.windows")}`;
    }
  }
}

/** Names for the constellation's tooltip: which axis each phrase belongs to, in axis order. */
export function namedTitle(named: string[]): string {
  if (!named.length) return `none of the ${PERSONA_AXIS_KEYS.length} axes is both certain enough and far enough from neutral to assert`;
  return named.join(", ");
}

/** The poles of an axis, for the constellation's per-dot title. Order matches PERSONA_AXIS_KEYS. */
export function axisTitle(i: number): string {
  const key = PERSONA_AXIS_KEYS[i];
  const [neg, pos] = AXIS_POLES[key];
  return `${key}: ${neg} to ${pos}`;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
