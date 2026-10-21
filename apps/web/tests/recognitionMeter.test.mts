/**
 * The recognition meter, held to the one thing it can get wrong: printing a number nothing stands
 * behind. It is the bar version of the failure DECISIONS.md C15 records against the inspector, and
 * a filled bar is a much easier place to commit it, because a fill reads as a result whatever the
 * label above it says.
 *
 * WHERE THE EXPECTATIONS COME FROM, which is the part that matters. The three fixtures below were
 * captured from the LIVE ML service through the shipped routes (POST /api/telemetry with
 * passive_locomotion windows, then GET /api/agent/persona), and each one carries the service's OWN
 * `uncertainty` and its OWN `traits`. Those two fields are the expectations: the certainty assertion
 * is checked against Python's np.mean(diag(Sigma)) and the naming assertion against
 * persona.decode_traits, neither of which this module can influence. Nothing here is predicted by
 * re-running the code under test.
 *
 * The last test renders the SHIPPED component, because the honesty promise is about pixels: what is
 * being asserted is that the tide element exists in exactly one of the five states and that its
 * width is the percentage the reading computed, which a test of the pure function alone cannot see.
 *
 * Run:  node --import tsx --test apps/web/tests/recognitionMeter.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// apps/web/tsconfig.json sets jsx "preserve", which hands the JSX to Next; running the same file
// under tsx instead falls back to the classic transform, so the component's compiled body calls a
// bare `React.createElement`. Next's compiler injects that name and tsx does not. The component is
// not touched for the sake of the test: the name it expects is put where it looks for it. Assigning
// after the imports is safe because the call happens at render, not at module evaluation.
(globalThis as unknown as { React: typeof React }).React = React;

import { LOG_SIZE, type MeasureLogEntry, type Posterior } from "../src/game/world/measure";
import {
  headline,
  namedAxes,
  recognitionReading,
  type RecognitionReading,
} from "../src/components/world/recognitionReading";
import RecognitionMeter from "../src/components/world/RecognitionMeter";

// ── what the live service said, at three points on one walk ─────────────────────
//
// Captured 2026-09-04 against echo-ml on localhost:8000 through localhost:3000's own routes, for a
// user with no history, on a trajectory of rising tortuosity and novelty. `uncertainty` and
// `traits` are the service's, computed in Python; they are what the assertions below are measured
// against.
interface ServiceState {
  mu: number[];
  var: number[];
  version: number;
  /** np.mean(diag(Sigma)) as the service reports it (app.py:409). */
  uncertainty: number;
  /** persona.decode_traits(posterior) as the service reports it (app.py:406). */
  traits: string[];
}

const PRIOR: ServiceState = {
  mu: [0, 0, 0, 0, 0, 0, 0, 0],
  var: [1, 1, 1, 1, 1, 1, 1, 1],
  version: 0,
  uncertainty: 1,
  traits: [],
};

const ONE_WINDOW: ServiceState = {
  mu: [
    -0.03483963513742319, -0.05290237161019665, -0.1025964880548044, 0.020983067173366038,
    0.06665701485424073, -0.12179999850537317, 0.2694840616880586, 0.014256557737675635,
  ],
  var: [
    0.23012063122497867, 0.20317698078286212, 0.29912350122557213, 0.1089935270979234,
    0.22770671228075487, 0.0724582182908785, 0.18816146011833537, 0.06233271111577864,
  ],
  version: 1,
  uncertainty: 0.17400921776713546,
  traits: [],
};

const SIXTEEN_WINDOWS: ServiceState = {
  mu: [
    -0.0537881147739847, -0.05616728130097746, -0.1092585175475743, 0.020088099482569358,
    0.08016391125157914, -0.13579761390868603, 0.332371759333459, 0.02086663503666802,
  ],
  var: [
    0.021230866916426512, 0.020663639777911563, 0.028206335422638774, 0.020227427345516552,
    0.020101411693648364, 0.020196913148106267, 0.02066029504860772, 0.020080833778678506,
  ],
  version: 16,
  uncertainty: 0.021420965391441782,
  traits: ["fast"],
};

const STATES: [name: string, state: ServiceState][] = [
  ["the prior, nothing measured", PRIOR],
  ["one locomotion window", ONE_WINDOW],
  ["sixteen locomotion windows", SIXTEEN_WINDOWS],
];

