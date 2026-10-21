/**
 * The world's HUD at rest (DECISIONS C68): what a person sees on arriving, before they ask for anything.
 *
 * The complaint it answers was "there is an information card everywhere and it is not playable", so the
 * thing pinned here is the resting state: the place's name, the meter's mark, three buttons, and no
 * panel. Everything else is one press away, and that is pinned too: each thing the old cards offered
 * has a line in the menu.
 *
 * Run:  node --import tsx --test apps/web/tests/worldHud.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compiles the component's JSX to a bare `React.createElement`, which Next's compiler supplies
// and tsx does not (the same shim as tests/recognitionMeter.test.mts).
(globalThis as unknown as { React: typeof React }).React = React;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const HudModule = await import("../src/components/world/WorldHud");
const Hud = ((HudModule as unknown as { default: { default?: unknown } }).default.default ?? HudModule.default) as typeof HudModule.default;

const draw = (over: Partial<Parameters<typeof Hud>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(Hud, {
      world: () => null,
      name: "Senstrand",
      owned: false,
      shore: false,
      cell: "843f6a1ffffffff",
      coarse: false,
      consent: "accepted",
      meter: createElement("div", { "data-recognition": "waiting" }),
      inspecting: false,
      onToggleInspector: () => undefined,
      ...over,
    }),
  );

test("arriving shows the name, the meter's mark and three buttons, and no panel", () => {
  const html = draw();
  assert.match(html, /data-place-name[^>]*>Senstrand</);
  assert.match(html, /data-recognition/);
  for (const hook of ["data-hud-map", "data-hud-menu", 'href="/"']) assert.ok(html.includes(hook), `missing ${hook}`);
  assert.doesNotMatch(html, /data-hud-menu-open/, "the menu was open on arrival");
  assert.doesNotMatch(html, /data-hud-controls-hint/, "the controls were spelled out before anyone could have read them");
  assert.doesNotMatch(html, /data-village-news/, "news with nothing to say drew a box");
  // The map is there, folded: it keeps its state and draws nothing.
  assert.match(html, /data-minimap="building"[^>]*class="[^"]*\bhidden\b/);
  // The frame readout is WorldCanvas's, and the HUD has no table of its own.
  assert.doesNotMatch(html, /fps|triangles/);
});

test("land with no village is named by what it is, and your own land by whose it is", () => {
  assert.match(draw({ name: null }), />Open land</);
  assert.match(draw({ name: null, shore: true }), />Another shore</);
  assert.match(draw({ owned: true }), />Your corner of the world</);
});

test("every thing the old cards and buttons offered is still a line of the menu", () => {
  const src = readFileSync(new URL("../src/components/world/WorldHud.tsx", import.meta.url), "utf8");
  for (const hook of ["data-sound-toggle", "data-hud-mirror", "data-touch-inspector", "data-hud-controls", "data-report-open", "data-lang", "data-here"]) {
    assert.ok(src.includes(hook), `the menu lost ${hook}`);
  }
});

test("the HUD's entrance animates `translate`, so it cannot undo a centring transform", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const frames = css.slice(css.indexOf("@keyframes hud-in"), css.indexOf("}", css.indexOf("to {", css.indexOf("@keyframes hud-in"))) + 1);
  assert.match(frames, /translate:/);
  assert.doesNotMatch(frames, /transform:/, "hud-in animates transform, which replaces -translate-x-1/2 on every centred element for its length");
});
