/**
 * Regression test for the per-actor lost-update race (known-gaps ⚑16).
 *
 * WHAT THE DEFECT WAS. A persona update is a read-modify-write on that actor's posterior.
 * `WorldRoom.emitFirstContact` fires TWO events per actor back to back with `void
 * observeBehavioral(...)`, so both were in flight at once and one update was lost. Measured against
 * the real ML service: four events, `behaviors` 4, `persona.version` 2. Eight concurrent events for
 * one actor gave version 2 and behaviors 8 — six observations recorded and silently discarded. F2
 * and F3 are both shipped and both social, so half of every live player-to-player measurement was
 * being dropped, with no error, no log, and a posterior that looked fine.
 *
 * WHAT THIS TEST ASSERTS, and why it is stated this way. The emission site cannot see whether the
 * store lost an update; what it CAN guarantee is that it never gives the store the chance. So the
 * invariant is: **at most one observation in flight per actor at any moment**. A stub ML counts
 * concurrent handlers and records the high-water mark per actor.
 *
 * The second assertion matters as much as the first: DIFFERENT actors must still overlap. The loss
 * is strictly within one actor (six users' events posted concurrently each landed intact), so a
 * global chain would cost throughput and buy nothing.
 *
 * Pre-fix this file fails on the first assertion with maxConcurrent 8 against an expected 1.
 *
 * Run:  npm run test:race -w @echo/realtime
 * Zero keys, no network: the stub ML is a local http server on an ephemeral port.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { BehavioralEvent } from "@echo/shared";

/** Concurrency high-water mark per actor, measured inside the handler. */
const inFlight = new Map<string, number>();
const peak = new Map<string, number>();
let served = 0;

function stubMl(): Promise<{ server: HttpServer; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let actor = "?";
        try {
          actor = JSON.parse(body)?.event?.actor_id ?? "?";
        } catch { /* the shape is asserted by the ingress, not here */ }
        const now = (inFlight.get(actor) ?? 0) + 1;
        inFlight.set(actor, now);
        peak.set(actor, Math.max(peak.get(actor) ?? 0, now));
        // Hold the handler open long enough that genuine overlap is observable rather than a
        // scheduling accident. This is the window the real store's read-modify-write sits in.
        setTimeout(() => {
          inFlight.set(actor, (inFlight.get(actor) ?? 1) - 1);
          served++;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        }, 40);
      });
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }),
    );
  });
}

const ev = (actor: string, n: number): BehavioralEvent =>
  ({
    actor_id: actor,
    sessionId: "race_test",
    t: 1_700_000_000_000 + n,
    type: "social_cue",
    channel: "E",
    cue: "E1",
    action: "first_contact",
    polarity: "take",
    target: { id: "other", kind: "player", status: "peer" },
    context: {
      stakes: "low", audience_size: 0, public_or_private: "public",
      counterpart_status: "peer", stage: 2, scarcity_level: 0.2,
      mood_proxy: 0, time_pressure: 0,
    },
    raw_signals: { distance: 0.5 },
    payload: {},
    provenance: "live",
  }) as unknown as BehavioralEvent;

const BAR = "=".repeat(96);

async function main() {
  const { server, url } = await stubMl();
  // persistence.ts reads ML_SERVICE_URL at module load, so the env has to be set before the import.
  process.env.ML_SERVICE_URL = url;
  process.env.ML_SERVICE_TOKEN = "test-token";
  const { observeBehavioral } = await import("./persistence.js");

  console.log(BAR);
  console.log("per-actor observation race — regression test (known-gaps ⚑16)");
  console.log(BAR);

  // ── 1. ONE actor, eight observations fired at once. This is what emitFirstContact does (two per
  //       actor), amplified so the failure is unambiguous rather than a two-way coin flip. ──
  const N = 8;
  await Promise.all(Array.from({ length: N }, (_, i) => observeBehavioral(ev("actor_a", i))));
  const peakA = peak.get("actor_a") ?? 0;
  console.log(`\n[1] one actor, ${N} observations fired concurrently`);
  console.log(`    peak in-flight for that actor: ${peakA}   (must be 1)`);
  console.log(`    observations the stub actually served: ${served}   (must be ${N})`);
  assert.equal(peakA, 1,
    `per-actor observations must be serialized: peak in-flight was ${peakA}, expected 1. ` +
    "Two updates in flight for one actor is a lost persona update (⚑16).");
  assert.equal(served, N, "every observation must still be delivered, not dropped");

  // ── 2. DIFFERENT actors must still overlap: the loss is per actor, so a global chain would cost
  //       throughput and buy nothing. This is the assertion that keeps the fix honest. ──
  served = 0;
  peak.clear();
  const actors = ["b", "c", "d", "e", "f", "g"].map((s) => `actor_${s}`);
  const t0 = Date.now();
  await Promise.all(actors.map((a, i) => observeBehavioral(ev(a, i))));
  const elapsed = Date.now() - t0;
  const eachPeak = actors.map((a) => peak.get(a) ?? 0);
  console.log(`\n[2] ${actors.length} DIFFERENT actors, one observation each, fired concurrently`);
  console.log(`    per-actor peak in-flight: ${JSON.stringify(eachPeak)}   (each must be 1)`);
  console.log(`    wall clock: ${elapsed}ms   (serialized would be >= ${actors.length * 40}ms)`);
  assert.deepEqual(eachPeak, actors.map(() => 1), "each actor is still serialized against itself");
  assert.ok(elapsed < actors.length * 40,
    `different actors must run concurrently: ${elapsed}ms is at or above the fully serialized ` +
    `${actors.length * 40}ms, so the chain is global rather than per actor`);

  // ── 3. A failing observation must not block that actor's later ones. The chain is best-effort by
  //       design (the room never blocks on measurement), so a broken link cannot poison the rest. ──
  served = 0;
  peak.clear();
  server.close();
  await observeBehavioral(ev("actor_h", 1));   // the stub is gone; this resolves null, not throws
  process.env.ML_SERVICE_URL = url;            // still unreachable, but the call path is intact
  const after = await observeBehavioral(ev("actor_h", 2));
  console.log(`\n[3] an unreachable ML: the actor's next observation still runs (returned ${after})`);

  console.log(`\n${BAR}`);
  console.log("RESULT: PASS ✅  — one observation in flight per actor, actors still parallel");
  console.log(BAR);
}

main().catch((e) => {
  console.error(`\nRESULT: FAIL ❌\n${e?.message ?? e}`);
  process.exit(1);
});