const real = (s: ServiceState): Posterior => ({
  mu: s.mu,
  var: s.var,
  version: s.version,
  mocked: false,
  source: "event",
  at: 1_756_900_000_000,
});

const window_ = (n: number, mocked = false): MeasureLogEntry => ({
  id: `landing-test#${n}`,
  action: "passive_locomotion",
  route: "telemetry",
  features: ["novel_tile_ratio", "path_tortuosity"],
  delta_mu: null,
  mu: null,
  version: null,
  mocked,
  durable: true,
  at: 1_756_900_000_000 + n,
});

/** Any percentage at all in a line. The point of the off/offline states is that there is none. */
const PERCENT = /\d+\s*%/;

// ── the states with no number behind them ───────────────────────────────────────

test("before consent the meter is off, and off is not a bar at zero", () => {
  for (const consent of ["unset", "declined"] as const) {
    const r = recognitionReading({ consent, posterior: null, log: [] });
    assert.deepEqual(r, { kind: "off", consent }, `consent ${consent}`);
    const line = headline(r);
    assert.match(line, /^off /, `consent ${consent}: the line must open with "off"`);
    assert.doesNotMatch(line, PERCENT, `consent ${consent}: no percentage may be shown while nothing is measured`);
  }
  // Declining is a different sentence from never having been asked: one is a refusal, the other is
  // a question still open, and the copy must not flatten them into one.
  assert.notEqual(
    headline({ kind: "off", consent: "unset" }),
    headline({ kind: "off", consent: "declined" }),
  );
});

test("consent given and no posterior yet is waiting, not zero", () => {
  const r = recognitionReading({ consent: "accepted", posterior: null, log: [] });
  assert.equal(r.kind, "waiting");
  assert.doesNotMatch(headline(r), PERCENT);
});

test("a mocked posterior says plainly that the echo cannot hear, with no percentage and no route code", () => {
  const posterior: Posterior = {
    mu: [0, 0, 0, 0, 0, 0, 0, 0],
    var: null,
    version: null,
    mocked: true,
    reason: "ml_service_url_unset",
    source: "seed",
    at: 1_756_900_000_000,
  };
  const r = recognitionReading({ consent: "accepted", posterior, log: [window_(1)] });
  assert.equal(r.kind, "offline");
  const line = headline(r);
  // The reason is the inspector's to show, beside the posterior it explains (DECISIONS C68); a
  // person glancing at the meter is told what it means for them, not the route's error code.
  assert.equal(line, "your echo cannot hear you just now");
  assert.doesNotMatch(line, /ml_|_unset|_failed/);
  assert.doesNotMatch(line, PERCENT);
  assert.equal(headline(r, "tr"), "yankın şu an seni duyamıyor");
});

test("in Turkish the percentage leads with its sign, and every state still has a sentence", () => {
  const r = recognitionReading({ consent: "accepted", posterior: real(PRIOR), log: [] });
  assert.equal(headline(r, "tr"), "%0 emin · henüz sana dair bir şey söyleyemiyor · 0 ölçüm");
  assert.match(headline({ kind: "off", consent: "unset" }, "tr"), /^kapalı /);
  assert.notEqual(headline({ kind: "off", consent: "unset" }, "tr"), headline({ kind: "off", consent: "declined" }, "tr"));
});

test("a real posterior with no covariance draws nothing rather than guessing", () => {
  const posterior: Posterior = { ...real(SIXTEEN_WINDOWS), var: null };
  const r = recognitionReading({ consent: "accepted", posterior, log: [] });
  assert.equal(r.kind, "no_variance");
  assert.doesNotMatch(headline(r), PERCENT);
});

// ── the number itself, against the service's own arithmetic ─────────────────────

test("the certainty is the service's own uncertainty, complemented", () => {
  for (const [name, s] of STATES) {
    const r = recognitionReading({ consent: "accepted", posterior: real(s), log: [] });
    assert.equal(r.kind, "measured", name);
    if (r.kind !== "measured") return;
    // np.mean(diag(Sigma)) computed in Python, against mean(var) computed here. Float64 summation
    // order is the only thing that can separate them, so the tolerance is at the last bits.
    assert.ok(
      Math.abs(r.meanVar - s.uncertainty) < 1e-12,
      `${name}: mean variance ${r.meanVar} against the service's ${s.uncertainty}`,
    );
    assert.ok(
      Math.abs(r.certainty01 - (1 - s.uncertainty)) < 1e-12,
      `${name}: certainty ${r.certainty01} against 1 - ${s.uncertainty}`,
    );
  }
});

