/**
 * The revoke the consent card promises (SOC-1.E), held to what a render can see.
 *
 * `ConsentCard` says "you can stop it at any time from the inspector". `chain.revoke()` existed and
 * was tested, and had NO PRODUCTION CALLER — so the sentence was false on every device, not only on
 * the phone C23 fixed. This file pins the two markup rules that make it true: the control exists
 * exactly where it can do something, and the panel says afterwards what was stopped and, as
 * plainly, what was not.
 *
 * THIS FILE ALONE CANNOT CLOSE THE TICKET, and that is worth saying out loud in the register this
 * repo keeps. Delete the `onRevoke` line from ParcelCanvas.tsx and every assertion here still
 * passes: a component test cannot see whether the mount wired the callback to the chain. That is
 * the same render-blind gap ⚑11 records. The wire belongs in a browser test.
 *
 * Run:  cd apps/web && node --import tsx --test tests/inspectorRevoke.test.mts
 *       (from apps/web, because the component imports through the `@/` alias and tsx reads the
 *        paths out of apps/web/tsconfig.json — which is how `npm test -w @echo/web` runs it.)
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// tsx uses the classic JSX transform and the component's body calls a bare React.createElement,
// which Next injects and tsx does not. Same reason as recognitionMeter.test.mts.
(globalThis as unknown as { React: typeof React }).React = React;

import Inspector from "../src/components/world/Inspector";
import type { ConsentState } from "../src/game/world/measure";

const Panel = ((Inspector as unknown as { default?: unknown }).default ?? Inspector) as typeof Inspector;

const draw = (consent: ConsentState, onRevoke?: () => void) =>
  renderToStaticMarkup(
    createElement(Panel, { posterior: null, log: [], consent, onRevoke, open: true, onOpenChange: () => {} }),
  );

test("the stop control is drawn only where it can actually stop something", () => {
  assert.match(draw("accepted", () => {}), /data-consent-revoke/);
  for (const consent of ["unset", "declined"] as const) {
    assert.doesNotMatch(
      draw(consent, () => {}),
      /data-consent-revoke/,
      `${consent}: there is nothing running to stop`,
    );
  }
  assert.doesNotMatch(
    draw("accepted"),
    /data-consent-revoke/,
    "no callback: a button that stops nothing is a second false promise in the same panel",
  );
});

test("after a stop the panel says what was stopped and what was not", () => {
  const html = draw("declined");
  assert.match(html, /data-consent="declined"/);
  assert.match(html, /data-consent-stopped/);
  assert.match(html, /erase it at \/account/, "the panel must not imply stored rows were recalled");
  assert.doesNotMatch(html, /erased/, "'erased' would be the next false sentence");
});

test("the control carries an accessible name, because it is a div and not a button", () => {
  // It is a div for the reason C23 records for the whole HUD: a focused button eats the spacebar,
  // which is jump in this world. That trade is only payable if the name is supplied by hand.
  const html = draw("accepted", () => {});
  assert.match(html, /role="button"/);
  assert.match(html, /aria-label="Stop the measurement"/);
});
