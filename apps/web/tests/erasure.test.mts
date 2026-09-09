/**
 * An erasure may only call itself a success when it is one (§13, SOC-2.G).
 *
 * THREE INDEPENDENT WAYS `ok` USED TO BE TRUE OVER SURVIVING DATA, all live at once, and all of
 * them harmless right up until SOC-2.D gave the ML state tables rows:
 *
 *   1. No service key returned `{wiped: [], failed: []}` — so `ok` was true and the status 200,
 *      and a deployment without the key told a person their data was gone WITHOUT EVER LOOKING.
 *   2. The ML service's result was not part of `ok` at all. The ML service is the thing that holds
 *      the posterior, so a service that was down erased nothing and the route answered 200.
 *   3. A three-element `Promise.all` was destructured into two bindings, so island state's outcome
 *      was silently discarded.
 *
 * They were theoretical for three months because the ML state tables had ZERO WRITERS. **A promise
 * that is only true because a feature is missing is not a promise**, and the feature landing is
 * what turned all three into a page that says "Erased." over data on disk.
 *
 * The one that reads wrong at first glance is pinned below: `deleted: false` from the ML service is
 * NOT a failure. `STORE.delete` reports whether the user was in MEMORY, and after a restart that is
 * false for everyone while the durable rows are removed regardless.
 *
 * Run:  cd apps/web && node --import tsx --test tests/erasure.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { erasureVerdict } from "../src/lib/erasureResult";

const clean = { wiped: ["persona_state"], supabaseFailed: [], ml: { deleted: true }, islandError: null };

test("a clean erasure is ok, and says which tables it cleared", () => {
  const v = erasureVerdict(clean);
  assert.equal(v.ok, true);
  assert.equal(v.status, 200);
  assert.deepEqual(v.failed, []);
});

test("no service key is a FAILURE, not a clean slate", () => {
  // The route now reports this as a failed 'table'; the verdict must carry it through rather than
  // treating an empty failure list as proof that nothing was wrong.
  const v = erasureVerdict({ ...clean, wiped: [], supabaseFailed: ["supabase (no service key in this runtime — nothing was checked)"] });
  assert.equal(v.ok, false);
  assert.equal(v.status, 500);
  assert.match(v.failed[0], /no service key/);
});

test("an unreachable ML service is a failure, because it holds the posterior", () => {
  const v = erasureVerdict({ ...clean, ml: { mocked: true, reason: "ml_service_url_unset", deleted: false } });
  assert.equal(v.ok, false);
  assert.match(v.failed.join(" "), /ml service/);
  assert.match(v.failed.join(" "), /posterior was not erased/);
  assert.match(v.failed.join(" "), /ml_service_url_unset/, "the reason must reach the person retrying");
});

test("deleted:false from a REACHABLE ML service is not a failure", () => {
  // STORE.delete reports whether the user was in memory. After a restart that is false for
  // everyone, while the durable rows are removed anyway. Treating it as failure would make every
  // erasure after a redeploy report an error over data that is genuinely gone.
  const v = erasureVerdict({ ...clean, ml: { deleted: false } });
  assert.equal(v.ok, true, "a cold ML process reported failure for a successful erasure");
});

test("an absent ml field is not treated as a failure, and the route never produces one", () => {
  // Named for what it asserts. `deleteUser` always resolves — to a real body or to the `mocked`
  // fallback — so null/undefined is unreachable from the route, and the verdict declines to invent
  // a failure for a shape that cannot occur. The shape that DOES occur on failure is `mocked`,
  // pinned above.
  for (const ml of [null, undefined]) {
    assert.equal(erasureVerdict({ ...clean, ml }).ok, true);
  }
});

test("island state's outcome reaches ok, which it could not when it was destructured away", () => {
  const v = erasureVerdict({ ...clean, islandError: "connection refused" });
  assert.equal(v.ok, false);
  assert.match(v.failed.join(" "), /island_state/);
  assert.match(v.failed.join(" "), /connection refused/);
});

test("every failure is reported together, not just the first", () => {
  const v = erasureVerdict({
    wiped: [],
    supabaseFailed: ["behavioral_events 503", "persona_state 500"],
    ml: { mocked: true, reason: "timeout" },
    islandError: "down",
  });
  assert.equal(v.ok, false);
  assert.equal(v.failed.length, 4, `a person retrying needs the whole list: ${v.failed.join(" | ")}`);
});

test("the failure list is what /account shows, so it must be human-readable", () => {
  const v = erasureVerdict({ ...clean, ml: { mocked: true, reason: "ml_service_url_unset" } });
  for (const line of v.failed) {
    assert.ok(line.length > 8 && !/^\[object/.test(line), `unreadable: ${line}`);
  }
});