test("the prior reads 0%, because an unmoved posterior is a measurement and not a blank", () => {
  const r = recognitionReading({ consent: "accepted", posterior: real(PRIOR), log: [] });
  assert.equal(r.kind, "measured");
  if (r.kind !== "measured") return;
  assert.equal(r.certainty01, 0);
  assert.equal(headline(r), "0% sure · names nothing of you yet · 0 windows");
});

test("the axes it says it names are the axes the service names", () => {
  for (const [name, s] of STATES) {
    assert.deepEqual(namedAxes(real(s)), s.traits, `${name}: decode disagrees with the service`);
  }
  // And the sixteen-window state is the one that proves the rule bites: pace is at 0.3324, over the
  // 0.33 the service asserts at, while every other axis is inside it and stays unnamed.
  assert.deepEqual(SIXTEEN_WINDOWS.traits, ["fast"]);
  const r = recognitionReading({ consent: "accepted", posterior: real(SIXTEEN_WINDOWS), log: [] });
  assert.equal(r.kind === "measured" && r.named.length, 1);
});

test("an axis the posterior is too uncertain about is not named, however far from neutral", () => {
  // Same means, but every variance pushed just past the 0.6 the service refuses to assert above.
  const shaky: Posterior = { ...real(SIXTEEN_WINDOWS), var: SIXTEEN_WINDOWS.var.map(() => 0.61) };
  assert.deepEqual(namedAxes(shaky), []);
  // and just inside it, the same posterior names what it named before
  const steady: Posterior = { ...real(SIXTEEN_WINDOWS), var: SIXTEEN_WINDOWS.var.map(() => 0.6) };
  assert.deepEqual(namedAxes(steady), SIXTEEN_WINDOWS.traits);
});

// ── the evidence beside the number ──────────────────────────────────────────────

test("windows counts locomotion that REACHED the service, and nothing else", () => {
  const log: MeasureLogEntry[] = [
    window_(1),
    window_(2, true), // mocked: it moved nothing, so it is not evidence
    window_(3),
    { ...window_(4), action: "enter_cave", route: "behavioral" }, // a different channel
    window_(5),
  ];
  const r = recognitionReading({ consent: "accepted", posterior: real(ONE_WINDOW), log });
  assert.equal(r.kind, "measured");
  if (r.kind !== "measured") return;
  assert.equal(r.windows, 3);
  assert.equal(r.windowsAtLeast, false);
  assert.equal(r.eventsHeld, 5);
  assert.match(headline(r), /· 3 windows$/);
});

test("a full log says the count is a floor, because the ring has dropped what it cannot hold", () => {
  const log = Array.from({ length: LOG_SIZE }, (_, i) => window_(i + 1));
  const r = recognitionReading({ consent: "accepted", posterior: real(SIXTEEN_WINDOWS), log });
  assert.equal(r.kind, "measured");
  if (r.kind !== "measured") return;
  assert.equal(r.windows, LOG_SIZE);
  assert.equal(r.windowsAtLeast, true);
  assert.match(headline(r), new RegExp(`· ${LOG_SIZE}\\+ windows$`));
});

test("one window is a window and two are windows", () => {
  const one = recognitionReading({ consent: "accepted", posterior: real(ONE_WINDOW), log: [window_(1)] });
  const two = recognitionReading({ consent: "accepted", posterior: real(ONE_WINDOW), log: [window_(1), window_(2)] });
  assert.match(headline(one), /1 window$/);
  assert.match(headline(two), /2 windows$/);
});

// ── what actually gets drawn ────────────────────────────────────────────────────

/**
 * The shipped component, rendered. `expanded` starts false, so this is the glance state.
 *
 * The unwrap is tsx's CJS interop: the .tsx is compiled to `exports.default = Meter`, and the
 * default import of that from an .mts hands back the module record rather than the function, which
 * React rejects with "Element type is invalid ... but got: object". Taking `.default` when it is
 * there is the whole of it; the component itself is imported and rendered unmodified.
 */
const Meter = ((RecognitionMeter as unknown as { default?: unknown }).default ?? RecognitionMeter) as typeof RecognitionMeter;

