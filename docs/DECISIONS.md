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

THE SECOND COST, which was not written down when this shipped and is being written down now.
There are two height functions and they are not the same ground. `sceneHeightAt` is the macro
field: what the globe draws, what the registry assigns from, what `isLand` and every parcel
boundary are computed over. `createSceneHeight` is that plus the displacement, and it is what the
mesh is built from and what the body, the camera and every prop stand on. So invariant I1, the
terrain on the globe is the terrain you walk on, became an APPROXIMATE promise the moment this
landed. The drawn ground stands away from the globe's ground by up to the displacement's amplitude,
4 m by construction, measured at 3.3631 m worst and 0.80 m in the mean over `agreement.test.ts`'s
25,000 samples on the shipped seed; 3.3631 m is 1.246e-3 normalised, and 13,198 of those 25,000
samples exceed the 1e-6 that test was written to enforce.

RE-MEASURED UNDER C19 AND UNCHANGED, because the amplitude it is proportional to did not change.
The divergence is 84.1% of the dial at every amplitude swept from 2 m to 8 m, so this paragraph's
3.3631 m and 0.80 m are 4 m's own numbers and would have had to be rewritten as 0.841 times any
other choice.

As with C4, that is acceptable only because it is documented and tested on both sides, and it is
now both. `agreement.test.ts` holds the macro field at 1e-6, where it measures exactly 0, because
that is the one field the globe and the registry share and a drift there is two planets. It holds
the drawn ground at the amplitude, asserts the tolerance is no LARGER than the dial the
displacement is set from, and asserts the measured worst reaches most of the tolerance so the bound
cannot quietly go slack on a world that lost its relief. A companion test doubles the displacement
and watches the drawn assertion reject it while the macro assertion stays at 0, so the guard has
been seen failing rather than assumed to work.

IT ALSO MOVED A CONTRACT, quietly. `PlacedAsset.z` is the macro height under an instance and was
documented as "metres above sea level", with `PlaceOptions.heightScaleM` promising only that it
"must match the scene builder's". The displacement put z 1.150 m in the mean and 3.799 m at worst
from the ground the scene draws, over the demo cell's 43,108 instances, against 0.163 m and 0.818 m
of mask-grid quantisation alone; 94.7% of that cell would now miss the 0.15 m seating tolerance the
client is held to. No behaviour was wrong, because the client re-seats every instance through
`frame.toScene` and the realtime server does not yet import `@echo/planet` at all. But this is a
file shared with the server by contract and the comment IS the contract. It now says what z is,
what it is not, who may rely on it and that the authoritative ground is the scene's own `heightAt`,
and `assets.test.ts` pins every one of those numbers so the sentence cannot go stale in silence.

What does NOT move is worth stating exactly, because it is the whole reason this option was taken.
The taper reads the lowest macro ground within one lattice step, so every triangle containing the
waterline is undisplaced and the h = 0 contour does not shift by a millimetre. Land fraction,
parcel boundaries, assignability, spawn points, the goldens and every deed are computed on the
macro field alone and none of them can see this.

## C3 — the colour space is fixed at the shared seam, and the globe moves with it

`packages/planet` writes sRGB bytes over 255 into a vertex-colour attribute three reads as linear,
while props go through `new THREE.Color`, which converts. Fixing it at the seam darkens the albedo
about 4x and the light intensities are re-derived in the same change. The landing globe visibly
changes, which was the reason this was a question.

Fixing it only in `terrainChunks` was rejected: it leaves the globe and the walked world telling
different stories about the same colour, which is the exact shape of the bug that put a mirrored
parcel inset into production.

WHAT THE MOVE MISSED, recorded because this seam will move again one day. Every consumer that hands
a colour to a RENDERER was found and converted. The one that does not hand it to a renderer was
not: `scripts/preview-globe.ts` rasterises the very buffers a WebGL layer would take and writes the
PNG bytes itself, so it needed the other half of the transfer and was given nothing. Its ocean fell
from (43, 78, 109) to (6, 17, 34) at full lambert and its rainforest from (57, 107, 75) to
(9, 33, 16). That file's own header promises that if its image is wrong the shipped globe is wrong
too, so for one commit the promise pointed backwards: the product was right and its evidence was a
black sea. `linearToSrgb` is now the return trip, the framebuffer stays linear through lambert and
the box filter, and the encode happens once, at the byte.

WOULD A DISTINCT TYPE HAVE CAUGHT IT. No, and that was tested rather than assumed. Brand `Rgb` as
sRGB bytes and give the linear table a type of its own, and tsc does reject handing one table to
something expecting the other, which is a real class of mistake and not this one. What crossed the
seam here was a `Float32Array` of anonymous numbers, and `Math.round(colours[i] * shade * 255)`
compiles under any branding, because TypeScript has no nominal number; branding the array does not
help either, since indexing a `Float32Array` yields `number` whatever the array is called. So the
decision is not to brand: the churn reaches every colour literal in the package and buys nothing
against the failure that actually happened. What is bought instead is a sentence on
`ParcelMesh.colours` naming its space, and a guard that measures the shipped bytes. The preview now
finds the brightest pixel of open water in the image it just wrote, decodes it with `srgbToLinear`,
and requires it to be `BIOME_COLOUR.ocean` under that pixel's own lambert term to within 4% of the
light. It has been watched failing on the original bug (0.08x), on the transfer applied twice
(7.20x), on a 1/2.2 gamma substituted for the piecewise curve (1.19x), and on a mesh fill sent back
to bytes. Its first draft predicted through the same encode function it was measuring and passed
the double transfer happily, which is the dud-guard shape this repair exists to clear out, so the
prediction now runs through the forward transfer only.

## C4 — the beach rule splits, explicitly, with both sides pinned by a test

The globe keeps the cheap height band as a coastal tint. The scene mask overrides it with a
water-distance test, using the chamfer transform `sampleBiomeMask` already runs.

The elevation band (elev < 0.006) is a 5.4 m vertical strip, which on ground this flat is 990 m wide
at the median and 5,950 m at p95, at 0.48 degrees. Every shore class bands out to at most 160 m, so
several hundred metres of every coast is bare sand with nothing on it.

`agreement.test.ts`'s promise that the terrain on the globe is the terrain you walk on becomes an
APPROXIMATE promise. That is acceptable only because it is documented and tested on both sides. A
silent divergence here would be the same failure as C3's rejected option.

## C4, revisited: the beach rule is NOT why you cannot see the sea

C4 above splits the beach rule, and it is still owed. What is recorded here is that it was measured
and is not the cause of the complaint it was about to be spent on, so it was not spent.

THE COMPLAINT was that a coastal parcel does not show you the sea. Measured on both shipped coastal
routes, standing exactly where the game puts you at the camera it gives you, the sea contributed
0 pixels of 1,024,000, on 847b949ffffffff, which is 45% ocean with its shore 226 m away, and on
847b959ffffffff, whose shore is 78 m away.

