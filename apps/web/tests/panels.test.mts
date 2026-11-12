/**
 * One panel at a time over the world, in one frame (DECISIONS C96).
 *
 * What people shown the village could not do was find anything: the envelopes, the mirror, the friends'
 * panel and the report each had a frame, a place on the screen and a way of closing of their own, two
 * could be open one over the other, and nothing on one led to another. So what is pinned here is the
 * one answer to "what is open" (`lib/panels.ts`), the one frame with the echo's four pages as tabs
 * (`components/world/Panel.tsx`), and that every panel asks the first and wears the second.
 *
 * Run:  node --import tsx --test apps/web/tests/panels.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { React: typeof React }).React = React;

import { closePanel, ECHO_TABS, openPanel, panelNow, togglePanel } from "../src/lib/panels";

const PanelModule = await import("../src/components/world/Panel");
const EchoPanel = ((PanelModule as unknown as { default: { default?: unknown } }).default.default ?? PanelModule.default) as typeof PanelModule.default;
const src = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("opening one panel is closing the rest, and a panel closes only itself by name", () => {
  assert.equal(panelNow(), null);
  openPanel("guesses");
  openPanel("portrait");
  assert.equal(panelNow(), "portrait", "two panels were open at once");
  // The envelopes' own close must not shut the mirror that has since opened over the same spot.
  closePanel("guesses");
  assert.equal(panelNow(), "portrait");
  closePanel("portrait");
  assert.equal(panelNow(), null);
  // A key that opens also closes.
  togglePanel("guesses");
  togglePanel("guesses");
  assert.equal(panelNow(), null);
  openPanel("report");
  closePanel();
  assert.equal(panelNow(), null);
});

test("the echo's four pages share one row of tabs and one cross; the report has its title instead", () => {
  const html = renderToStaticMarkup(createElement(EchoPanel, { tab: "portrait", label: "The mirror", children: createElement("p", null, "inside") }));
  for (const name of ECHO_TABS) assert.match(html, new RegExp(`data-echo-tab="${name}"`), `no tab for ${name}`);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(html, /data-echo-tab="portrait"[^>]*aria-selected="true"/);
  assert.equal((html.match(/data-panel-close/g) ?? []).length, 1);
  assert.match(html, />Guesses</);
  assert.match(html, />How it sees you</);
  assert.match(html, />Privacy</);
  assert.match(html, />inside</);

  const report = renderToStaticMarkup(createElement(EchoPanel, { tab: "report", label: "Something wrong here?", children: null }));
  assert.doesNotMatch(report, /data-echo-tab/, "the report is not one of the echo's pages");
  assert.match(report, /<h2[^>]*>Something wrong here\?<\/h2>/);
  assert.equal((report.match(/data-panel-close/g) ?? []).length, 1);
});

test("every panel over the world asks the one answer and wears the one frame", () => {
  for (const file of ["components/world/Envelopes.tsx", "components/world/Mirror.tsx", "components/world/EchoPairs.tsx", "components/world/ReportPanel.tsx"]) {
    const s = src(file);
    assert.match(s, /usePanel\(\)/, `${file} keeps an open of its own`);
    assert.match(s, /<EchoPanel\b/, `${file} draws a frame of its own`);
    assert.doesNotMatch(s, /\[open, setOpen\] = useState/, `${file} keeps an open of its own`);
  }
  // The inspector and the pack are not pages of the echo, but they do not open over one either.
  assert.match(src("components/planet/ParcelCanvas.tsx"), /if \(panelOpen\) setInspecting\(false\)/);
  assert.match(src("components/world/Interact.tsx"), /if \(panelOpen\) setPackOpen\(false\)/);
});

test("your say over the echo is a page of its own: stopping and erasing are not under the reading", () => {
  const s = src("components/world/Mirror.tsx");
  const say = s.slice(s.indexOf("data-mirror-say"));
  for (const hook of ["data-mirror-stop", "data-mirror-watch", "data-mirror-voices-off", "data-mirror-erase", "data-mirror-erase-yes", "data-mirror-id", "data-mirror-inspect"]) {
    assert.ok(say.includes(hook), `the privacy page lost ${hook}`);
  }
  // And the reading's page says where they went.
  assert.match(s, /data-mirror-to-privacy/);
});
