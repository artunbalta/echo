# Human browser verification: the 3D world actually renders

This is the gate that was skipped between the 3D migration branch and its merge, and skipping it is
why an invisible landmass reached production. It exists because **the measurement spine is
renderer-independent by design.** It reads timing, path, hesitation, thoroughness and persistence,
and it knows nothing about how the world is drawn. Collision runs on `oceanLandAt(x, y, OCEAN_BEACH_W)`
over the flat plane, untouched by anything visual. So a player can walk the island, perform every
Flow-1 beat and emit a perfectly valid cue stream through a world in which the land is not drawn at
all.

A green `npm run build`, 129 passing ML tests, an empty protected diff and a correct individuation
number are **all fully compatible with an invisible world.** Only a person looking at a real browser
closes that gap. Headless WebGL is not trustworthy here and is precisely what failed to catch this.

Nothing in this file may be marked done by an agent. Run it yourself, in a real browser.

---

## Setup: the zero-key three-service local run

Three terminals, from the repo root. No API keys; providers fall back to mocks.

```bash
npm install
npm run build:shared
npm run seed          # only if db/seed/npcs.generated.json is missing

# terminal 1
npm run dev:ml        # FastAPI on :8000

# terminal 2
npm run dev:realtime  # Colyseus on :2567

# terminal 3
npm run dev:web       # Next.js on :3000
```

Wait for `[echo-realtime] listening on 0.0.0.0:2567`, `Application startup complete`, and Next's
`Ready`. If port 3000 or 2567 is already taken by an unrelated dev server, free it first, because a
different port works for steps 1 and 4 but complicates step 2.

---

## 1. Land is visible under the player

Open <http://localhost:3000/play>. Step through to the world.

- [ ] There is **land under the avatar**, not open water. This is the whole point of the check: the
      shipped bug drew nothing but sea with the trees, bushes and rocks apparently floating on it.
- [ ] The **sand ring meets the sea flush**, with no seam, no gap, no z-fighting stripe at the waterline.
      `groundHeight()` flattens to exactly zero at the shore, so the beach should sit dead level with
      the sea plane.
- [ ] The island **reads as a dome, not a flat card**: walking toward the middle, the ground rises
      and the low western key light shades the near and far slopes differently.
- [ ] Trees, bushes and rocks **sit on the dirt**, roots buried, not hovering above or sunk into it.
- [ ] Walk to the shoreline in all four directions. The **coastline you see is the wall you bump**:
      you should stop at the edge of the sand, not before it and not out on the water.

## 2. Two tabs: co-presence and the online path

Two browser tabs (or one normal, one private window, so `localStorage` identities differ):

- <http://localhost:3000/play?u=alice>
- <http://localhost:3000/play?u=bob>

`?u=` overrides the user id verbatim (`lib/identity.ts`), so these are two distinct users.

- [ ] Each tab sees **the other avatar moving in real time**.
- [ ] Names appear **only within about 2 tiles** (the `CLOSE` gate), and are anonymous further out.
- [ ] Each avatar is standing **on land**, on its own island, not on water.
- [ ] Moving in one tab moves that avatar in the other **without rubber-banding or snapping**.

## 3. A non-zero archipelago slot: the check that actually tests P1

**Slot 0 hides this bug completely, so a check at slot 0 proves nothing.** Island slot 0 sits at
exactly `(384, 384)`, which is the same point as `WorldCore`'s pre-connect spawn default
(`map.width / 2`), so the terrain window built before the room answers happens to be centred
correctly. Every other slot is somewhere else.

Zero-key placement is a process-lifetime in-memory store, and the rule is "the empty slot nearest the
most recently joined island". That re-anchors on each new arrival, so the sequence of slots handed
out is `0, 1, 4, 9, 17, 30, ...`. **The fourth distinct user already lands 108 tiles from slot 0**,
outside the 90-tile terrain window.

**To force a non-zero slot**, with the web server freshly started (restarting `next dev` resets the
in-memory registry, so do this in one server lifetime), burn the first three slots from a terminal:

```bash
for u in seed1 seed2 seed3; do
  curl -s -X POST http://localhost:3000/api/island/assign \
    -H 'content-type: application/json' -d "{\"userId\":\"$u\"}"; echo
done
```

Each line prints the slot it claimed, and you should see `"slotIndex":0`, `1`, `4`. Now open
<http://localhost:3000/play?u=faraway>. That user is the fourth, so it claims **slot 9**, 108 tiles
from the centre.

- [ ] The tab prints/claims a **slotIndex other than 0** (check the network tab's response to
      `POST /api/island/assign`, or the terminal output above plus this being the next user).
- [ ] **There is land under this player too.** Before the fix, this player stood on bare sea and saw
      the first cluster of islands as a distant clump on the horizon.
- [ ] Everything in section 1 holds here as well: flush shoreline, domed ground, props on the dirt.

## 4. The Flow-1 raft build, through to launch

From the world, run Flow 1 to completion (or go direct to <http://localhost:3000/flow1>):

- [ ] Gather driftwood, assemble, and hold the lashings until the hull floats.
- [ ] **Launch the raft.** The hull enters the water and sailing is granted.
- [ ] With devtools open on the Network tab, filter to `observe/behavioral` and confirm a
      `structure_progress` event with **`finished: true`** fires at launch.

That last one is load-bearing beyond rendering: `finished: true` is the only thing in the product
that ever emits `persistence = 1.0`, and known-gaps ⚑7 tracks that the committed `W` learned that
loading from a corpus where 1.0 was never observed. If it stops firing, that gap silently changes
shape.

---

## If anything above fails

Stop and report it rather than merging. The two defects this file was written for are:

- **P0, the winding.** `buildIsland()` wound every triangle so its normal pointed at `-Y`;
  `MeshLambertMaterial` defaults to `FrontSide`, so the whole landmass was back-face culled.
  Guarded now by `apps/web/tests/terrain.test.mts`.
- **P1, the terrain window.** `buildTerrain()` ran once in `init()`, before `net.connect()`
  resolved, and never followed the player. Guarded now by the same test file plus
  `ThreeWorld.ensureTerrain()`.

Neither would have been caught by any automated gate this repo had, which is the entire reason this
document exists.