WHAT WAS CLEARED, each on numbers. The water mesh is built whenever the region has ocean, is
6,259 m across against a 2,084 m region so it overhangs the fog on every side, sits at sea level,
is submitted on every frame at every station on both routes, and at the shore reads 116 levels of
255 away from the sand beside it. It is not buried by the tripled height scale: 0.4482 of the demo
cell's 416,592 emitted vertices are below sea level, which is its ocean composition exactly. The
beach rule is not the cause either, and it points the wrong way: A9 makes the beach NARROWER, which
grows the rainforest closer to the waterline and puts MORE canopy between a person and the sea.

THE CAUSE was the spawn. `initialMover`'s heading is PI / 2, south, and `initialFollowCamera`'s yaw
is PI, so everybody on every parcel began facing the same compass point, and on both coastal routes
the sea is north. Turning the whole way round at the demo's spawn, no heading reaches 0.35% of the
frame; on 847b959ffffffff the sea is a plain 8.97% at 180 degrees from the shipped one and exactly
zero at the shipped one and the three either side of it. The second cause is the framing: at pitch
0.42 against a 50 degree field of view the top edge of the frame sits 0.94 degrees above the
horizon, so the sea could only ever be a strip jammed under it, and 0 of 2,560 rays at either spawn
reached the sky.

SO THE SPAWN FACES THE SEA WHEN THERE IS ONE IN SIGHT, and the camera comes up until the horizon
stands nine degrees inside the top of the frame. Which way the water is, is a fact about the
terrain, so it is `nearestWaterFrom` in @echo/planet next to `isLand` and `spawnPointFor`, and the
server places people too. The sight range is the fog's own 420 m: past that the sea is 92% fog
colour and turning somebody toward it would point them at a grey wall.

WHAT IT BOUGHT, measured by rendering the frame twice and differencing the water out of it.
847b959ffffffff goes 0.00% to 6.24% of the frame AT THE SPAWN, in rows 172 to 243 of 800 with sky
above. The demo goes 0.00% to 0.07%, which is slivers between trunks, and 120 m of walking along
the heading it now faces reaches 7.95% and open sand. Nothing moves on a parcel with no sea inside
the fog, which is 94.2% of them: heading PI / 2, yaw PI, pitch 0.42, unchanged to the digit.

WHAT IS STILL OWED IS C4 ITSELF. Across the planet the beach rule holds and the numbers are the
ones C4 records. It is a separate defect about what the coast LOOKS like, and it was left alone
here rather than folded into a fix for something it does not cause.

## C20: picking raycasts the surface the globe draws, not a unit sphere

Section 6.1 says picking is "a raycast against a plain unit sphere plus arithmetic", and that
sentence shipped as a bug. The planet is DRAWN displaced to `1 + reliefScale * max(0, height)`, so
the sphere and the ground are two different surfaces and one ray meets them at two different points
on the globe. Over 3,041 live rays on the shipped page the gap came to a median 0.264 and a p95
2.177 degrees against a resolution 4 parcel 0.40 degrees wide: 77.8% of pixels showing land were
answered with a cell other than the one drawn there, and 4.9% of pixels showing SEA were offered as
an assignable parcel. The landing's whole gesture is "point at the planet, every hexagon is one
parcel", and it was telling people savanna was open water.

`raycastGlobe` replaces it. Seen from the planet's centre a straight ray is an arc of directions, so
the march steps in ARC ACROSS THE PLANET rather than in distance along the ray, which is what stops
it tunnelling through a headland at the limb. It costs 0.024 ms a ray against the 0.26 ms the whole
old pick took and the 43.49 ms an intersection of the drawn 1,310,720-triangle mesh was measured at.

THE OTHER TWO CALL SITES MOVED WITH IT, because they shared the assumption. `outlineLift` was
0.0075 of the radius, which on a 200 km planet is a hexagon drawn 1.5 km in the air; seen from off
to one side that lands 0.13 to 1.26 degrees outward from the middle of the disk, which is back
toward the cursor and onto the land beside the answer, and is what made a wrong pick look right. It
is now 0.0006, 120 m, which is what it takes to clear the drawn mesh: the icosphere's flat triangles
stand above the continuous surface the outline is sampled from on 30.7% of the ground, by p99 59.1 m
and 125.9 m at worst. `screenPositionOf` multiplied by the height of the planet's highest peak for
every cell whatever its own height, and now asks `globeRadiusAt`.

THE LIFT COULD ONLY COME DOWN BECAUSE THE DEPTH BUFFER MOVED. The globe's camera ran near 0.01 and
far 100, which spends 24 bits on empty space: one depth step measured 1.13e-4 of the radius at the
globe, 22.6 m of ground, so a 120 m lift was four depth steps and a kilometre of air was the only
way a line stayed visible. The planes are now derived from where the camera is, which puts a depth
step at 0.13 m and the lift 450 steps clear.

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

## C17 — the ground is darkened UNDER CANOPY, not everywhere

Phase 2 claimed the ground-brighter-than-canopy inversion was fixed. It was reduced 3.8x and not
fixed: measured with 128x80 rays through the real camera on the frozen dusk frame, 98.25% of ground
pixels on the ordinary parcel are still brighter than the median canopy pixel, and 99.85% on the
demo. The ratio went 4.87 to 1.28 and 6.75 to 1.44.

The cause was not what the commit said either. ALBEDO_FIX 3.7 multiplies the key, the fill and the
shadow floor; the seam conversion darkens rainforest albedo by 3.568. 3.7 / 3.568 = 1.04, so on
terrain the fix and its re-derivation cancel to within 4%. What actually moved the ratio is the
props, which were already in the right colour space and were brightened by the terrain's error
factor: canopy 9.96 to 26.87 sRGB luma, which is 3.59x in linear.

Lowering the exposure globally was rejected. Open ground receiving skylight and reading brighter
than dark green foliage is not wrong, it is what dusk looks like in the open; a global cut would
make desert and beach darker than they should be and would darken a night that is already dark.
What is wrong is the same thing happening under a closed canopy, where a real rainforest floor
receives 1 to 2% of the incoming light.

So the ground is shaded by CANOPY CLOSURE. The cost is admitted: closure has to be computed
somewhere, and that is more work than one constant.

BUILT AND MEASURED. `apps/web/src/game/world/canopyClosure.ts`, one more layer in parcelWorld's
list, after the scatter because it needs the placement and after the terrain because it writes into
the ground's own vertex colour. 17 ms at build on the ordinary parcel against that build's 193 ms
of terrain and 388 of scatter, and nothing at all per frame.

