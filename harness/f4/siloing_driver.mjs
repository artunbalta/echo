/**
 * The INTERACTION-path siloing driver: real Colyseus clients, a real player-to-player interaction.
 *
 * WHY THIS EXISTS, AND WHY THE PREVIOUS ASSERTION WAS NOT ENOUGH. There are two emission paths in
 * WorldRoom:
 *
 *   handleSocialCue    ONE event, into this actor's own posterior only. The counterpart emits
 *                      nothing at all.
 *   emitFirstContact   TWO events per actor, built side by side in ONE function from ONE
 *                      interaction, into two separate posteriors.
 *
 * The first version of this check drove the proxemic path and observed that A moved and B did not.
 * That is the expected result on a path where B is not supposed to fire, and a test cannot tell
 * "correctly siloed" from "B's channel never fired" when B was never going to fire. The second path
 * is where a mix-up would actually happen, because both actors' events are constructed in the same
 * place from the same data. And that is the path F4 runs on: repeated games are interactions, not
 * proximity.
 *
 * WHAT IS DRIVEN. Four live clients join one room at one spawn slot, so they are colocated and the
 * interaction-open proximity gate passes honestly rather than being bypassed.
 *
 *   phase 1  A opens on B.  A and B must both move; C and D must not.
 *   phase 2  A opens on D.  A and D must move; B must sit exactly where phase 1 left it.
 *   phase 3  B opens on C.  B is the INITIATOR this time (the other direction); B and C must move;
 *                           A and D must sit exactly where phase 2 left them.
 *   phase 4  Two clients join with the SAME userId, so one user holds both ends. The
 *            self-measurement guards (WorldRoom emitFirstContact and handleSocialCue) must emit
 *            NOTHING: a user must never socially measure themselves. Then the same social cue is
 *            sent to a DIFFERENT actor, which must emit — the control that distinguishes "the guard
 *            fired" from "the message never worked".
 *
 * Every posterior read here is the real GET /persona/<id> off the real ML service. This drives and
 * measures only; the verdicts are printed by f4_capture.py from the JSON on stdout.
 */
import { Client } from "colyseus.js";

const RT = process.env.RT_WS || "ws://127.0.0.1:2567";
const ML = process.env.ML || "http://127.0.0.1:8000";
const TOKEN = process.env.ML_SERVICE_TOKEN || "dev-ml-token-change-me";
const TAG = process.env.LABEL || `f4sil${Date.now()}`;
/** One spawn slot for everyone: spawnForSlot is deterministic, so all four land on the same tile
 *  and the server's own interaction-open distance gate passes for real. */
const SLOT = 3;
/** Long enough for the fire-and-forget observeBehavioral POSTs to reach ML and be folded in. */
const SETTLE_MS = 2200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mu(userId) {
  const r = await fetch(`${ML}/persona/${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  const j = await r.json();
  return j?.persona?.mu ?? null;
}

const moved = (a, b) =>
  a && b ? Math.hypot(...a.map((v, i) => b[i] - v)) : null;

/** One connected actor: its colyseus room handle, its refId, and the interaction it is in. */
async function join(client, roomId, userId, name) {
  const room = roomId
    ? await client.joinById(roomId, { userId, name, sessionId: `${TAG}_${name}`, slotIndex: SLOT })
    : await client.joinOrCreate("world", { userId, name, sessionId: `${TAG}_${name}`, slotIndex: SLOT });
  const actor = { room, userId, name, entityId: room.sessionId, openId: null };
  room.onMessage("interact_opened", (m) => { actor.openId = m?.interactionId ?? null; });
  room.onMessage("error", () => {});
  await sleep(250);
  return actor;
}

/** Open a real interaction between two live players, let the emissions land, then close it. */
async function interact(from, to) {
  from.openId = null;
  from.room.send("interact_start", { targetId: to.entityId });
  await sleep(SETTLE_MS);
  const opened = from.openId;
  if (opened) {
    from.room.send("interact_end", { interactionId: opened });
    await sleep(400);
  }
  return opened;
}

async function main() {
  const client = new Client(RT);
  const ids = {
    a: `${TAG}_a`, b: `${TAG}_b`, c: `${TAG}_c`, d: `${TAG}_d`,
    twin: `${TAG}_twin`,
  };

  const a = await join(client, null, ids.a, "a");
  const roomId = a.room.roomId;
  const b = await join(client, roomId, ids.b, "b");
  const c = await join(client, roomId, ids.c, "c");
  const d = await join(client, roomId, ids.d, "d");
  await sleep(600);

  const read = async () => ({
    a: await mu(ids.a), b: await mu(ids.b), c: await mu(ids.c), d: await mu(ids.d),
  });

  const out = { ids, phases: {} };
  const base = await read();

  // ── phase 1: A opens on B. Both participants move; both bystanders do not. ──
  const open1 = await interact(a, b);
  const p1 = await read();
  out.phases.ab = {
    openedId: open1,
    movedA: moved(base.a, p1.a), movedB: moved(base.b, p1.b),
    movedC: moved(base.c, p1.c), movedD: moved(base.d, p1.d),
  };

  // ── phase 2: A opens on D. B, a former participant, must now be frozen. ──
  const open2 = await interact(a, d);
  const p2 = await read();
  out.phases.ad = {
    openedId: open2,
    movedA: moved(p1.a, p2.a), movedD: moved(p1.d, p2.d),
    movedB: moved(p1.b, p2.b), movedC: moved(p1.c, p2.c),
  };

  // ── phase 3: B initiates on C. The other direction, and A/D must now be frozen. ──
  const open3 = await interact(b, c);
  const p3 = await read();
  out.phases.bc = {
    openedId: open3,
    movedB: moved(p2.b, p3.b), movedC: moved(p2.c, p3.c),
    movedA: moved(p2.a, p3.a), movedD: moved(p2.d, p3.d),
  };

  // ── phase 4: the self-measurement guard. One userId, two clients. ──
  const t1 = await join(client, roomId, ids.twin, "twin1");
  const t2 = await join(client, roomId, ids.twin, "twin2");
  await sleep(500);
  const twinBase = await mu(ids.twin);
  const open4 = await interact(t1, t2);
  // and the SOCIAL_CUE guard, which is the same rule on the one-event path
  t1.room.send("social_cue", { targetId: t2.entityId, action: "opener_warm", latencyMs: 800 });
  await sleep(SETTLE_MS);
  const twinAfter = await mu(ids.twin);

  // The control: the SAME cue aimed at a DIFFERENT actor must emit, or "nothing happened" would be
  // indistinguishable from a message that simply does not work.
  const cBefore = await mu(ids.c);
  t1.room.send("social_cue", { targetId: c.entityId, action: "opener_warm", latencyMs: 800 });
  await sleep(SETTLE_MS);
  const twinAfterControl = await mu(ids.twin);
  const cAfterControl = await mu(ids.c);

  out.phases.self = {
    // interact_opened still fires (the room opens the conversation); the MEASUREMENT is what must not.
    openedId: open4,
    movedTwin: moved(twinBase, twinAfter),                       // must be exactly 0
    movedTwinOnControlCue: moved(twinAfter, twinAfterControl),   // must be > 0: the cue does work
    movedTargetOnControlCue: moved(cBefore, cAfterControl),      // must be 0: only the ACTOR is measured
  };
  out.base = base;
  out.final = p3;

  for (const actor of [a, b, c, d, t1, t2]) {
    try { await actor.room.leave(true); } catch { /* teardown is best-effort */ }
  }
  await sleep(400);
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ error: String(e && e.stack ? e.stack : e) }));
  process.exit(3);
});