const draw = (consent: "unset" | "declined" | "accepted", posterior: Posterior | null, log: MeasureLogEntry[] = []) =>
  renderToStaticMarkup(createElement(Meter, { consent, posterior, log }));

test("the tide is drawn in exactly one state, and its width is the certainty", () => {
  const mocked: Posterior = { mu: PRIOR.mu, var: null, version: null, mocked: true, reason: "ml_forward_failed", source: "seed", at: 0 };
  const nothing: [name: string, html: string][] = [
    ["unset", draw("unset", null)],
    ["declined", draw("declined", null)],
    ["waiting", draw("accepted", null)],
    ["offline", draw("accepted", mocked)],
    ["no covariance", draw("accepted", { ...real(ONE_WINDOW), var: null })],
  ];
  for (const [name, html] of nothing) {
    assert.doesNotMatch(html, /recognition-tide/, `${name}: a tide was drawn for a state with no number`);
    assert.doesNotMatch(html, /width:\s*\d/, `${name}: a width was set for a state with no number`);
    assert.match(html, /border-dashed/, `${name}: the empty state must be a dashed rule, not an empty track`);
  }

  const html = draw("accepted", real(SIXTEEN_WINDOWS), [window_(1)]);
  assert.match(html, /recognition-tide/);
  // 1 - 0.021420965391441782 = 0.9785790346085582 -> 98%, rounded from the service's own number.
  assert.match(html, /width:\s*98%/);
  assert.match(html, /98% sure/);
});

test("the glance state draws no fill at the prior, and says how little it has", () => {
  const html = draw("accepted", real(PRIOR), []);
  assert.match(html, /width:\s*0%/);
  assert.match(html, /0% sure/);
  assert.match(html, /names nothing of you yet/);
  assert.match(html, /0 windows/);
});

test("the constellation lights one dot per axis the service would name", () => {
  const lit = (html: string) => (html.match(/star-lit/g) ?? []).length;
  assert.equal(lit(draw("accepted", real(PRIOR))), 0);
  assert.equal(lit(draw("accepted", real(ONE_WINDOW))), 0);
  assert.equal(lit(draw("accepted", real(SIXTEEN_WINDOWS))), SIXTEEN_WINDOWS.traits.length);
});

test("every state the reading can take has a sentence, and only one of them has a percentage", () => {
  const all: RecognitionReading[] = [
    { kind: "off", consent: "unset" },
    { kind: "off", consent: "declined" },
    { kind: "waiting" },
    { kind: "offline", reason: "consent_off" },
    { kind: "no_variance", version: 3 },
    recognitionReading({ consent: "accepted", posterior: real(ONE_WINDOW), log: [window_(1)] }),
  ];
  const withPercent = all.filter((r) => PERCENT.test(headline(r)));
  assert.equal(withPercent.length, 1);
  for (const r of all) assert.ok(headline(r).length > 8, `${r.kind} has no sentence`);
});

/**
 * The state the fifteen tests above could not reach, and the reason it matters.
 *
 * Every test of "consent unset or declined draws no fill" passed `posterior: null`, so changing the
 * gate from `consent !== "accepted"` to `consent !== "accepted" && !posterior` left all fifteen
 * green while printing a confident percentage to somebody who had just said no. The state is not
 * hypothetical: measure.ts's decline() calls disarm(), which nulls the sampler and the collector
 * and NOT the posterior, and ParcelCanvas passes chain.posterior() straight in. So a person who
 * accepted, walked, and then declined still has a real posterior in hand.
 */
test("a declined answer draws nothing even when a real posterior is still in hand", () => {
  const posterior: Posterior = {
    mu: Array.from({ length: 8 }, () => 0.4),
    var: Array.from({ length: 8 }, () => 0.05),
    version: 7,
    mocked: false,
    reason: undefined,
    source: "event",
    at: 1,
  } as Posterior;
  for (const consent of ["declined", "unset"] as const) {
    const reading = recognitionReading({ consent, posterior, log: [] });
    assert.equal(
      reading.kind,
      "off",
      `${consent} with a live posterior still in hand produced ${reading.kind}, so a percentage would be drawn for somebody who said no`,
    );
  }
  // And the same posterior IS read when the answer is yes, so the assertion above is about consent
  // and not about the posterior being unusable.
  assert.notEqual(recognitionReading({ consent: "accepted", posterior, log: [] }).kind, "off");
});