WHAT THE RENDERER WAS ACTUALLY MISSING, which is not what this decision guessed. Muting each light
in turn on the frozen frame and re-reading the same ground rays: the floor's linear luminance is
0.0183 on the parcel, of which the hemisphere FILL carries 0.0126, 69%, and the key 0.0058; on the
demo it is 0.0227 split 0.0133 fill and 0.0094 key. On open sand the same measurement comes back
the other way round, 0.1594 fill against 0.4494 key, which is exactly what a 16 degree sun on
unshadowed flat ground should give. So the forest floor is not short of KEY light: the key is
already only a third of it, because the shadow map is working and the long dusk shadows in the frame
are real. It is short of nothing at all, because a hemisphere light in three is occluded by no
geometry whatsoever, and a floor with fourteen metres of leaf over it therefore receives every
photon of sky that a beach does. That unocclude-able fill is two thirds of the light on the floor
and all of the light on the floor a tree is standing over.

SO THE TERM IS A SKY OCCLUSION AND IT IS DERIVED. Crowns are a layer of optical depth L, the crown
area standing over a square metre of ground; a ray leaving the floor at t from vertical crosses
1/cos(t) of it; a diffuse floor weights its hemisphere by cos(t). What survives is
2 * integral(0..1) u exp(-L/u) du = 2 E3(L), and the grazing directions do the work: at the L this
world grows the vertical ray survives at 0.549 and the whole sky at 0.383. The same integral gives
the spatial kernel, W(d) = h^2 / (pi (h^2 + d^2)^2), a bell whose half width is the crown's own
HEIGHT, which is why a 26 m clearing under 13.7 m trees does not get all of its sky back and why a
lattice of hard-edged instances yields a smooth field. ASSET_CLASSES decides WHETHER a thing is a
tree, on the collider height it already carries; scatterGeometry decides HOW MUCH, as the silhouette
of the drawn form above head height, rasterised from above. So a dead tree is classified as canopy
and casts almost no shade, and nobody had to write that down.

THE PIXELS, 128 by 80 rays through the real camera on the same frozen dusk frame this complaint was
measured on, before and after:

  ordinary parcel  ground/canopy 1.272 -> 0.925, share brighter than the median canopy pixel
                   98.25% -> 21.17%; under a crown 1.630 -> 1.202 and 98.35% -> 55.65%
  the demo         ground/canopy 1.424 -> 1.120, share 99.85% -> 34.35%; under a crown
                   1.174 -> 0.822 and 100% -> 13.40%

AND THE NEGATIVE, which needed a third route, because NEITHER shipped route has one square metre of
open ground in view: every ground pixel on the parcel is within 14.9 m of a canopy tree and every
one on the demo within 17.6 m, since the camera only ever sees the near field and the near field is
dressed at full density. On 847b959ffffffff, where 87.9% of the ground within 120 m of the spawn is
beach and 12.1% is sea, the whole visible floor moves 1.5% in linear luminance and the sand right
under the palm crowns moves 5.3%. That sand is not far from the trees either, a median 18 m from the
nearest palm, and it is the point: closure is how much crown is overhead and not whether one is
near, and two palm fronds are not a canopy. Comparing the frames themselves, 0.2% of the beach's
pixels moved by more than 8 levels of 255 and none by more than 16, against 56.7% and 9.5% on the
parcel and 42.7% and 13.6% on the demo. Over the region rather than the frame, 94.7% of that cell's
vertices are untouched, 93.1% of the demo's and 90.7% of the parcel's, and every vertex further than
80 m from a canopy tree is unchanged TO THE BIT on all three, which is what the cutoff at three
crown heights buys and what the test asserts.

WHAT THE MEASUREMENT SAYS ABOUT THE FOREST, which is worth more than the shading. The crowns cover
0.61 square metres of every square metre of ground over the parcel's near field and 0.52 over the
demo's, so the floor keeps 38% of its sky. The 1 to 2% this decision quotes is L near 5. This
planet's rainforest is about eight times thinner than the thing it is named after: 4,500 buttress
candidates per square kilometre against a real 40,000 to 60,000 stems, with a drawn crown 7 m across
against a real 15 to 25. The part of the inversion that survives, and it is the part that keeps the
parcel's ratio at 0.92 rather than under a half, is the forest being thin and not the floor being
wrong. Making it a real rainforest is an ASSET_CLASSES change and lands behind C5's one bump.

PALETTE.shadow is the floor BY CONSTRUCTION: the blend is towards the ink rather than towards zero,
so no future density can reach black, and the darkest vertex measured on any of the three routes
sits at 2.47x the ink's own luminance. `apps/web/tests/canopyClosure.test.mts` holds all of it, and
every assertion is two-sided; the constant-closure failure it exists to catch was watched failing
four of its six tests.

## C18 — A10's paint is re-derived against the ground a person can SEE

A10 was supposed to make the floor varied. Measured, it made the floor darker and left it flat.

Three renders of the same frozen frame settle it. Shipped: ground luminance p05/p50/p95 =
27.7/29.7/62.1. Every terrain material forced to ONE flat colour, lights untouched: 34.0/34.0/70.2,
a WIDER spread. Paint left in place with the key and fill zeroed under a single white ambient:
0.0095 log-variance against the shipped 0.2322, which is 4.1%. So 94% of what the headline metric
measured is light falling on tripled relief, and the 48/48/48 to 28/30/62 improvement was bought by
A8, not A10.

Over the ground a player can actually see, farthest ray 66 m, the albedo standard deviation is 1.1
levels of 255. The guard did not catch it because groundColour.test.mts asserts over the whole 4 km
disk, where the standard deviation is 10.34 levels. The test passes on a configuration nobody looks
at, which is the sixth instance of that pattern in this project.

What A10 did do is real and is kept: it moved the floor's mean albedo from 0.0908 to 0.0512 linear
luminance, 2.26x darker in view.

The amplitude is re-derived against the near field, the test moves to the near field, and where
per-vertex colour cannot carry the scale (leaf litter is not a 12 m feature) A28's fragment patch
carries it instead.

ANSWERED, AND THE ANSWER IS THAT THE AMPLITUDE WAS NEVER THE PROBLEM. The 1.1 reproduces exactly,
off the shipped `paintRegionGround` at the real camera's own ray positions: 1.103 on the ordinary
parcel and 1.105 on the demo, against 0.000 for the biome table the paint replaces. What the same
rays add is the reason:

  distance band          0-10 m   10-20   20-30   30-45   45-90
  share of ground rays    43.4%   39.8%   12.4%    3.6%    0.8%
  albedo sd, levels/255    0.23    0.70    0.80    1.08    2.26

