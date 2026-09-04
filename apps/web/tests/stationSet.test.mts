/**
 * The parameter that builds the demo, and the cell it is allowed to build on (task A3).
 *
 * There is one rule here worth testing and it is a rule about the whole planet: at launch every
 * parcel is unclaimed, so any trigger that is not "this exact cell" puts a cave and a campfire on
 * all of them. `stationSetFor` is the only thing standing between a URL and that, so what is
 * asserted below is the refusal at least as hard as the grant.
 *
 * IT IS DRIVEN BY THE URL THE APP REALLY SENDS. `SLICE_HREF` is what /demo redirects to and what
 * the browser specs drive, and it is taken apart here with the platform's own parser and fed back
 * in. A test that built its own `stationSetFor(DEMO_CELL, "slice")` from a remembered shape would
 * stay green through a renamed parameter while every link on the site landed on a bare parcel,
 * which is the failure this project has already paid for once.
 *
 * Run:  node --import tsx --test apps/web/tests/stationSet.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DEMO_CELL } from "@echo/planet";

import { SLICE_HREF, STATIONS_PARAM, stationSetFor } from "../src/lib/stationSet";

/** A cell that is real, has land on it and is not the demo cell: the runner-up from the third
 *  demo-cell scan (packages/planet/lib/demo-cell.ts), forest 50%, ocean 44%, beach 6%. */
const OTHER_CELL = "847db45ffffffff";

/** The href taken apart the way the server takes the request apart. */
const asked = (href: string) => {
  const url = new URL(href, "http://localhost");
  return { cell: url.pathname.split("/").filter(Boolean)[1] ?? "", value: url.searchParams.get(STATIONS_PARAM) ?? undefined };
};

test("the address /demo redirects to is the one that builds the stations", () => {
  // Pinned as a literal as well as parsed, because the e2e specs and anyone typing it write the
  // literal, and a parameter renamed in one place and not the other is the whole hazard.
  assert.equal(SLICE_HREF, `/parcel/${DEMO_CELL}?stations=slice`);

  const { cell, value } = asked(SLICE_HREF);
  assert.equal(cell, DEMO_CELL, "the demo's href does not name the demo cell");
  assert.deepEqual(stationSetFor(cell, value), { set: "slice", refused: null });
});

test("the same parameter on another parcel builds nothing, and says why", () => {
  const { value } = asked(SLICE_HREF);
  const answer = stationSetFor(OTHER_CELL, value);
  assert.equal(answer.set, null, "a URL put the demo's cave and campfire on somebody else's land");
  assert.match(answer.refused ?? "", /C15/, "the refusal did not name the decision it enforces");
  assert.match(answer.refused ?? "", new RegExp(OTHER_CELL), "the refusal did not name the cell it was refused on");
});

test("an unknown value builds nothing on the demo cell either", () => {
  const answer = stationSetFor(DEMO_CELL, "campfire");
  assert.equal(answer.set, null);
  assert.match(answer.refused ?? "", /names no set of stations/);
});

test("no parameter is an ordinary parcel, and says nothing at all", () => {
  assert.deepEqual(stationSetFor(DEMO_CELL, undefined), { set: null, refused: null });
  assert.deepEqual(stationSetFor(DEMO_CELL, ""), { set: null, refused: null });
  assert.deepEqual(stationSetFor(OTHER_CELL, undefined), { set: null, refused: null });
});

test("a repeated parameter is read the way URLSearchParams reads it", () => {
  // Next hands an array back for ?stations=slice&stations=nonsense. The first wins on both sides.
  const query = new URLSearchParams("stations=slice&stations=nonsense");
  assert.equal(stationSetFor(DEMO_CELL, ["slice", "nonsense"]).set, query.get(STATIONS_PARAM));
});

test("the cell is matched case-folded, because this route never normalised what it was given", () => {
  assert.equal(stationSetFor(DEMO_CELL.toUpperCase(), "slice").set, "slice");
});

test("nothing off the URL can forge a line in the server log", () => {
  // The refusal is printed by the page with console.warn. A value carrying a newline would write
  // a second line that nobody in this codebase wrote.
  const answer = stationSetFor(DEMO_CELL, "slice\n[parcel] granted, actually");
  assert.equal(answer.set, null);
  assert.ok(!answer.refused!.includes("\n"), "a newline off the URL reached the log");
  assert.ok(answer.refused!.length < 200, "an arbitrarily long URL value reached the log");

  const long = stationSetFor("x".repeat(4000), "slice");
  assert.ok(long.refused!.length < 300, "a 4,000 character cell reached the log intact");
});
