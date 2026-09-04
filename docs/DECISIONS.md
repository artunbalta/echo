# Decisions taken on the landing world rebuild

Answers given 2026-09-03, after the four audits. Each one blocked work; each is recorded here so
that an agent reading a task does not have to re-derive the reasoning or ask again. The measured
evidence behind each sits in the remaining-work page, group C.

## C1 — heightScaleM becomes 2,700

Was 900, which put the median slope at 0.85 degrees and left 0.5% of land steeper than 5. At 2,700
the median is 2.54 degrees and 21.8% exceeds 5. Earth is about 6 degrees and 46%, so this is still
half of Earth and deliberately so: the peak becomes 2.7 km on a 200 km-radius body.

`isLand` tests raw elevation and `biome()` takes normalised height, so this changes how tall the
same shape is drawn and nothing else. No terrainVersion, no re-seed, no golden rewrite, no deed
moves. Camera height, walk speed, collider heights, fog distances and the globe's displacement were
all tuned against 900 and are re-derived in the same change.

## C2 — the planet is NOT re-seeded; relief is added to the scene only

The height field stays exactly as it is. Detail displacement is added to the SCENE height only and
tapered to zero at the waterline, so `isLand` stays honest and every parcel boundary, land fraction,
assignability flag, spawn point, golden and deed is untouched.

This was chosen over issuing terrainVersion 2 because anything touching `elevation()` changes 49
source files, every parcel's land fraction, the twelve commons, the sea-level calibration,
PUBLISHED_CAPACITY and the globe, and `manifest.ts` says a new seed is a new planet. The decision
had a deadline: it stops being answerable the day the first deed is issued.

The cost of the middle path, stated plainly: the macro landscape keeps whatever shape the noise
gave it, because the finest feature the field can express is about 1.56 km wide. What is bought is
walking scale, which is where a person actually is.

## C3 — the colour space is fixed at the shared seam, and the globe moves with it

`packages/planet` writes sRGB bytes over 255 into a vertex-colour attribute three reads as linear,
while props go through `new THREE.Color`, which converts. Fixing it at the seam darkens the albedo
about 4x and the light intensities are re-derived in the same change. The landing globe visibly
changes, which was the reason this was a question.

Fixing it only in `terrainChunks` was rejected: it leaves the globe and the walked world telling
different stories about the same colour, which is the exact shape of the bug that put a mirrored
parcel inset into production.

## C4 — the beach rule splits, explicitly, with both sides pinned by a test

The globe keeps the cheap height band as a coastal tint. The scene mask overrides it with a
water-distance test, using the chamfer transform `sampleBiomeMask` already runs.

The elevation band (elev < 0.006) is a 5.4 m vertical strip, which on ground this flat is 990 m wide
at the median and 5,950 m at p95, at 0.48 degrees. Every shore class bands out to at most 160 m, so
several hundred metres of every coast is bare sand with nothing on it.

`agreement.test.ts`'s promise that the terrain on the globe is the terrain you walk on becomes an
APPROXIMATE promise. That is acceptable only because it is documented and tested on both sides. A
silent divergence here would be the same failure as C3's rejected option.

## C5 — ASSET_CLASSES gets its own version, separate from terrainVersion

Every ecology change alters what `placeAssets` returns, which is shared with the server by contract,
though none of it touches terrain, sea level, biome boundaries or parcel assignment. Editing
`densityPerKm2` relocates every instance of that class; editing a weight only changes acceptance;
adding a class id moves nothing.

All of it lands behind ONE bump. The scatter re-lays under people's feet once, not a dozen times.

## C6 — drainage runs over a fixed 8.1 km domain with a slope-area threshold

Measured: with no halo, the channel mask's agreement against a 24 km reference runs 0.003 to 0.594;
at a 5,900 m halo it is 1.000 in all four test cells. Without a fixed domain the same ground gets a
different river depending on who asked. A bare accumulation threshold selects 2.5% of one parcel and
91.6% of the coastal demo cell, so it is a slope-area threshold instead.

`channelDistanceM` is a REGISTRY-version change, not a terrainVersion one, so deeds are safe.

Note the same hazard already exists in the shipped contract: `waterDistanceM` is a chamfer over
whatever window the caller passed.

## C15 — the demo's two structures appear only on DEMO_CELL, FOR NOW

The query parameter is honoured only for the demo cell, so nobody can put a campfire on every parcel
by editing a URL, and brief rule 3 holds: no human structures anywhere except the demo's own two.

DEFERRED, AND OWED: what an ordinary parcel offers a person who walks it is a design question with a
fiction behind it, and it is to be planned deliberately at the end rather than settled by default
here. Until then an ordinary parcel has nothing to do in it, and A6 exists to make the inspector say
that honestly rather than draw a posterior nobody moved.

## C16 — mid-range laptop is the reference, and the ceiling stays 600k

Target is an M1 MacBook Air or an integrated-GPU Windows laptop, not the M4 Pro every number so far
was measured on. The ceiling stays 600,000 triangles and 120 draw calls, and measurement is taken
with vsync OFF, because at 120 Hz a p50 of 8.3 ms hides however much headroom there really is.

This makes the per-cell chunk split mandatory rather than optional: a homogeneous rainforest parcel
currently submits 844,775 triangles and the worst of 120 sampled cells submits 1.43 M.

## Still open

C7 (does enter_cave keep sending a constant), C8 (echo-ml on a paid plan), C9 (is the walked parcel
the claimed parcel), C10 (provision DATABASE_URL and run the seed), C11 (freeze exception for the
individuation harness), C12 (pin Voyage or hash for measurement), C13 (regenerate two legend plates),
C14 (mammoth steppe or early-Holocene tundra).