Eighty-three percent of the ground a person looks at is inside twenty metres, the whole visible
floor touches 25 distinct 12 m lattice cells, and inside ten metres it is one triangle with a
Gouraud gradient across it. Over the same rays a unit value field delivers 0.202 of itself into the
0 to 10 m band at half a metre, 0.171 at 4 m, 0.053 at 12 m and 0.007 at 36 m, against its own sd of
0.204. Thirty-six metres is three lattice steps and is the finest thing a 12 m mesh can draw without
aliasing, so the vertex paint reaches the ground under a person's feet at 3.6% of whatever amplitude
it is given: a factor of 26 that no re-weighting closes. That is what settles A28 below.

WHAT THE RE-DERIVATION DID CHANGE. The noise ladder's workhorse moves from 72 m to 48 m, because
measured at those same ray positions the frame spread each rung delivers per unit of its own
amplitude is 0.101 at 36 m, 0.076 at 48, 0.046 at 72 and 0.007 at 216, and the rung carrying the
largest weight was delivering the least. It is nearly free: a value field's mean is 0.5 at any
wavelength, so no pinned biome mean moved by more than 1.5 of its 4 allowed, and the lattice fizz
improved from 0.362 to 0.353 on the parcel. Weighted by how much of the eye each square metre takes,
the albedo spread inside 66 m went 2.96 to 3.34 on the parcel and 2.91 to 3.36 on the demo, and at
the two shipped spawns 1.96 to 2.94 and 1.92 to 2.99. Three things were tried and rejected with
their numbers, and they are recorded in the ladder's own comment: swapping the fine and mid weights
(0.4% of spread for 6% more lattice step), shortening the 216 m rung (2.2 of the demo's 4 allowed
drift), and saturating `swell` harder (9%, at the cost of turning a derived relief constant into a
sign).

THE GUARD MOVED AND IT MEASURES ALBEDO. `groundColour.test.mts` keeps the whole-disk assertion,
which catches a recipe that stopped painting, and gains two that are about the floor underfoot. The
instrument is camera-free and derived rather than picked: an eye h above the ground sees a patch at
horizontal distance r under a solid angle proportional to h / (r^2 + h^2)^1.5, which is the inverse
square law times the grazing cosine, so half of what a standing person sees is inside h*sqrt(3) and
93% is inside 66 m. At this game's own eye height, read off FOLLOW_CAMERA rather than copied, that
predicted median is 7.8 m against 10.7 m measured over 6,045 real camera rays. It samples the DRAWN
surface at 1 m rather than the lattice, because the near floor is one triangle and its corners are
12 m apart. Measured medians over about 120 standing points: 3.36, 3.37, 7.53, 7.08, 4.57.

THE SECOND GUARD IS THE ONE THAT PROVES THE MOVE. Pushing the whole ladder from 36 / 48 / 216 m out
to 216 / 432 / 864, which is exactly the failure this decision describes, leaves the disk standard
deviation at 9.0 of its required 4 and every one of the twelve pre-existing A10 assertions passing,
while the near-field median falls to 2.01 and 1.98 and the new guard fails. Forcing the floor to one
colour prints a spread of 0.00. The fizz half was moved to the near-field denominator, which is 3x
smaller than the disk's and is the one the eye actually compares against; where it stops working is
written down rather than papered over, at 18 m and not 22.

AND A28 IS DONE HERE RATHER THAN LEFT, because the measurement above makes it the only instrument
that reaches the near field. `apps/web/src/game/world/groundGrain.ts`: a fragment patch on the same
MeshLambertMaterial, three octaves of value noise at 12, 2.7 and 0.6 m, moving the ground along the
axis between the two palette materials that biome is a mixture of at the metre scale, carried per
vertex as three normalised bytes. It costs 16 microseconds a frame on the ordinary parcel and 1 on
the demo, measured against the material with no patch on it at all rather than against a swing of
zero, which a driver is free to fold away. The near band's albedo sd goes 0.53 to 2.01 and 0.60 to
1.92 while the bands past twenty metres do not move, so the floor reads 2.01 / 2.36 / 1.87 / 1.57 /
1.69 front to back: one surface, not a gradient toward the camera.

THREE THINGS ABOUT IT ARE DERIVED RATHER THAN DIALLED. It is a RELATIVE swing on (colour - ink),
which is the same thing C17's closure multiplies, so a floor keeping 46% of its sky gets 46% of its
mottle; adding a colour instead would have made the grain glow under the trees, brightening exactly
the ground C17 spent a layer darkening. It is clamped at three standard deviations, which makes the
worst swing 0.336 of (colour - ink) at the widest pair in the table, so the art bible's ban on black
holds by construction. And each octave fades out on `fwidth` of the world position, the metres of
ground one pixel covers at that fragment, which already carries the grazing angle a floor is always
seen at: full strength at 8 pixels a period, gone at 3. That is texture LOD by hand, it is also the
physics, and it is why the grain does not fight the paint at the crossover and does not shimmer at
the back of the frame on any viewport.

THE FLOOR IS KEPT ON THE RIGHT SIDE OF NOISE BY A STATED CRITERION, not by taste: the near band's
albedo spread is matched to what the paint already draws past twenty metres and not allowed to
exceed it. 0.24 of swing was rendered and looked at beside 0.16 and rejected on that criterion, at
about 3.0 against the far band's 1.87. At dusk neither is conspicuous, and that is correct: this
decision's own measurement is that 94% of the rendered floor is light, so a 12% albedo swing on a
floor at sRGB 24 is 1.2 levels against the 10.4 the shadow bands already put there. At midday it is
plainly visible and it reads as leaf litter.

THE TWIN IS PINNED RATHER THAN TRUSTED. groundGrain.ts states the arithmetic twice, as GLSL and as
TypeScript, both built from the same constants, and a twin that had drifted would pass every node
test while the ground drew something else. `tests/e2e/groundGrain.spec.ts` renders the SHIPPED
material on a plane under an orthographic camera and a white ambient at PI, where the metres of
ground per pixel is a constant the test chooses, and compares 6,400 fragments against the twin: they
agree to 0.60 levels of 255 worst case and 0.25 on average, which is byte quantisation plus the float32 a GPU rounds a 32-bit hash into. Changing the twin's hash mixer alone takes that to 24.8, one
octave's weight in the shader alone to 7.4, and not installing the patch to 15.4. The far end of the
same render, where every octave is under three pixels a period, has to come back at exactly the
ungrained colour, and taking the fade out takes its spread from under a tenth of a level to 4.4.

ONE BUG WORTH RECORDING, because it was caught by the pixels and not by reasoning. Every
multiply-and-xor hash returns zero for the cell (0, 0), and the region's own frame puts the camera
at the origin. Measured over the parcel's 6,045 ground rays the grain's mean came back at -0.83 of a
standard deviation where the same function over a 1.6 km patch gave -0.001, and the whole near floor
rendered 4.3% darker than the paint said it should be. A hash that is wrong at the origin is wrong
exactly where this world is looked at, and a test that sampled only far from it would have called
that hash perfect; the shipped test samples both.

