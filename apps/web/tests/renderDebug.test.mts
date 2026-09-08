/**
 * The gate on the numbers, and the URL that opens it (SOC-1.A).
 *
 * The rule worth testing is the REFUSAL, not the grant: a production build that reports its frame to
 * everyone who never asked is a HUD nobody signed off, and DECISIONS C23's proposal was a query
 * parameter precisely so the default stays silent. So the "off" cases below are at least as hard as
 * the "on" ones, and they run through `renderDebugFor`, which is the function `WorldCanvas` itself
 * calls — not a copy of its shape. That is `parcelWorld.ts`'s own lesson, one level up.
 *
 * Run:  cd apps/web && node --import tsx --test tests/renderDebug.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { RENDER_DEBUG_QUERY, RENDER_LAYERS_QUERY, renderDebugFor } from "../src/lib/renderDebug";

/** A URL taken apart the way the browser takes it apart, which is what the effect reads. */
const search = (href: string) => new URL(href, "http://localhost").search;

test("a production page says nothing unless it is asked", () => {
  assert.equal(renderDebugFor("production", ""), "off");
  assert.equal(renderDebugFor("production", search("/parcel/8482589ffffffff")), "off");
  assert.equal(renderDebugFor("production", search("/parcel/847b949ffffffff?stations=slice")), "off");
});

test("the parameter opens it, and the level says how far", () => {
  assert.equal(renderDebugFor("production", search(`/parcel/8482589ffffffff?${RENDER_DEBUG_QUERY}`)), "frame");
  assert.equal(renderDebugFor("production", search(`/parcel/8482589ffffffff?${RENDER_LAYERS_QUERY}`)), "layers");
  // The demo's own URL plus the parameter: the two never collide, and stationSet reads only its own.
  assert.equal(
    renderDebugFor("production", search(`/parcel/847b949ffffffff?stations=slice&${RENDER_DEBUG_QUERY}`)),
    "frame",
  );
});

test("a value that is not a level is not a level", () => {
  assert.equal(renderDebugFor("production", search("/parcel/x?debug=1")), "off");
  assert.equal(renderDebugFor("production", search("/parcel/x?debug=Render")), "off");
  assert.equal(renderDebugFor("production", search("/parcel/x?debug=")), "off");
  assert.equal(renderDebugFor("production", search("/parcel/x?render=1")), "off");
});

test("development reports without being asked, exactly as it did before", () => {
  for (const env of ["development", "test", undefined]) {
    assert.equal(renderDebugFor(env, ""), "frame", `${env} should report by default`);
    // ...and can still be asked for the expensive level.
    assert.equal(renderDebugFor(env, search(`/parcel/x?${RENDER_LAYERS_QUERY}`)), "layers");
  }
});

test("layers wins over render however they are ordered, because it is the superset", () => {
  assert.equal(renderDebugFor("production", search("/parcel/x?debug=render&debug=layers")), "layers");
  assert.equal(renderDebugFor("production", search("/parcel/x?debug=layers&debug=render")), "layers");
});
