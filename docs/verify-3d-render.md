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

## 5. The mid-session terrain rebuild

Section 3 covers the terrain window **at spawn**: slot 9 is outside the window `init()` built, so the
rebuild happens on the first frame after the room answers, before you have moved. The **mid-session**
rebuild is a different situation and has no automated test and no harness coverage, because a Flow-1
capture never leaves one island. `ensureTerrain` disposes and reconstructs up to seven island discs
plus all of their flora **synchronously, on a frame, while you are moving and the scene is live.**

The window follows you once you get `TERRAIN_R * 0.45` from where it was last built, which is
**40.5 tiles**. Cross that threshold in one session: sail between islands on a launched raft, or use
the travel stand if a second player has put one in reach.

- [ ] Cross the 40.5-tile threshold without reloading the page.
- [ ] Watch for a **visible hitch** at the moment of the rebuild. A frame of stutter is expected and
      acceptable; a freeze of a second or more is not, and is worth reporting.
- [ ] The **new islands appear** as you approach them, with land under you the whole way.
- [ ] The **old islands are gone**, not still floating behind you. Accumulation would mean the
      dispose path is not running, and every crossing would add a few thousand triangles for the rest
      of the session.
- [ ] Keep going and cross the threshold a second time. Memory should be flat across crossings, not
      climbing (devtools Memory, or just watch for the tab getting slower).

## 6. The solo path, with the realtime service stopped

New with the solo fallback. The shared room is only genuinely needed for other people, so with it
unreachable the world should still be a world rather than a modal. **Stop the realtime terminal**
(Ctrl-C in terminal 2) and reload <http://localhost:3000/play>.

- [ ] There is **no blocking modal**. The old centre-screen "The world is resting" card is gone.
- [ ] A small notice reading **"a solo session"** sits under the HUD at the top left, clear of the
      toolbar and of everything along the bottom edge. It does not cover the world and does not
      intercept clicks: you can still click-to-move through the space it occupies.
- [ ] **Your avatar renders** and walks. This is the thing that would not work if the solo tick were
      not feeding snapshots, because every entity in the game goes through that path.
- [ ] The **Flow-0 affordances and Flow-1 props are present** on your island: the driftwood, the hill,
      the tide pool, the thicket, the day stations.
- [ ] You are on **your assigned slot**, not always slot 0. Use section 3's curl recipe first, then
      load `?u=faraway`. `/api/island/assign` is a Next route and answers with the realtime service
      down, which is what makes this checkable at all.
- [ ] **The raft can be built and launched**, and launching grants sailing. Reach must still be what
      the build was worth: a hasty raft should not go as far as a thorough one. Sailing is earned,
      never granted.
- [ ] Once afloat, **hauling the raft ashore works on land and is refused at sea**, exactly as online.
- [ ] **The raft ages across crossings.** Sail to a neighbouring island, land, then set out again.
      The second crossing should not go as far before the current starts pulling you back, and a
      third should go less far still. Reach is a budget per crossing, not a fuel tank, so you can
      always island-hop somewhere; it just takes more hops. If a solo raft crosses the whole ocean
      repeatedly without ever tiring, the landfall accounting has stopped running, and that is a
      measurement problem before it is a gameplay one (see known-gaps 10).
- [ ] Room-only affordances are **absent**: no travel stand, no talk-to prompt, no Flow-3 station
      menus. There is nobody to talk to and nothing offers to send anywhere.

Then start the realtime service again and reload, and confirm the online path is unchanged: the
notice is gone, co-presence works, and section 2 still passes.

## 7. Flow 5, the two moral probes, embodied

New with F5. These replaced a centre-screen popup with two buttons, so what you are checking is that
they are now something you *do*. **A single tab is enough; the probes are client-local and private.**

The probe alternates by day and the privacy condition alternates with it, so you may need to end the
day at the campfire and come back to see the other one.

**The gull (help at cost).** Walk east along the shore until you find a gull tangled in the trap line.

- [ ] Holding [space] near it plays a working animation and the **line visibly comes free in stages**.
      There is no bar, no percentage and no timer anywhere on screen.
- [ ] The hold **slips twice** and has to be re-taken, the same way the raft's lashings do.
- [ ] Working it costs you: **vitality drains** while you hold.
- [ ] **Walking away half done is allowed** and is not an error. The gull stays partly free.
- [ ] Freeing it completely changes the gull's posture and it leaves.

**The cache (honesty unobserved).** Walk northwest until you find a half-buried cache.

- [ ] You have to get **within about a tile to read the owner's mark**. From further away you cannot
      tell it is someone else's.
- [ ] Holding [space] at the mound **digs, progressively**, and the mound visibly empties. Stopping
      early takes less.
- [ ] There is a **separate marker stone beside it**. Holding [space] there instead presses the mark
      back and covers the mound over. Doing the honest thing costs you the walk to a different spot.
- [ ] Walking past either probe without acting does nothing at all and is not recorded.

**The privacy condition, which is the point of the flow.**

- [ ] On one day, **nobody is anywhere near** the probe.
- [ ] On the next, **someone stands further up the shore, in sight**. They are outside talking range:
      walking toward them offers no conversation. Being seen is a fact about the situation.
- [ ] With devtools on the Network tab, filter to `observe/behavioral` and confirm the probe's event
      carries `public_or_private` matching what you saw, and `audience_size` 1 or 0 to match.

**Two tabs, `?u=alice` and `?u=bob`.**

- [ ] Neither tab can see the other's probe. These are client-local and private by construction, so
      alice's gull must not appear on bob's island and the witness must not be a real player.

**The isolated slice, which is the fastest way to check all of this.** `/flow5` puts one probe on an
island with nothing else on it, and takes the condition from the URL. Single tab, no day loop.

- <http://localhost:3000/flow5?u=you&probe=gull&privacy=private>
- <http://localhost:3000/flow5?u=you&probe=gull&privacy=public>
- <http://localhost:3000/flow5?u=you&probe=cache&privacy=private>
- <http://localhost:3000/flow5?u=you&probe=cache&privacy=public>

- [ ] **The gull, private.** Hold [space] beside it. The line comes free **in visible stages**, the
      hold **slips twice** and must be re-taken, and vitality drains as you work. Nothing counts
      anything on screen.
- [ ] **The partial ending is real.** Hold for two or three seconds, then walk inland away from it.
      The gull stays partly free and that is a legitimate ending, not a failure state. Devtools,
      Network, `observe/behavioral`: one event fires, carrying `thoroughness01` well under 1.
- [ ] **The gull, public.** Someone stands further up the shore. Walking toward them offers no
      conversation: they are outside talking range on purpose.
- [ ] **The cache, private.** Approach it. From more than about a tile away **you cannot tell whose it
      is**. Close in and the owner's mark becomes legible. That is the beat: learning it belongs to
      someone happens in the body, not in a sentence.
- [ ] Holding [space] at the mound **digs progressively** and the mound visibly empties. Stopping
      early takes less. Confirm `taken01` in the event matches roughly how long you held.
- [ ] **The honest act costs a walk.** The marker stone sits a couple of tiles away. Holding [space]
      there instead presses the mark back and covers the mound over, and emits `return_cache`.
- [ ] Walking past either probe without acting emits **nothing at all**.
- [ ] Compare the two privacy conditions on the same probe and confirm the event's
      `public_or_private` and `audience_size` (1 or 0) match what you actually saw.

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