### C18, corrected after review

The numbers first recorded here were taken over a full 360 degree disk around the standing point,
and a person is not a disk. The shipped camera is fov 50 at 1280 by 800, a horizontal half angle of
36.7 degrees. Measured at that wedge instead, over 121 standing points times 8 headings:

  near-field albedo spread, ordinary parcel   2.21 before the re-derivation, 2.45 after
  near-field albedo spread, demo              2.15 before, 2.44 after

not the 2.96 to 3.34 and 2.91 to 3.36 recorded above. The re-derivation is worth about a tenth of a
level of 255 at the camera, not a doubling, and both numbers are under the 3 levels the decision set
out to reach.

The counterfactual renders say the same thing from the other side: of the frame's ground variance,
83.0% is light, 3.8% is the paint alone and 11.1% is the covariance between them, which is C18's own
diagnosis of the state it was written to fix, arriving again after the fix.

Where the variation is not: 43.5% of the frame's ground rays land inside 10 m, and there the albedo
standard deviation is 0.47 of one level of 255. Per-vertex colour on a 12 m lattice cannot carry a
metre-scale thing. A28's fragment grain is what can, and its swing was set to 0.16 after 0.24 was
rendered, looked at and rejected for making the floor underfoot the loudest thing in the frame.

So C18 is PARTLY achieved and the rest was traded away deliberately. What it did buy is kept and is
real: the floor's mean albedo went from 0.0908 to 0.0512 linear luminance, 2.26x darker in view, and
the paint at the camera's own rays doubled from 1.11 to 2.28 levels. What it did not buy is a floor
that reads as varied underfoot, and buying that means overriding a rendered-and-rejected decision on
how loud the ground may be. That is a fresh question, not a bug, and it is left open.

The guard was rebuilt to measure the wedge and to say in its own comment what it cannot separate.

## C19 — the displacement amplitude stays at 4 m, and the ladder behind it is measured at 2,700

RE-SWEPT AND ANSWERED. The ladder was re-run at the shipped height scale by the method
`DEFAULT_DETAIL`'s comment records: 400 assignable land parcels from one seeded stream, sampled on
the 12 m mesh lattice, cut to the deed line and to `isLand`, one slope reading per emitted triangle
from its own normal, 9.41 M triangles. Every figure the first sweep recorded came back to the digit
it was printed at, which answers the question this decision was opened on. That ladder had already
been measured at 2,700. What was written against 900 is the last paragraph of the same comment, the
one setting the displacement's 1.18 degrees against the old world's 1.03, and it is corrected there.

WHY THE DRAWN-MESH EVIDENCE DOES NOT PICK A DIFFERENT NUMBER, which is the part worth keeping.
Slopes compose in QUADRATURE, so a walking-scale tilt laid on ground that is already tilted cannot
move that ground's slope percentiles, and the two shipped routes are not typical ground: the
ordinary parcel's region has a median slope of 4.26 degrees and the demo's 7.53, against 2.44 over
the 400 parcels, and 2.56% and 1.19% of them are under a degree against 20.1% of all land. On the
ordinary parcel it takes 6 m of displacement to move the median 2.8%, 8 m to move it 7.4% and 12 m
to move it 20.6%, by which point the planet's land over 5 degrees has gone from 18.8% to 41.6%. And
the demo's share over 5 degrees, which this decision recorded moving the wrong way at 4 m, 79.27 to
78.88, moves the wrong way at 2, 3, 4, 5 and 6 as well: 79.14, 79.03, 78.88, 78.94, 79.08, and it
only turns around at 8. That is what a 5 degree threshold does sitting in the lower tail of a
distribution whose median is 7.53. No amplitude removes it, so it cannot choose one.

WHAT THE RE-RUN ADDED, because the first sweep's two statistics cannot decide this alone. Land
under 1 degree, which is ground a walker cannot feel, runs 20.1% of all land undisplaced and 11.8%
at 4 m: 41% of it gone. The share of 96 m walks, about twenty seconds, on which the ground changes
between rising and falling by at least 10 cm somewhere runs 0.5% undisplaced and 25.0% at 4 m,
because 96 m of a 1.56 km feature is a straight grade and this displacement is the only thing on
the planet that turns under a foot. Per extra metre of dial, the level ground removed per point of
steep ground added runs 6.3, 6.3, 4.1, 2.5, 1.4, 0.8, crossing one between five and six; read
"level" at half a degree instead of one and it crosses between three and four. The knee is in three
to six whichever way it is read, four is the middle of it, and four is what ships. Six would buy
58% of the level ground for 28% more steep ground and a 27% heavier median; eight, 68% for 54% and
44%.

THE THREE THINGS THAT WERE WATCHED, all re-measured at the chosen amplitude.

PROP SEATING is untouched, and is now pinned as untouchable. Measured over every emitted triangle
rather than a sample of them, the gap between the height function and the drawn triangle is
1.2285 mm mean and 81.13 mm worst on the ordinary parcel's region and 2.7971 mm and 141.68 mm on
the demo's, and those numbers are identical to four decimal places of a millimetre with the
displacement off, at 4 m, at 8 m and at 40 m. `scene.test.ts` used to assert
the property at the dial, which would report a small number at any small dial; it now asserts it at
ten times the dial, so it is pinned to the lattice-linear construction rather than to the value, and
a future amplitude cannot break it quietly.

THE GLOBE-TO-GROUND DIVERGENCE does not move, because the amplitude does not. Measured worst
3.3631 m of the 4 m tolerance and 0.8003 m mean over `agreement.test.ts`'s own 25,000 samples,
which is exactly what that file records. Swept, the divergence is 84.1% of the dial at every
amplitude from 2 to 8, so `DRAWN_TOLERANCE_M` would have had to become 0.841 times whatever was
chosen and C2's admission above would have had to be rewritten with it. Neither had to move.

THE WATERLINE PROMISE is still exact. Zero sign flips over 1,731,128 points at 1 m spacing within
30 m of sea level on the 45% ocean demo cell, zero over its 416,592 lattice vertices, the drawn
zero contour identical segment for segment at a worst endpoint move of 0.000 m, the dry fraction
identical at 0.551752311, and `isLand` agreeing with the sign of the drawn ground at all 618,556
points tested. `scene.test.ts` now holds the OFF-lattice half of that, which nothing held before:
a hollow narrower than one 12 m step is exactly where a coastline can move without any vertex
noticing, because all four corners of its quad are dry and fully displaced, and the taper's
one-step erosion is the only thing that stops it. Taking that erosion out produces 186 flips at the
shipped dial, which is how the new guard was watched failing.

## C7 — the cave is instrumented, so it measures behaviour rather than a button

Measured: 96% of the +0.698 dominance move on one `enter_cave` came from `risk_index`, and
`risk_index` is a literal at every call site. `sliceLayer.ts` sends 0.75 and 0.1, `flow1Beats.ts`
sends 0.8 and 0.1, and `ingest.py` hardcodes the same 0.75 as its fallback. It carries exactly the
information the action name already carried, so the split was never label against behaviour: it was
the label reaching the posterior twice, once through an embedding and once through a lookup table
shaped like a float.

The engine already routes `thoroughness01`, `persist_after_fail` and `still_ms` as continuous
manner, and the cave sends none of them. So the cave gets real signals: hesitation at the threshold,
whether the mouth was circled before entering, whether the entry was followed by an immediate exit.
This is instrumentation on the CLIENT. `services/ml` stays frozen and untouched.

## C9 — you get the parcel you pointed at

Two pieces of copy contradict each other today. `HeroPlanet` says you will stand on the piece you
pointed at; `ClaimClient` says land is assigned at random and cannot be picked. The brief settles
it: pick a parcel on the landing, press the demo, land in THAT parcel.

So the claim flow takes the walked cell and the `ClaimClient` copy is corrected. The cost is
admitted: popular cells now need a collision rule, which random assignment did not.

## C12 — the response says which embedder answered

The same event returns +0.848 through Voyage and +0.698 through the hash fallback, and nothing in
the response distinguishes them. Production uses Voyage and falls back silently without a key, while
acceptance runs against the mock, so a rate limit can change the answer and no record of it exists.

Pinning one embedder was rejected in both directions: pinning Voyage makes the world stop measuring
entirely whenever Voyage is down, which is harsher than today's graceful fall; pinning the hash
makes measurement deterministic and semantically empty, and the review measured it moving the
`enter_cave` against `stay_safe` contrast the wrong way.

So the response carries the embedder's identity, every golden records which path it was taken on,
and the measurement describes itself. This is the smallest change that makes the number honest.

## C14 — the cold world is early-Holocene tundra

Moss and lichen tundra, not Pleistocene mammoth steppe. This decides 47,609 km2, the second largest
land biome, and it sets `grass-tuft`'s weight there, the moisture emphasis, and whether cushion
plants or bunchgrass dominate.

Recorded plainly because the two readings pull opposite ways and this one departs from the brief's
own wording. Anatomically modern humans appear in the Pleistocene, roughly 300,000 years ago, and
moss-and-lichen tundra is a Holocene development, so on "the world as it was when the first human
was born" the literal answer for this biome is mammoth steppe. The familiar tundra was chosen
instead. The rule therefore reads: pre-agricultural Earth everywhere, with the cold biome taken at
its post-glacial form. Nobody needs to re-open this; it is a decision, not an oversight.

## C20 — only things 1.7 m and taller cast a shadow

The same threshold the colliders already use, and for a related reason: below it, a thing is
something you shoulder through rather than walk around, and its own shadow disappears into the bands
the canopy is already casting.

The bill this pays. After the A7 split the shadow pass is 345,055 triangles at the parcel's spawn,
which is 78% of the whole frame and 58% of C16's entire budget before the main pass draws anything.
The split cannot touch it: the 240 m shadow box follows the lens POSITION and not its direction, so
over sixteen headings the shadow pass moves by 1,479 triangles in total. Thicket alone is 14,060
instances at 20 triangles, about 281,000 triangles, and it is the largest single contributor.

At dusk, which is where this world spends its time, the long shadows come from the trees. That is
what makes this the cheap half of the trade rather than a loss.

### C20, built and measured

WHAT IT DOES TO THE REGISTRY'S OWN FLAG, which was the open question. `ASSET_CLASSES.castsShadow`
was authored by eye and this decision does not replace it: the two are ANDed. Over the whole table
the disagreement runs in ONE DIRECTION ONLY. Five classes are flagged true and stand under 1.7 m,
thicket 1.6, berry-bush 1.1, fallen-log 0.9, shore-rock 0.8 and driftwood 0.5; NOT ONE is flagged
false and stands at or above it. So the conjunction and the height test alone select the same eight
classes on the shipped table, C20 is a pure narrowing, and what the flag is still for is stopping
arithmetic from handing a shadow to some future tall class that should not have one, a pane, a
mist, a thing made of cards. Both halves are pinned in `scatter.test.mts`: the five names with their
heights, so a table edit that moves a class across the line has to come here and say so, and the
one-directional claim, so authoring a tall class with the flag false fails where this paragraph can
be corrected rather than passing quietly and leaving it wrong. The threshold has one home,
`SHOULDER_HEIGHT_M` in scatterLayer.ts, and a caller overriding `blockingHeightM` for movement
reasons does not move it.

THE BILL IT PAID, whole frame, both passes, on the real GPU with vsync off, at the spawn and over a
real 360 degree turn of 24 headings each read back off the camera's own yaw:

                     at the spawn        worst over the turn      headings over 600,000
  8482589ffffffff    444,052 -> 325,308  615,220 -> 497,080       6 of 24 -> 0
  8496a91ffffffff    654,655 -> 538,179  658,396 -> 541,768      24 of 24 -> 0
  8477057ffffffff    642,787 -> 527,555  668,653 -> 553,481      12 of 24 -> 0
  847b949ffffffff    365,589 -> 280,561  550,837 -> 476,959       0 of 24 -> 0

Both columns of a row are one session on one machine. The e2e re-reads the two shipped routes in
its own and gets 326,414 and 511,322 on the parcel and 283,578 and 476,959 on the demo.

ALL FOUR ROUTES NOW FIT C16 AT EVERY HEADING, including the two that were over AT REST. The
scatter's own shadow pass halves everywhere: 243,114 -> 125,846 at the parcel's spawn, 235,121 ->
119,545, 238,874 -> 124,694, 178,195 -> 92,119, and its worst over 33 stand points 245,215 ->
127,551, which is 21.3% of the whole frame's budget against the 45% the guard allows a pass that
draws no picture. It gives back draw calls rather than spending them, 5 to 3 on the parcel and 7 to
3 on the demo. C21 is still owed and this does not do its job: the main pass at the worst heading
is 284,259 on the parcel and did not move.

WHAT THE PICTURES LOST, and they were rendered and looked at rather than reasoned about: twelve
poses, two routes, dusk and midday, 1280 by 800, differenced pixel by pixel with the UI masked out.
The largest change on any of them is 2.1% of the frame moving by more than 4 levels of 255 and 1.3%
by more than 8, on the parcel at MIDDAY; at dusk the worst is 1.6% and 1.2%. For scale, C17's
canopy closure moved 56.7% of the same parcel's pixels by more than 8. Every changed pixel got
BRIGHTER, and the mean shift over a whole frame runs +0.00 to +0.32 levels.

WHAT IT IS, at the crops: a thicket loses its CONTACT SHADOW and its self-shading. The band it laid
on the ground beside it goes, and the leaf that was half in its own shade lights evenly, so the bush
reads flatter and a little less seated. On open sand the same thing happens to driftwood and
shore-rock, and there it is smaller still because those forms are half a metre. No clearing stopped
reading as a clearing: the corridors the scatter sweeps are drawn by canopy bands 5 to 20 m long
from trees that still cast, not by the bushes at their edges.

WHY SO LITTLE, and this is the number that answers the decision's own claim. Projecting every drawn
triangle along the key onto the ground over a 160 m square at the two shipped spawns: at dusk the
silenced classes shaded 6,123 m2 of the parcel's near field and 6,604 of the demo's, and 82.6% and
85.1% of that was ALREADY inside a shadow the canopy still casts. Ground in shadow goes 87.6% ->
83.4% and 88.1% -> 84.2%, so 4.15% and 3.84% of the near field goes from shaded to lit. AT MIDDAY
THE CLAIM IS HALF AS TRUE: with the sun at 78 degrees the bands are short and only 46.2% and 49.6%
of the lost shade was already covered, and 6.16% and 6.18% of the ground brightens. This world
opens at dusk, so the cheap half of the trade is the half it spends its time in, but "the shadow
disappears into the canopy's bands" is a statement about a 16 degree sun and not about the class.

C17 AND C20 DO NOT COLLIDE, checked rather than assumed. The closure's canopy line is 4 m and this
one is 1.7, so every class the closure reads as canopy still casts and nothing it darkens the
ground from stopped shadowing it; what C20 silenced is entirely below what C17 ever counted. Ground
under a thicket is still darker than a clearing and the closure is what makes it so: measured on
847b959ffffffff, the only shipped route with open ground on it, a lattice vertex under a thicket
keeps 62.3% of its albedo against a clearing's 100.0%. It works because 97.9% of the parcel's
14,060 thickets and 96.2% of that beach's 4,177 stand under canopy the closure can measure. Neither
dense route has one lattice vertex with nothing standing within 12 m of it, which is C17's own
finding about those two cells arriving again.

ONE GUARD WENT SLACK AND IS REPLACED AT ITS CAUSE. The shadow pass's ceiling is 45% of C16's frame,
a division of the budget rather than a reading off the layer, and it had been demonstrated failing
by widening `SHADOW_PAD_M` to 30 m, which read 300,516. Halve the pass and the same widening reads
155,256 and passes; so do 60, 90 and 120 m, at 179,117, 202,422 and 221,246. A budget-derived bound
does not tighten when the thing it bounds gets cheaper, which is correct, so the pad is now bounded
in the units it is for as well: PCFSoft reaches about one texel and a texel is 117 mm of ground at
the shipped 240 m box and 2048 map, so the pad must be between 1 and 8 of them. It rejects 2.0 m
and 0.05 m and the shipped 0.5 m is 4.3 texels.

## C21 — a far-band impostor per class, past each class's own lod.farM

The split works when you stand INSIDE the scatter and fails when you look at it from the rim. The
worst frame measured is 1,008,252 triangles, 1.68x the ceiling, standing 390 m from the spawn
looking back across the disk: there the grid culls essentially nothing, because 99.2% of the class
total falls inside the camera's cone.

ASSET_CLASSES already carries lod.nearM and lod.farM per class and nothing has ever read farM. Past
it, an instance drops to one cheap form: a tree becomes two triangles.

Pulling the fog in from 420 m to 300 m was rejected as the cheaper alternative. It would shrink the
world to buy the frame, and the beach rule already puts kilometres of sand between a spawn and its
sea, so it would make the sea harder to see at exactly the moment that was fixed.

The cost that has to be measured rather than assumed: the transition must not pop. That is the whole
risk of this task.

### C21, built and measured

WHAT AN INSTANCE BECOMES, and it is derived from the form rather than authored beside it. A
hand-drawn stand-in is a second piece of art that drifts from the first one in silence, so
`apps/web/src/game/world/scatterImpostor.ts` RASTERISES each class's own merged geometry from twelve
horizontal azimuths and reads four things off the silhouette: its height and the height of its foot,
its projected area averaged over the twelve, that area's vertical centroid, and the projected-area
weighted mean of its own vertex colours. Two triangles is exactly enough to satisfy the first three,
because a TRAPEZIUM has two free widths and area and centroid are two equations, and that is the
whole reason the form is a trapezium and not a rectangle: a buttress-tree comes out 1.00 m wide at
the ground and 3.09 m at the crown, a conifer the other way round at 1.46 and 0.73, a broadleaf 0.15
under a 3.77 m dome. The colour is a blend of the parts the eye can see, so it is a colour this world
already contains by exactly the argument scatterGeometry's own `mix` makes, and the test pins it
inside the convex hull of the class's own parts rather than trusting it.

IT TURNS TO FACE THE LENS, in the vertex shader, and NOT ONE INSTANCE MOVES to do it: the rotation is
applied to the card's local vertices before three multiplies by `instanceMatrix`, so the buffer that
reaches the GPU is the placer's own bytes. A card at a fixed yaw would be invisible edge-on, which is
a worse pop than the one this decision exists to prevent; measured on the page, the far band paints
3,449 pixels turning and 2,013 with the patch taken off, which is the two thirds a cosine gives.

ITS NORMALS ARE FITTED, which is the part that took the measuring. A card lit by its own flat facing
is far too directional: fully keyed looking away from the sun, unkeyed looking into it, where the
blob it replaces keeps its fill and half its key. So the four corners carry normals over a spherical
cap that LEANS by the elevation of the form's own mean visible normal, and whose RADIUS is fitted per
class against the form's response over twelve azimuths and twelve hours. Against the same derivation
with the cap collapsed, which is an unfitted card: NINETEEN of twenty-six classes come inside a ratio
band of two, against ONE. What stays bad is the near-flat litter, fallen-log at 0.45x to 4.20x,
because a thing lying on the ground faces the sky and an upright card cannot.

WHAT IT BOUGHT, whole frame, both passes, on the real GPU with vsync off, at eighteen stand points
per route, each rim point looking back across the disk:

                     at the spawn        worst stand point       views over 600,000
  8482589ffffffff    496,615 -> 470,655  704,644 -> 544,164       4 of 18 -> 0
  8477057ffffffff    527,555 -> 500,035  744,331 -> 587,271       5 of 18 -> 0
  8496a91ffffffff    538,179 -> 513,191  772,275 -> 616,355      12 of 18 -> 2
  847b949ffffffff    304,535 -> 302,527  597,464 -> 495,062       0 of 16 -> 0
  847b959ffffffff    359,789 -> 334,163  359,789 -> 334,163       0 of 14 -> 0

Both columns of every row are one session on one machine, the far band put back to its full form by
appending what the cull packed into each class's far mesh onto the end of that class's own mesh.

IT BUYS LITTLE AT THE SPAWN AND MUCH AT THE RIM, which is exactly what it was for and is worth saying
plainly: 5.2% off the parcel's spawn frame against 22.8% off its worst, 0.7% off the demo's spawn
against 20.4% off its worst. Nineteen of the twenty-one views that were over C16's ceiling now fit.
The two that do not are on 8496a91ffffffff at 616,355 and 601,080, 2.7% and 0.2% past a ceiling they
were 28.7% and 25.6% past; what is left there is the ground, and the terrain's own split is where the
next hundred thousand is.

IT SPENDS DRAW CALLS RATHER THAN GIVING THEM BACK, unlike C20: one more per class with a far band, 37
to 41 at the parcel's spawn and 57 to 64 at the demo's rim, against C16's 120. And it does not touch
the shadow pass at all, checked rather than hoped: identical triangle for triangle at all 84 views
across the five routes, because no class that casts is ever past its own `farM` inside the 240 m box.
The shortest casting `farM` is dead-tree's 700 m and a caster inside the box stands at most 591 m
from the lens at a 16 degree sun.

THE NEAR FIELD IS UNTOUCHED, and it is proved by pixels rather than by argument. A bucket joins the
far band only when the NEAREST point of its box is past the class's `farM`, and the box already holds
every instance's own sphere, so an impostored instance is past `farM` by its whole radius. Measured
on the page with the lens clipped one metre inside the shortest `farM` the cell grows, 200 m on the
parcel and 120 m on the demo: 0 of 1,024,000 pixels differ. Unclipped it is also 0, and that is the
larger finding.

THE FAR BAND IS VERY NEARLY INVISIBLE IN THIS WORLD, which was not expected and is why the pop is as
small as it is. At seven stand points on the ordinary parcel and seven on the demo, drawing the far
band as cards rather than as full forms moves 0 or 1 pixels of 1,024,000, and DRAWING IT AT ALL
against not drawing it moves the same 0 or 1: between the fog, which is exactly 1 at 420 m of view
depth, and the near forest standing in front of it, the whole band is hidden. The instrument was
checked against a positive control on the same frames, hiding the whole scatter, which moves 886,306
pixels. Where the band IS visible is 847b959ffffffff, the one shipped route with open ground: over
123 walkable views there, the worst steady-state difference between cards and full forms is 2,087
pixels of 1,024,000, 1,521 of them by more than 4 levels and 1,230 by more than 8. For scale, C20
moved 2.1% and 1.3% of a frame and C17's closure moved 56.7% by more than 8.

IT DOES NOT POP, measured by holding the lens exactly still and stepping only the classification: at
each 10.7 cm step, one frame of walking, the frame is drawn twice from the same camera, once with
this frame's level of detail and once with the previous frame's, so everything the walk does to the
picture cancels and what is left is the buckets that changed side. Over a 32 m walk:

  847b959ffffffff, open beach   worst frame 76 pixels of 1,024,000, 70 of them by more than 8
                                levels; 250 of 299 frames move nothing at all
  847b949ffffffff, the demo     worst frame 106 pixels, 96 by more than 8; 262 of 299 move nothing
  8482589ffffffff, the parcel   0 pixels on every one of 299 frames, with 15,581 to 17,664 instances
                                in the far band the whole way

The frustum-only control on the same frames, the same substitution with the far band drawn in full,
reads 0, so what moved was the switch and not a bucket entering the cone. What the switch looks like
at the crops is a two-pixel row of understorey along the horizon getting a shade greener; there is no
frame in which a shape appears or leaves.

AND THE CONTRACT COMMENT WAS WRONG AND IS CORRECTED. `AssetClass.lod` has said "full mesh within
nearM, impostor to farM, culled beyond" since the contracts landed, and it was authored before
anything read either number. That scheme cannot be built here: `farM` as a CULL distance would delete
ferns at 220 m and shells at 120 m, well inside the 420 m the fog takes a fragment at, so the ground
would go bare in front of a walker. What ships is two bands, the full form within `farM` and one
cheap stand-in past it, never culled. `nearM` is still read by nobody and is kept as what it is: a
fact about the class, not a promise the renderer keeps.

### C20, corrected after review

The rule was "1.7 m and taller casts" and the reasoning was that a short thing's shadow disappears
into the bands the canopy is already casting. Measured, that reasoning holds only WHERE THERE IS
CANOPY, and every picture C20 was validated on was one of two dense-canopy routes.

On 842cd0dffffffff, a 100% grassland cell served by the same route, only 31.7% of its 2,763 thickets
and 26% of its 481 berry-bushes stand under any canopy the closure can measure, and the median
optical depth under a grassland thicket is 0.020, a transmittance of 0.962. There the shadow is not
disappearing into anything. It is simply being deleted, and the world loses its dusk on open ground,
which is the one hour the art bible is written around.

So the rule becomes: a thing casts if it is TALL or if there is little canopy over it. The closure
C17 already computes is the input, so the data is in hand and this is a second reader of it rather
than a new mechanism.

What this costs is honest and is paid elsewhere: the saving shrinks, and C22 is where the budget
comes from instead. What C20 already bought is kept, and it was not small. No cell is over budget at
its spawn any more: the highest is 512,624 against the 653,332 and 642,276 that were over before.

## C22 — lod.farM is re-derived against the disk the scatter actually fills

The impostor was built, is at full strength, and structurally cannot help six of the classes.
lod.farM is 900 m for buttress-tree, canopy-palm, boulder, conifer, broadleaf and acacia, and
SCATTER_FALLOFF cuts the scatter dead at cutoffM 500. So from every camera a person can reach, not
one instance of those six is ever past its own far distance. On the ordinary parcel that is 303,451
triangles, 35.9% of the scatter, that no far band can touch.

Measured proof that the impostor itself is fine: at the worst frame the far band held 34,167
instances as cards worth 327,828 triangles in full, and putting them back raised the frame by
258,454, matching the layer's own cull arithmetic exactly. The mechanism works; its threshold was
authored for a bigger world than the one that ships.

Each class's farM is re-derived by MEASURING where its own form falls to a few pixels, and every
value lands inside the 500 m disk. A single shared ceiling was rejected: it would card a fern and a
fourteen metre buttress tree at the same distance, and on screen those are nothing like the same
size.

Under C5 this is a registry-version change. It moves no instance: farM decides which form is drawn
and nothing else.

## Still open

C8 (echo-ml on a paid plan), C10 (provision DATABASE_URL and run the seed), C11 (freeze exception for
the individuation harness), C13 (regenerate two legend plates).

Those four are ACTIONS rather than decisions: three of them need an account or credits, and the
fourth needs a call on whether one measurement script keeps an island world alive to stay
comparable. They are not blocking any code that is being written now.
