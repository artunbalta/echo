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
per route, each rim point looking back across the disk. THE SPAWN COLUMN IS THE CORRECTED ONE, read
off `renderer.info` on the shipped page standing where the game puts you; what this section first
recorded there was not reproducible and the subsection below says what it was:

                     at the spawn        worst stand point       views over 600,000
  8482589ffffffff    326,414 -> 326,414  704,644 -> 544,164       4 of 18 -> 0
  8477057ffffffff    567,139 -> 537,459  744,331 -> 587,271       5 of 18 -> 0
  8496a91ffffffff    549,849 -> 523,249  772,275 -> 616,355      12 of 18 -> 2
  847b949ffffffff    283,578 -> 281,748  597,464 -> 495,062       0 of 16 -> 0
  847b959ffffffff    202,499 -> 202,499  359,789 -> 334,163       0 of 14 -> 0

Both columns of every row are one session on one machine, the far band put back to its full form by
appending what the cull packed into each class's far mesh onto the end of that class's own mesh.

IT BUYS LITTLE AT THE SPAWN AND MUCH AT THE RIM, which is exactly what it was for and is worth saying
plainly: nothing at all off the parcel's spawn frame against 22.8% off its worst, 0.6% off the demo's
spawn against 20.4% off its worst. Across the five routes the spawn runs 0.0% to 5.2%, and the two
routes at 0.0%, the parcel and 847b959ffffffff, are the two whose spawn heading has no far band in it
at all: the impostor cannot help a camera that is not looking at anything past a `farM`. Nineteen of
the twenty-one views that were over C16's ceiling now fit. The two that do not are on
8496a91ffffffff at 616,355 and 601,080, 2.7% and 0.2% past a ceiling they were 28.7% and 25.6% past;
what is left there is the ground, and the terrain's own split is where the next hundred thousand is.

IT SPENDS DRAW CALLS RATHER THAN GIVING THEM BACK, unlike C20: one more per class with a far band,
which at the spawn is 37 to 37 on the parcel because no class has one there, 37 to 42 on
8477057ffffffff, 49 to 51 on the demo, and 57 to 64 at the demo's rim, against C16's 120. And it
does not touch the shadow pass at all, checked rather than hoped: identical triangle for triangle at
all 84 views across the five routes, because no class that casts is ever past its own `farM` inside
the 240 m box.
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

### C21, the spawn column corrected

"496,615 -> 470,655 at the parcel's spawn" could not be reproduced by anyone, and the reason is that
it was never a frame. Standing where the game puts you on /parcel/8482589ffffffff, real GPU, vsync
off, dusk, `renderer.info` reads 326,414 triangles and 37 draw calls with C21, and 326,414 and 37
with the far band appended back onto each class's own mesh in the same session. The far band at that
camera holds ZERO instances, spends zero draw calls and saves zero triangles. There is nothing there
for the impostor to buy.

WHAT THE OLD PAIR ACTUALLY MEASURED, recovered to the triangle. Every row of the old spawn column is
the SCATTER LAYER's own cull report, main plus shadow, at the spawn POSITION at one heading, plus a
per-route constant standing in for everything in the frame that is not the scatter:

  cell             the heading used         scatter, full -> C21   constant added
  8482589ffffffff  yaw 0, 180 deg off       312,525 -> 286,565     184,090
  847b949ffffffff  yaw 0, 21 deg off        123,859 -> 121,851     180,676
  8477057ffffffff  yaw PI, the shipped one  316,901 -> 289,381     210,654
  8496a91ffffffff  yaw PI, the shipped one  301,311 -> 276,323     236,868
  847b959ffffffff  yaw PI, 179 deg off      172,964 -> 147,338     186,825

The constant is IDENTICAL on both sides of every arrow, to the triangle, and that is what gives it
away: the "before" column was never rendered. It is the "after" plus the layer's own
`farBandFullTriangles - impostorTriangles` at that camera, with the rest of the frame carried across
unchanged. Sweeping all 360 headings at each spawn and asking which of them produce exactly the
saving the old table prints, three routes answer with one heading each, 8477057ffffffff with two and
8496a91ffffffff with three, and in every case the shipped-or-not heading named below is among them.
The camera each number came from is recovered, not guessed.

THREE OF THE FIVE HEADINGS ARE NOT THE ONE THE GAME GIVES YOU, which is why the error was invisible
from inside the numbers. C4's spawn rule turns you toward the sea when there is one inside the fog
and leaves you at yaw PI when there is not, so on 8482589ffffffff the shipped heading is PI and the
old row was measured at 0, which is the opposite way round; on 847b959ffffffff the shipped heading is
1.4 degrees, out to sea, and the old row was measured at PI, inland. Looking the way the game
actually points you on the parcel, the scatter submits 15,356 triangles of main pass in 8 draw calls
and not one bucket in the cone is past any class's own `farM`.

WHY THE PARCEL'S WRONG HEADING LOOKED RIGHT: yaw 0 is the WORST of the twenty-four headings there,
and tests/e2e/scatterSplit.spec.ts reads it in its own session at 483,074 triangles and 41 draw
calls against the spawn's 326,414 and 37. A number taken at the frame that costs most on the route
reads like a headline; it is just not the one a person is given. On the demo the same wrong heading
is the CHEAPEST of the four cardinals and the row came out accidentally close, 0.7% where the shipped
heading gives 0.6%. Against the corrected spawn column the five old "before" numbers are wrong by
+52.1% on the parcel, +77.7% on 847b959ffffffff, +7.4% on the demo, -7.0% on 8477057ffffffff and
-2.1% on 8496a91ffffffff. Three of them sit inside the 1 to 3% this section already allows between
sessions, or near enough to read as it, which is the other half of why nobody caught this.

AND ONE ROW IS ONE MEASUREMENT WRITTEN TWICE. 847b959ffffffff's two columns are the same pair,
359,789 -> 334,163, because both are that spawn at yaw PI; the row never carried a rim reading at
all. Its spawn cell is corrected above and its rim cell is left as recorded rather than invented.

THE RIM COLUMN IS NOT RE-MEASURED HERE and its "views over 600,000" is already superseded: C22 below
records that the guards and this section sampled the rim at 390 m on a disk the scatter fills to 500,
and that 603 of 3,450 stand-and-aim views over 25 cells are still over the ceiling.

THE LESSON, which is the reason this subsection exists rather than a quiet edit. A number labelled
"at the spawn" was taken at a camera nobody stands at, and a "before" column was arithmetic rather
than a second render, and both survived review because the arithmetic was self-consistent. A recorded
measurement nobody can reproduce is worse than no measurement: it is spent as evidence.

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

### C22, built and measured

THE METHOD, and the first thing to say is that the one this decision asked for does not exist. "The
distance at which its own form falls to a few pixels" is an ANGULAR rule, and an angular rule scales
with the form: a fern's form is 0.99 m tall and a buttress-tree's is 15.30 m, so one shared
threshold puts their answers 15.4 to 1 apart. Both ends of that cannot be had. At the threshold that
cards a buttress-tree at 450 m, inside the disk, a fern is carded at 29 m, where it is 39 pixels
tall and unmistakably a rectangle; at the threshold that leaves the fern where it shipped, 5.2
pixels of form height, a buttress-tree is not carded until 3.4 km, three times past anything the
disk contains. The arithmetic is one line in each direction and it is why the shipped table could
never have been written that way.

WHAT WAS MEASURED INSTEAD is not the form's size but the SWITCH: the class's own form and the card
`scatterImpostor.ts` derives from it, both rasterised at the shipped lens's own scale (fov 50, at
1280x800 and again at 1920x1080, the larger taken), from the same twelve horizontal azimuths, at the
class's largest instance scale, counting the pixels one covers and the other does not, and weighting
those pixels by the contrast the shipped fog has left at that distance. `farM` is the NEAREST
distance at which that cost falls to two pixels of the frame, because every metre past it is a full
form drawn where two triangles are indistinguishable. Two pixels is "a few", and the table is
derived at 1, 2 and 4 so the choice is shown rather than hidden: between a 1 px budget and a 4 px
one, buttress-tree moves by 1.02x, from 412 m to 404, and shell by 1.98x, from 212 m to 107. That
split is the whole finding in one line. The tall classes are pinned by the fog and barely notice the
budget; the litter is decided by its own form and moves with it.

The fog is in the criterion rather than beside it because the shipped camera has fog in it: three's
`THREE.Fog` is `smoothstep(150, 420, viewDepth)`, exactly 1 at 420 m, and the sky layer pins the fog
colour to the dome's own horizon stop, so past 420 m a form, its card and the sky behind both are
one flat colour. A measurement that ignored that would be measuring a picture nobody is shown. It is
also why the answers close up: the range is 160 m to 410 m, 2.6 to 1 and not 15.4 to 1, and the
reason is that a tall form only becomes cheap once the air has taken it. The same effect is visible
in the budget sweep: the table spans 1.94 to 1 at a 1 px budget, 2.62 at 2 and 3.77 at 4, widening
as the budget lets the answers come nearer and the fog stops deciding them. It is still not the single
shared ceiling this decision rejected, and the spread from a shell's 160 m to a buttress-tree's
410 m is the form's own size doing the work.

THE TABLE, metres, at 1280x800 and 1920x1080 with the larger rounded up to the next 10 m:

  class          was  1280  1920  now    class          was  1280  1920  now
  buttress-tree  900   405   409  410    dune-ripple    250   341   360  370
  broadleaf      900   397   403  410    tidepool       400   345   362  370
  conifer        900   391   398  400    fallen-log     500   346   364  370
  canopy-palm    900   381   391  400    shore-rock     450   332   352  360
  acacia         900   388   396  400    reeds          500   334   354  360
  boulder        900   384   393  400    dead-tree      700   336   355  360
  vine-tangle    380   362   377  380    cactus         700   328   349  350
  thicket        450   362   376  380    driftwood      400   319   343  350
  snow-drift     400   358   372  380    fern           220   307   332  340
  berry-bush     380   314   339  340    dead-shrub     400   283   314  320
  lichen-rock    300   273   304  310    bromeliad      200   261   291  300
  grass-tuft     220   239   287  290    moss-patch     200   219   258  260
  scree          300   175   209  210    shell          120   116   156  160

`nearM` DID NOT MOVE, and the question was asked rather than skipped. The two are different facts:
`farM` is where the form stops being DISTINGUISHABLE from two triangles, `nearM` is where it stops
being worth its detail, which is nearer by construction and is where a third band would begin.
Nothing reads `nearM`, so moving it would move nothing on screen; what it must not do is overtake
`farM`, and after C22 the narrowest gap left is shell's 40 m inside 160 m. Held by a test.

THE CONSEQUENCE, whole frame, both passes, real GPU, vsync off, dusk, at the spawn the game gives
you and at sixty-one WALKABLE stands 448 m from it looking back across the disk, twelve bearings per
route. Both columns are one session: the "was" column is recomputed from the same session's own
bucket dump under the old table, and the recomputation was checked against the layer's own cull
report at every view, matching to the instance and to the triangle.

  route              at the spawn        worst walkable stand at 448 m     views over 600,000
  8482589ffffffff    325,308 -> 325,308  606,798 -> 446,386  (-26.4%)       3 of 13 -> 0 of 13
  8496a91ffffffff    513,191 -> 508,260  664,310 -> 505,991  (-23.8%)       9 of 13 -> 0 of 13
  8477057ffffffff    500,035 -> 493,751  639,324 -> 481,250  (-24.7%)       2 of 13 -> 0 of 13
  842cd0dffffffff    164,816 -> 161,944  290,750 -> 271,086  (-6.8%)        0 of 13 -> 0 of 13
  847b949ffffffff    279,005 -> 279,445  510,017 -> 430,079  (-15.7%)       0 of  9 -> 0 of  9

Fourteen of sixty-one views were over C16's ceiling and none is now; the worst view anywhere goes
664,310 to 508,260, which is 15.3% of headroom where there was 10.7% of overshoot. Draw calls go up
rather than down, as C21's did: 44 at the parcel's rim and 73 at the demo's, against 120.

WHAT ACTUALLY CHANGED HANDS, per class, at the parcel's worst stand:

  buttress-tree     24 instances in the far band ->  2,664     76,560 triangles removed
  canopy-palm       65                           ->  4,122     73,026
  thicket        7,300                           ->  8,407     19,926
  boulder            4                           ->    118      2,964
  fallen-log       124                           ->    153        986
  fern          22,813                           -> 19,883    -11,720
  bromeliad      1,252                           ->  1,157     -1,330
                                                              -------
                                                               160,412

Two classes went the other way and it is worth saying plainly: fern's and bromeliad's authored
`farM` were NEARER than the measurement, 220 and 200 against 340 and 300, so C22 gives triangles
back on the two densest classes on a rainforest parcel. The net at that view is still 160,412.

THE DERIVATION'S OWN BRACKET WAS OPEN AT THE NEAR END, found by breaking the guard rather than by
reading it. `deriveFarM` asserted that the switch cost falls under the budget by the FAR end of
[1, 1200] m and assumed the near end; it does not hold when the card is not a card. Bind
`impostorFor` to the class's own full form, which is the one substitution the far band's guards
exist to catch, and the cost is 0 at every distance, so the bisection never raises its floor and
walks `high` down toward 1 m while the raster it builds grows as 1/d^2: 27 ms at 200 m, 2.3 s at
20 m, and past 600 s before the twenty-two steps are done. The guard did not fail on that sabotage,
it HUNG, which to whoever is waiting is indistinguishable from a slow test. The file's own
break-it test missed it because it calls `switchPixelsRaw` at a fixed 100 m, which returns
instantly and correctly reads 0; nothing exercised the bisection itself. Both ends are now asserted
and the bracket starts at 10 m, nearer than the nearest `nearM` in the registry. The same sabotage
now throws in 4.8 s with the class named, and not one of the twenty-six derived values moves.

HOW MUCH OF EACH ANSWER IS THE FOG, since the paragraph above says the tall classes are pinned by it
and that is worth a number rather than an adjective. The same derivation with the fog weighting
removed, 1920x1080, 2 px:

  buttress-tree  409 m with fog, 5,911 m without: the fog decides 93.1% of the answer
  broadleaf      403 / 3,676  89.0%      conifer   398 / 2,874  86.1%
  acacia         396 / 2,590  84.7%      boulder   393 / 2,367  83.4%
  canopy-palm    391 / 2,351  83.4%      fern      332 /   709  53.1%
  grass-tuft     287 /   398  28.0%      scree     209 /   221   5.3%
  shell          156 /   156   0.0%

The table spans 37.77x unfogged and 2.61x fogged. So the six classes C22 was opened for are decided
between 83% and 93% by the air rather than by their own silhouettes, and the shortest class is not
decided by it at all. The spread that remains is still the forms', in the sense that identical forms
would land on one distance; but "the form's own size doing the work" above describes the ORDERING
and not the magnitude, and at the top of the table the magnitude is the fog's.

IT DOES NOT POP, measured the way C21 measured it: the lens held exactly still and only the
classification stepped, 10.7 cm a frame over a 32 m walk begun 470 m out, the frame drawn twice from
the same camera, once classified here and once where the walk was a frame ago.

  842cd0dffffffff, open grassland   worst frame 214 pixels of 1,024,000, 90 by more than 8 levels;
                                    253 of 299 frames move nothing
  847b949ffffffff, the demo         worst frame 206 pixels, 0 by more than 8; 235 of 299 move nothing
  8496a91ffffffff                   worst frame  40 pixels, 11 by more than 8; 285 of 299
  8482589ffffffff, the parcel       worst frame  37 pixels, 21 by more than 8; 296 of 299
  8477057ffffffff                   worst frame   4 pixels,  0 by more than 8; 297 of 299

The frustum-only control on the same frames, the same substitution with the far band drawn in full,
reads 0 on every route, so what moved was the switch and not a bucket entering the cone. Against
C21's own numbers at the old distances, 76 and 106 pixels worst with 70 and 96 of them past 8
levels, the pop has roughly doubled in pixels touched and is unchanged in pixels a person could see.

AND IT WAS LOOKED AT, not only counted. Standing still, cards against full forms at the worst
walkable stand on each route: 0 pixels differ on 8477057ffffffff, 32 on the parcel, 41 on
8496a91ffffffff, 2,235 on the demo and 4,475 on the open grassland, 888 of those by more than 8
levels. Amplified sixteen times, the whole difference is a strip in the top sixty rows of eight
hundred, the far treeline against the dusk, and nothing below it moves at all; at three times
magnification the two crops are not tellable apart. For scale C20 moved 1.3% of a frame by more than
8 levels and C17's canopy closure moved 56.7%; this is 0.087%.

A CASTER CAN NOW BE IN THE FAR BAND, which C21 recorded as impossible, and this is the one claim C22
invalidated rather than moved. The shortest casting `farM` was 700 m against the 591 m a caster
inside the 240 m shadow box can stand from the lens; it is now cactus at 350 m. The instance is
drawn as a card and casts the shadow of its own full form, which is the right way round: a card is
two triangles seen edge-on from the sun, and the ground its shadow falls on is at least 350 m away,
five times further than the farthest ground pixel any ray reaches. The shadow pass never reads
`farM` at all. The test that asserted the old impossibility is replaced by one that culls a cell
under two `farM` tables three hundred metres apart and holds the shadow pass identical, triangle for
triangle, which is the property that was actually load bearing and was never guarded.

UNDER C5 THE REGISTRY VERSION IS BUMPED, 1 to 2, as `ASSET_REGISTRY_VERSION` in
`packages/planet/lib/assets.ts`, which is where C5's constant lands for the first time. Not one
instance moved: the demo cell still places 43,018 instances over the disk and 5,905 within 120 m,
identical under both tables, and `packages/planet/tests/assets.test.ts` places the whole disk twice
under `farM` 2 m and `farM` 3,000 m and compares every field of every one of 37,133 instances.

## C23 — the parcel is playable with a thumb, and the phone's blockers were not the controls

Someone opening /parcel on a phone could look around and do nothing else. Walking is WASD, running
is Shift, jumping is Space and the inspector is a backtick, so four of the five verbs were keys
nobody was holding. Looking worked by accident of the drag path already being pointer events.

WHAT ACTUALLY STOPPED A PHONE, in the order it stopped it, because only one of the three is about
controls at all:

  1. `h-screen` on the route. On iOS Safari 100vh is the LARGE viewport, and globals.css locks this
     page's overflow, so the bars never retract and about 180 px of an iPhone's box sit permanently
     off screen. Both of the consent card's buttons were in that strip. Consent is unset-means-OFF
     on this path, so a person could reach their parcel and never get past the first question. The
     route is `h-[100dvh]` now; the landing hero already was.
  2. The recognition meter at `w-[min(340px,86vw)]` and z-20 over a "Back to the planet" link at
     z-auto. At 390 px wide the meter covered all but four pixels of the link, and the page cannot
     scroll, so the only way off a parcel was the browser's back button. The meter takes the
     top-left column below `sm` and the link takes z-30.
  3. Then the controls.

A WIDTH QUESTION AND A POINTER QUESTION ARE NOT THE SAME QUESTION, and this HUD asks both. Whether
a panel fits beside another panel is width, and it is answered in CSS with `max-sm:` — no
JavaScript, no hydration, correct in a narrow desktop window too. Whether the world can be driven
at all is about fingers, because a tablet is coarse and wide while a small window is fine and
narrow, and that is `(pointer: coarse)` read in `lib/pointerKind.ts` — which exists because the
query had been written out by hand three times already and was about to be written a fourth.

TWO SOURCES, ONE FRAME. The canvas keeps the gestures that are gestures: one finger looks, two
fingers pinch. The thumbstick and the buttons are DOM, because a canvas cannot hold an element with
an accessible name and a second `<canvas>` on this page breaks minimap.spec.ts by name. They state
a demand into one handle; `game/world/input.ts` drains it once a frame and merges it with the keys
into the single InputFrame `playerLayer` already read. Nothing downstream can tell a thumb from a
keyboard, which is the point: every rule controller.test.mts and followCamera.test.mts pin covers
the phone for free, and the merge lives in the input rather than in the layer that says in its own
header that it decides nothing about movement.

THE STICK CANNOT BE ANALOG, AND NOT FOR THE REASON THIS ENTRY FIRST GAVE (corrected, SOC-0.C).
stepMover normalises the direction it is given and takes its speed from the boolean `run` out of two
fixed numbers, so a half-deflected thumb walks at exactly the speed a fully deflected one does. That
is the whole reason and it is a fact about the mover. What this entry originally offered instead —
"MOVER.WALK is frozen for parity with WorldRoom.integrate" — was already false on this route the day
it was written: `playerLayer` installs `parcelMovement(ctx.frame.tileM)` and passes it to
`stepMover`, so the parcel walks at 1.65/1.6 = 1.031 tiles/s against the server's `WORLD.MOVE_SPEED`
of 4, a factor of 3.88, and the parcel route never joins a `WorldRoom` at all — no colyseus import
reaches it. So deflection buys exactly one thing, the run flag, with hysteresis at 0.85 on and 0.70
off. The derivation for that band, redone against the profile the parcel actually passes: the
walk-to-run gap is 4.2 - 1.65 = 2.55 m/s at an accel of 7 m/s², so the mover crosses it in 364 ms,
and because the tile scale cancels out of that ratio it is 364 ms at EVERY `tileM`. The 86 ms first
recorded here was MOVER.ACCEL's arithmetic (2.4 / 28) — correct for the LEGACY profile, which is not
on this route, and 4.25x too fast. The conclusion survives and is stronger: what a rim-resting thumb
restarts is not the state, which flips within about 2 ms, but `playerLayer`'s `runBlend`, and
poseCharacter drives leg swing and cadence off that, so a third of a second of blend is visibly
re-triggered several times a second. Note MOVER is not fully retired on this route — `stepMover`
still reads its STILL, TURN_RATE, TURN_THRESHOLD and JUMP_S; only the four speed numbers come from
the profile, and "the parcel does not use MOVER" would be a fresh wrong record. Anyone who later
"fixes" the stick by making it speed-proportional is changing the mover, and owes an answer for the
networked route that does still run MOVER at `WORLD.MOVE_SPEED`. `tests/controller.test.mts` now
derives the 364 ms from `parcelMovement` across four tile scales, so this cannot drift again.

The sentence that closed this paragraph — that a speed-proportional mover "silently rescales the
sampler's speedVar, which the frozen model was fitted on" — is struck for the same reason C23's
parity claim is. `speedVar` is routed nowhere and no `W` column was ever anchored on it (SOC-0.C,
§3 item 4). The scalar a mover speed change really moves is `novel_tile_ratio`, whose denominator is
distinct tiles per 1.5 s window and is therefore speed-dependent; it carries the fourth-largest
absolute loading on openness of 66 features, +0.4006, behind `path_tortuosity` at +0.4654, which is
computed over the same time-boxed window and is speed-coupled for the same reason.

THE PINCH CONSTANT IS COMPUTED, NEVER WRITTEN DOWN. FollowInput.zoom is in wheel pixels spent as
`distance * zoomPerNotch^(zoom/100)`, so a pinch is worth `100/ln(zoomPerNotch) * ln(before/after)`
— 715.5 at the shipped 1.15, and derived at module scope so it follows the camera if that constant
moves. tests/touchInput.test.mts asserts the round trip through the camera's own formula at three
different zoomPerNotch values rather than against the number, which is the same lesson as the layer
list built twice, one level down. The whole 2.5–18 m range is a separation ratio of 7.2: two
comfortable pinches, and stepFollowCamera already clamps, so the input needs no clamp of its own.

YAW IS GAINED 1.7x AND PITCH IS NOT. At orbitRadPerPx 0.006 a quarter turn costs 262 px, 67% of a
390 px phone — you could not turn around in one swipe. At 1.7 it is 154 px. Pitch keeps the mouse's
gain because its whole range is already only a 258 px sweep, and gaining it up would turn the 20 px
of vertical wobble in a horizontal swipe into 12 degrees of unasked-for pitch instead of 7.

THE POINTER BOOKKEEPING WAS THE BUG UNDER THE FEATURE. input.ts held ONE pointerId, so a second
finger silently stole the drag and lifting that second finger killed a drag the first finger was
still holding. There was no state in which a pinch could be expressed. It is a map of fingers now,
with the two oldest owning the gesture and a third inert, and the centroid derived rather than
stored — exactly one finger moves per event, so the midpoint moves by half that finger's delta, and
lifting one leaves the other's own reference already correct. A stored centroid is what puts a
60–150 px jump in the camera when a pinch ends.

setPointerCapture IS BEST EFFORT NOW, and that is a harness fact, not a nicety: it throws
NotFoundError for a pointer id the browser does not own, which is exactly a dispatched PointerEvent.
Measured here in chromium. Playwright's touch API is `tap(x, y)` and nothing else — no swipe, no
second finger — so a spec must dispatch its own move phase, and an unguarded throw inside a listener
would surface as a page error that fails specs about something else entirely.

NOTHING IN THE HUD IS A `<button>`, and the cost is stated rather than hidden. RecognitionMeter had
already recorded the reason for itself; C23 makes it the rule: Space is jump in this world, so a
focused button eats the spacebar, and a click that moved focus off the canvas takes WASD with it.
The three touch controls are therefore not keyboard reachable. What makes that acceptable is that
every one of them exists to replace a key that still works — a keyboard user has W, Shift, Space and
the backtick and needs none of them — and the inspector's key was kept rather than replaced: the
panel's `open` moved up to the mount so a backtick and a thumb reach ONE piece of state. That was
not a convenience. ConsentCard promises "you can stop it at any time from the inspector", and on a
phone that sentence was false: consent could be given and never withdrawn.

TWO RENDERER SETTINGS ARE TURNED DOWN ON A COARSE POINTER, and only the two that are purely about
fragments. A 393 x 852 iPhone at dpr 3 clamps to 2 and draws 786 x 1704 = 1.34 MPix against the
1280 x 800 = 1.02 MPix every table in C20–C22 was measured at: 31% MORE fragments, on a part with
roughly half the bandwidth. So the ratio caps at 1.5 (1.78x fewer fragments, still past what an eye
resolves at arm's length on a 3x display) and multisampling goes off, which on a tile-based mobile
GPU is paid in tile memory and is the setting most likely to cost a whole extra pass. WHAT IS DRAWN
DOES NOT CHANGE: no instance moves and no density is second-guessed, which is the line
scatterLayer's header draws and this stays on the safe side of.

AND THE FRAME IS STILL NOT MEASURED ON A PHONE. It has to be said plainly, because C21's own
corrected column is a section about what happens when a recorded number turns out to be arithmetic
rather than a second render. There is not one millisecond anywhere in this file: the whole budget is
triangles and draw calls, all taken on an M4 Pro. Arithmetic over this repo's own cull and geometry
code puts the frame at the spawn near C16's 600,000 ceiling before a phone is considered, and the
two layers that are not in any table here — detailLayer and meadowLayer — are most of what closed
that gap. Two things follow, and one of them was wrong when it was written (corrected under
SOC-0.C).

RIGHT: `RenderInfo` already carries fps, calls and triangles and `WorldCanvas` already writes them
to data attributes, gated to NODE_ENV != production, so ungating that behind a query parameter is
the cheapest way to turn "a phone probably struggles" into a row in this file. Two corrections to
that sentence, both of which a reader would otherwise trip on: the attributes are
`data-world-fps` / `data-world-triangles` / `data-world-calls` — the DOM hyphenates a dataset key, so
the camel-case spelling first written here matches nothing — and `RenderInfo` is a TypeScript
interface plus a `devInfo` option, not a component. And the ungate ALONE does not produce a
whole-frame number: three calls `info.reset()` after `shadowMap.render()`, so `world.info` is the
MAIN PASS ALONE. That is the same half-frame error `tests/e2e/scatterSplit.spec.ts` was written to
correct (928,034 reported against 1,623,152 actual), so the ungate has to ship the pass split with
it or SOC-1.A records another half-frame.

WRONG: "the meadow ring places 63,700 blades … 42% of them provably invisible on every route
measured. That is a triangle win with no fidelity cost at all." Three errors in two sentences.
63,700 is the ALLOCATION CEILING (49 patches x 1300 slots), not a census — `mesh.count` starts at
zero and only accepted blades raise it, and a non-green patch draws none. "On every route measured"
is not true of anything: the meadow has never appeared in a measured frame, which this very entry
concedes two paragraphs earlier; 42.30% is a GEOMETRIC ratio, pi * 24^2 over 56^2, the overhead of
covering a disc with a square grid. And the remedy does not exist: the ring radius ALREADY equals
the fade distance exactly — RADIUS 3 x SIZE 8 = 24 m against a `smoothstep(17., 24., …)` far stop —
so there is nothing to pull, and pulling RADIUS to 2 opens an 8 m annulus of missing grass whose
inner metre is before the smoothstep has even opened, at full opacity, sweeping the ground as the
player walks. `tests/meadowRing.test.mts` now fails on exactly that edit, and the constants and the
GLSL are derived from one pair of exported numbers so they cannot drift apart again.

WHAT WAS ACTUALLY TAKEN, and it is smaller than the claim: the 4 to 10 patches of the 49 whose
nearest corner is past the far stop at any instant are no longer submitted. They stay resident,
because the player's offset inside its own patch changes as they walk and a rebuild is 1,300 terrain
samples. The rest of the 42.30% is structural to a square grid over a disc and comes back only by
moving the fade window, which is a fidelity decision and belongs in a screenshot review rather than
in a trim.

## C24 — one epoch, the twelve-minute day is kept, and a life is seven real months

Answers SOCIETY-PLAN.md SOC-0.A(a), taken 2026-09-07.

There is no world clock. `skyLayer.ts:478-479` accumulates `dt` from `DUSK` PER MOUNT, and
`parcelWorld.ts:105` pins `timeOfDay: 0.38` on every mount, so two people standing on the same
ground today are looking at two different mornings and neither of them is the world's.

ONE EPOCH: `WorldManifest.createdAt` (`manifest.ts:145`). It is already a per-world constant that a
restart cannot move, which is the only property the job needs. The hour is derived, never
accumulated: `timeOfDay = wrapTime(((now - createdAt) / 1000) / 720)`. `0.38` stops being a value
and becomes what it always was, a screenshot of 09:07.

THE RATE DOES NOT MOVE. `DEFAULT_CYCLE_S` stays `12 * 60`. A world-day is twelve real minutes.

  1 world-day   =        720 s real
  1 world-year  =    262,800 s real  = 73 hours EXACTLY (365 x 720)
  a 70-year life = 18,396,000 s real = 5,110 hours = 212 days 22 h

Call it seven months. That is the whole decision: a person born the day this ships is elderly next
spring, and the planet is generational on the scale of a year, not of an afternoon.

WHY IT IS IRREVERSIBLE, and why it is taken before a line of society code: once one birth or death
timestamp is in a row, moving `720` rewrites every lifespan on the planet, and any NPC a player has
already met becomes a different person with a different age and a different set of dead parents.
The number is cheap now and unpayable later.

WHAT THIS DECISION COSTS, stated rather than discovered: mortality is INVISIBLE inside one session
and inside one month. Nobody will watch an NPC die. So SOC-6.H — graves, an old person talking about
someone dead, a half-built house, "in my father's time this was..." — is promoted by this decision
from a want to a REQUIREMENT. The first session has to carry the evidence that time passes, because
the clock will not supply it in time to matter. A world whose only proof of mortality is patience
has no proof of mortality.

## C25 — NPCs hold land in the substrate, and the registry stays the players' table

Answers SOC-0.A(b).

`parcels.owner_id` (`0009_planet_registry.sql:61`) never holds an NPC. An NPC settlement is
`society(seed, t)` and has ZERO ROWS until a player touches something in it, which is L1 exactly:
the seed is the prior, the database is the delta. The house already took this shape twice — 0004's
"empty cells are simply absent rows" and 0009's terminal-cell rule that avoided 140 million ocean
rows — and a peopled planet is where it stops being a tidiness argument: five people per parcel is
1,420,020 agents and 1.4 M rows of people nobody will ever meet.

`PUBLISHED_CAPACITY` = 1,074,942 (`manifest.ts:98`) therefore keeps EXACTLY the meaning it has
today. Nothing on the claim page becomes false by arithmetic.

ONE THING ON THE CLAIM PAGE DOES BECOME FALSE, and it is the good half of this decision: buying a
parcel buys the GROUND, and the ground has people on it. That is a stronger ownership story than an
empty disc and it is the honest one — but it is also C15's deferred question arriving, and it asks
the thing the product has to answer anyway: can you evict them? Not decided here. C26 bounds it at
one end by deciding you cannot kill them.

## C26 — the demographic layer is READ-ONLY to players

Answers SOC-0.A(c).

  alive(n, t)  =  n.birth + n.lifespan > t

That is the entire mortality model, and it is arithmetic. Lifespan is drawn from the seed at birth,
children are pre-drawn at pairing with their birth days, and so the whole lineage of the planet is
computable at any instant WITHOUT HAVING BEEN SIMULATED. This is what lets 1.4 M people exist
without 1.4 M rows, without a tick that has nowhere to run (SOC-3.E), and without any of it having
happened while nobody was looking.

MUTABLE, and fully so: relationships, regard, reputation, wealth, employment, where someone is and
what they are doing today.
IMMUTABLE: birth, lifespan, death, parentage.

WHY, in one sentence: the moment a player can save or end a life, that person leaves the closed form
AND SO DOES EVERY DESCENDANT — the cascade has no bound, and the substrate becomes stored state on
the first act. There is no version of "just this one exception" that stays one exception.

This also answers half of a question nobody had answered: erasing a player never has to delete a
person. A player who married into a lineage leaves the lineage behind, because the lineage was never
theirs to hold.

## C27 — the shared world is the PLANET frame, and the shared unit is ONE PARCEL

Answers SOC-0.B, and with it C11.

The two frames are not reconcilable by a transform. `WorldRoom.integrate`'s land gate is
`oceanLandAt` over 100 phyllotaxis discs (`WorldRoom.ts:885`); the parcel's gate is H3 region
membership plus the terrain field. One `k=1` parcel is a 2,084 m radius disc (`parcel.ts:20-22`)
against a whole shared room of 768 tiles = 1,229 m. ONE PARCEL IS LARGER THAN THE ENTIRE EXISTING
MULTIPLAYER WORLD. So this is a choice, not a merge.

THE ROOM KEY IS THE PARCEL'S H3 INDEX. Rooms are created on demand; up to 1,074,942 of them exist in
principle and approximately none exist in practice, which is L1 applied to processes instead of
rows. `ROOM_CAPACITY` 150 is not the binding constraint on a 2,084 m disc and never was — one room
per parcel is.

WHAT THIS RETIRES: the archipelago geometry, and with it `travel_far`/`travel_near`, whose basis is
the old map's distances. That channel loses its ground and must be RE-DERIVED against parcel-scale
distances, with the distribution measured over an identical path at both scales BEFORE either side
moves. Flag 9's rule holds: nobody moves one side of a measured pair alone.

WHAT THIS KEEPS ALIVE, which is C11 answered in the direction of KEEP: `/play`, `ThreeWorld` and
`/flow1` stay, frozen, as the individuation fixture. The headline number is produced by driving a
real headless Chromium through `/flow1` twice against a 2D baseline of 0.2620, and retiring the
route retires the number or forces a re-baseline that breaks comparability with everything
previously quoted. The fixture receives no features, no society, no NPC with a family. It is a
measuring instrument and it is maintained as one.

WHAT THIS DOES NOT DECIDE: whether a room is a Colyseus room, a process, a shard, or something that
is not Colyseus at all. On a 768-tile map with 109 entities one `MapSchema` broadcast to everyone is
fine; at planet scale it is the whole architecture, and that stays open as SOC-3.C.

## C28 — the shipped whole frame IS measured now, and it is 1.5x over the C16 ceiling

Answers half of SOCIETY-PLAN SOC-1.A, taken 2026-09-07, and it was free: the number was already
being computed by a spec nobody was running.

THE NUMBER DID NOT NEED A NEW HARNESS. `tests/e2e/scatterSplit.spec.ts` already drives a real
headless Chromium, already walks the eight headings at the real spawn, and — this is the part that
matters — already sums BOTH PASSES, because it was written to correct exactly the half-frame error
`world.info` produces on its own (three calls `info.reset()` after `shadowMap.render()`, so the
renderer's own counter is the main pass alone: 928,034 reported against 1,623,152 actual). It was
simply red, and had been.

MEASURED, Apple M4 Pro, macOS 15.6, headless Chromium via Playwright 1.62.1, at the real parcel
spawn, worst of eight headings:

  route                     whole frame   main pass   shadow pass   ceiling (C16)
  ordinary 8482589            907,250      664,805       242,445       600,000
  demo cell            695,457         489,459        205,998        600,000

  after the two changes taken in the same pass (SOC-1.B's patch cull and SOC-1.C's ranged upload):
  ordinary parcel      899,450         657,005        242,445        -7,800
  demo cell            640,857         434,859        205,998       -54,600

WHAT THIS SAYS, and it is not what the record implied. `DECISIONS.md:806-807` gives 326,414 tri / 37
draws at the real parcel spawn; the whole frame at that same spawn is 907,250 — the older figure was
one pass, one layer set, or both. `living-world-rendering.md`'s 628,415 is closer and self-labels as
a single-view observation on a different machine. **The ordinary parcel — the route with NO demo
structures on it, the one every buyer walks — is the more expensive of the two**, because the demo's
station clearings remove scatter that an ordinary parcel keeps.

SO THE HONEST STATEMENT OF THE FRAME BUDGET IS: **the shipped world is at 1.5x its own ceiling on an
M4 Pro, and C16 says the reference machine is an M1 Air or an integrated-GPU Windows laptop, which is
slower.** Every number in SOCIETY-PLAN's SOC-4 rests on the headroom left over from this one, and
there is none: a character rig is ~15,868 triangles and ~46 draw calls, so "other bodies in the
parcel" is not a rendering task on top of a frame that fits — it is a task that has to make the frame
fit first.

WHAT IS STILL OWED under SOC-1.A, stated so this is not mistaken for the whole item: no phone
reading, and no per-LAYER split. The per-layer attribution is not available from `parcelWorld`'s
composition — every layer writes into one shared scene and the object names already collide — and
getting it needs about forty lines in `PlanetWorld` (tag at `scene.add`, read back through three's
own per-object hooks) rather than a change to any layer.

AND THE RED SPECS, WHICH THIS ENTRY FIRST UNDERSTATED — corrected under SOC-1.D. It said "one more
red spec". A full run of the suite is **10 failed, 24 passed**, and the ten
are across FIVE spec files, not two (the wall time is not quoted here: SOC-1.D later found the
runner's own worker count was the variable, and it is `workers: 1` now):

  globePick.spec.ts        2   the parcel the landing names / the hexagon over the ground it names
  scatterImpostor.spec.ts  4   the far band at 390 m and 448 m, ordinary parcel and demo
  scatterSplit.spec.ts     2   the whole-frame overage this entry is about
  slice.spec.ts            1   the walk into the cave, ending 1.57–1.86 tiles short of 1.3
  spawnSea.spec.ts         1   a parcel with no sea is left exactly as it shipped

**Every one fails on an ASSERTION and not on a clock**, and every one was verified pre-existing by
stashing the day's render changes and re-running: the seven in `globePick`, `scatterImpostor` and
`spawnSea` fail identically without them. Three of the five are measurement paths — `slice` is the
demo's locomotion channel, `scatterImpostor` is C21's far band, `spawnSea` is the sea-relief pass —
so this is not cosmetic debt. Each is owed its own item; none of them is this one.

## C29 — the re-anchor stays one-time, and it is PRE-REGISTERED

Answers SOCIETY-PLAN SOC-0.D, taken 2026-09-07. Takes `⚑20` option 3, and makes option 4 a rule at
the same time because it costs nothing.

WHAT IS DECIDED. The second `W` re-anchor still happens ONCE, on the full cue set — the
tuning-pressure argument for that rule is real and nothing here weakens it. What changes is that
before it runs, `docs/world-design/reanchor-preregistration.md` states, for every flagged cue, what
"it carries signal" would look like: which axis, which sign, and at what threshold. The threshold is
not invented for the occasion — it is **0.15**, the repo's own bar from `action-axis-map.md`, the one
that already decides whether an action may drive a world reaction at all.

WHY A PIECE OF PAPER IS THE WHOLE INTERVENTION. `⚑19` establishes that the committed `W` was fit on
an entirely synthetic corpus, so the second re-anchor is not a refinement of a measured matrix — it
is the FIRST time any loading is tested against behaviour. A single non-repeatable event whose
success criteria are written afterwards, by the people who designed the cues, is not a measurement;
it is an interpretation, and every outcome will look like a confirmation.

THE THIRD OUTCOME IS THE POINT. The pre-registration has three verdicts, not two: CARRIES, DARK, and
**UNDERPOWERED** (fewer than 120 emissions across 30 users). Without the third, a cue nobody emitted
enough times reads as a cue that carries nothing, and a design decision gets retired for the wrong
reason. It also fixes signs in advance: a scalar that loads the opposite way is a FAILED construct,
not an interesting inversion, because post-hoc sign flips are how a pre-registration becomes
decoration. And several predictions carry a collinearity clause — a feature within cosine 0.9 of one
already in the model has not measured a new construct, however well it loads.

OPTION 4, NOW A RULE: an acceptance bar passed by a flow whose signature cue is unrouted is **not**
evidence that the flow measures its thesis, and every flow report says so in those words. This round
already did it in prose; prose gets skimmed.

A COUNT CORRECTED WHILE DOING IT. `⚑20` says "thirteen flagged manner scalars (⚑13's five, ⚑18's
eight)". That is thirteen (scalar, flow) PAIRS but **eleven distinct scalars** — `circled01` and
`cost_paid01` are each flagged in both F4 and F5, and `⚑18` says so itself. Both counts are
defensible and they are not the same count; the register quotes the larger one without saying which
it means.

WHAT THIS DOES NOT SOLVE, and it is the larger half. Establishing real `z` labels is a research
programme and does not resolve by building more. `⚑21` measured why: 7 of 66 features had any
variance in a 240-row corpus, and labels taken from a user's own posterior give ‖W‖ = 0.00 BY
CONSTRUCTION, because that posterior was produced by the committed `W`. This decision makes the
re-anchor evaluable. It does not make a corpus.

## C30 — `consistency` is an exact zero column, and four shipped cues route only to it

Found while taking C29, measured rather than suspected, and recorded as `⚑23`.

  W is (8, 66), version 1. Four of its 66 columns are EXACTLY zero on every axis:
      ellipsis_ratio · emoji_ratio · digit_ratio · consistency

The first three are text-manner features on a route the product does not measure by promise, so
their being dead is consistent with the consent card. **`consistency` is not.** It is a
`TELEMETRY_FEATURE_NAMES` entry that `ingest.py` sets on six actions, and for FOUR of them it is the
only feature the action sets at all:

  conform_custom   consistency 0.85   — and nothing else
  travel_near      consistency 0.70   — and nothing else
  return_cache     consistency 0.90   — and nothing else
  keep_cache       consistency graded — and nothing else

`wait_in_queue` and `cut_queue` survive because they also set `persistence` (formality +0.284) and
`approach` (warmth +0.700) respectively.

WHY THIS MATTERS MORE THAN THE THIRTEEN MANNER SCALARS `⚑20` CITES. `return_cache` / `keep_cache` IS
the Ring of Gyges — the blueprint's flagship moral probe, the costly good nobody will ever know
about, Stage 7, the thing the whole private-versus-public design exists to read. **Its designed
feature moves the posterior by exactly zero.** It still moves the posterior through the action-label
embedding, the way every flagged cue does, but the signal it was built to carry is dark. So is
`travel_near`, which is one half of the travel stand's far/near contrast — the other half,
`travel_far`, routes to `risk_index` (dominance +0.410) and `travel_novelty`, so **the contrast is
measured on one side only**, and a contrast measured on one side is not a contrast.

NOT ROUTED ELSEWHERE, DELIBERATELY. Attaching these to the nearest plausible live feature is the
silent re-route cross-cutting rule #1 forbids, and it is the exact mistake `⚑6` records. They stay
where they are, flagged, and `consistency` becomes the first named line of the C29 pre-registration's
scope. `packages/planet` has nothing to do with this; the pin is
`services/ml/tests/test_zero_columns.py`, so the day a re-anchor gives `consistency` a direction, the
test fails and somebody reads this entry.

## C31 — where the frame goes, per layer, and the body costs twice what the plan assumed

Completes the machine half of SOCIETY-PLAN SOC-1.A. C28 said WHAT the frame costs; nothing said
WHERE, and nothing could: `parcelWorld.ts` composes a flat list of layers into one scene, and the
names downstream do not say whose mesh is whose — `detailLayer` names its meshes
`scatter:<class>:detail`, the slice names its props "campfire" and "cave_mouth", and the player is a
tree of unnamed meshes under one named root.

WHOEVER ADDED THE OBJECT IS THE ONE FACT THAT IS ALWAYS RIGHT, and the host is holding it. `?debug=layers`
stamps each object with the layer whose code was running when it entered the scene, and brackets its
draws with three's own `onBeforeRender`/`onAfterRender` and `onBeforeShadow`/`onAfterShadow` — CHAINING
them, never replacing, because `scatterLayer` uses that same pair to zero its shadow twin in the main
pass and an instrument that overwrote it would double the frame it was sent to measure.

MEASURED at the spawn view, headless Chromium, 1280x720 at pixel ratio 1:

  ordinary 8482589 — whole 559,380 tri / 103 calls   (main 488,189 · shadow 71,191)
    layer         main tri   calls      shadow tri   calls
    detail         205,466       9               0       0
    meadow         171,600      22               0       0
    terrain         82,391       5          20,439       1
    player          15,856      23          15,856      23
    scatter         10,668      15          34,896       4
    sky              2,208       1               0       0
    ATTRIBUTED     488,189                  71,191          <- equals the pass, exactly

  demo cell — whole 516,106 tri / 104 calls   (main 434,859 · shadow 81,247)
    meadow         171,600      22               0       0
    detail         169,816       8               0       0
    terrain         59,115       4          19,634       1
    scatter         16,264      14          45,625       3
    player          15,856      23          15,856      23
    sky              2,208       1               0       0
    slice                0       0             132       5
    ATTRIBUTED     434,859                  81,247          <- equals the pass, exactly

THE SPLIT IS EXACT AND THAT IS THE CHECK. Attributed equals the pass to the triangle on both routes,
with nothing unattributed. It did not the first time: an "unattributed" row of 643,197 against a
434,859 main pass, because `THREE.Scene` has `onBeforeRender` and `onAfterRender` of its own and
three calls them at the top and bottom of `render()` — so hooking the root brackets the entire frame
as one object and counts it twice. The hook is now installed on drawables only.

⚠️ THE SHADOW HALF MOVES NOW, AND C24 IS WHY. The sun's elevation is derived from the world clock,
so the SAME camera on the SAME ground casts a different shadow pass at a different world hour —
measured on an identical demo view: shadow 81,247 at one hour and 193,777 at another, with terrain's
share going 19,634 -> 99,117 and scatter's 45,625 -> 78,079. The MAIN pass is camera-bound and does
not move; it reproduced to the triangle across every run. So **a per-layer row is only comparable to
another row taken at the same `timeOfDay`**, and the table above is one hour of one day. Stamp the
hour on any future reading. `renderDebug.spec.ts` therefore asserts the accounting IDENTITY and
prints the numbers; it pins neither total, because pinning one would make an honest clock look like a
regression.

A SECOND-ORDER LESSON FROM THE SAME PLACE. The first version of that spec read the eleven data
attributes with eleven separate round-trips, and the host rewrites all of them on a one-second
interval — so a run came back with `whole` 628,043 against `main + shadow` 628,636. That is not an
instrument disagreeing with itself, it is two frames read as one. The reader takes `dataset` in a
single synchronous evaluation now, which the interval's own write cannot interleave with.

⚠️ AND THE CELL IS NAMED, WHICH THIS ENTRY ORIGINALLY DID NOT DO. "The ordinary parcel" is two
different cells in this suite and they differ by a factor of 1.7 at their worst headings — C36.
Everything here is `8482589ffffffff`.

THESE ARE NOT C28's NUMBERS AND MUST NOT BE QUOTED AS THEM. C28's 907,250 is the WORST of eight
headings walked at the spawn; this is the spawn view alone, standing still, which is the cheapest
frame either route ever draws. The two answer different questions and the smaller one is not an
improvement.

FOUR THINGS THIS SETTLES.

1. **`detailLayer` is the largest single layer on an ordinary parcel** — 205,466 triangles, 42% of
   the main pass, in NINE draw calls. It was already known to be expensive; it was not known to be
   the biggest thing in the frame.
2. **`meadowLayer` is the second largest, at 171,600.** SOCIETY-PLAN SOC-1.B called it a triangle win
   with no fidelity cost; §3 item 7 records why that was wrong three ways over. What it actually is
   is **31% of the main pass of every parcel and every landing preview**, and every one of those
   blades is within 24 m of the player's feet. 171,600 is 22 patches x 7,800 — the disc cull and the
   frustum are together holding 22 of the ring's 49 down, against 382,200 for all of them.
3. **THE BODY COSTS TWICE WHAT THE PLAN ASSUMED.** SOCIETY-PLAN SOC-4.A costs a rig at 15,868
   triangles and ~46 draw calls. Measured: **15,856 triangles and 23 calls in the main pass, AND
   15,856 triangles and 23 calls again in the shadow pass** — every one of its 23 visible meshes is
   `castShadow`. So one body is **31,712 triangles and 46 draw calls of WHOLE FRAME**, and the "~46
   draw calls" figure the plan quotes is the main pass counted as if it were the frame. A second
   body is not 46 calls of a 120 budget; it is 46 more on top of the 103 an empty parcel already
   spends. **Two players standing together exceed C16's draw-call ceiling on their own.**
4. **The demo's `slice` draws nothing in the main pass and 132 triangles of shadow.** The two
   structures C15 froze to `DEMO_CELL` are not why the demo is expensive. The demo is CHEAPER than an
   ordinary parcel — 516,106 against 559,380 — because its station clearings remove scatter that an
   ordinary parcel keeps.

WHAT IS STILL OWED: a phone reading. The gate is now a query parameter that works in a production
build (`?debug=render` for the frame, `?debug=layers` for this table), and the readout is drawn on
the page because a phone has no console — so the reading is now possible without a harness. Nobody
has taken it.

## C32 — trade access is distance to the nearest commons, and that is an ASSERTION

Taken 2026-09-07 for SOC-6.B, and flagged as invented rather than measured.

`SettlementGeography` takes six numbers. Five are read off the ground: `coastal` from `isLandHeight`,
`wooded` from `VEGETATION_DENSITY`, `mountain` from `normalisedHeight` and relief, `arable` from an
authored biome table, `habitability` from a composite whose cuts are the biome table's own bands.
**The sixth has no source at all.** There is no road, no river, no port, no navigable-water graph and
no economy — SOC-7 records that zero code exists.

TWO PLAUSIBLE SOURCES WERE REFUSED, and the reasons are worth keeping.

  Neighbouring settlements. `settlementAt` takes geography as an INPUT, so defining trade access from
  the neighbours' settlements makes `geographyOf(cell)` depend on `geographyOf(neighbour).tradeAccess`
  — unbounded mutual recursion across a planet, and an L2 violation on top, because the answer would
  depend on how wide a neighbourhood the caller happened to expand.

  `referral.ts`'s adjacency. `gridDisk` is safe at every radius; `gridDistance` is not — it throws
  once a disk is wide enough to wrap pentagon distortion, measured at 85% of far resolution-4 pairs.
  And a ring count is resolution-dependent anyway: one ring is 1.4 km at resolution 4 and 77 m at 7.
  Adjacency gives a NEIGHBOURHOOD; it never gives a planetary distance.

SO IT IS DISTANCE TO THE NEAREST OF THE TWELVE COMMONS, which are already a manifest column and cost
0.0003 ms to search. Measured over 3,000 land resolution-4 cells: p05 25.3, median 85.0, p95 119.3,
max 145.6 km, against a half-circumference of 628.3 km. `TRADE_RANGE_KM` is 150, just past the
measured maximum, so nothing clamps to exactly zero.

  tradeAccess = (1 − min(1, nearestCommonsKm / 150)) × (0.7 + 0.3 × coastal) × (1 − 0.4 × rugged)

WHAT THIS ASSERTS, in one sentence: **the twelve public cells are where trade converges.** That is a
claim about the world and not a measurement of it. It is defensible — the commons are the only twelve
places anyone can reach without asking permission, which is what a market is — and it is the only
planet-scale structure that exists today.

WHY IT IS SAFE TO TAKE NOW, unlike C24: **it is reversible, and C25 is why.** A settlement holds zero
rows, so trade access is recomputed from the seed on every visit. Changing this formula changes how
big villages are and how many traders are in them; it changes no stored fact and no person's birthday.
Contrast the world clock, where one stored timestamp makes the ratio unpayable. Recorded as a
decision anyway, because a constant that shapes where the rich places are should not arrive as a
literal inside a module.

## C33 — the planet this produces, measured, and the density chosen deliberately

`npm run census:planet -w @echo/planet` — a uniform, hash-ordered sample of the real 284,004-cell
resolution-4 inventory, scaled. Seed `echo-capacity-1`, at world day 0.

FIRST MEASUREMENT, at `SETTLEMENT_RATE` 1.0 — every liveable cell taken:

  settled     33.8% of cells   ->    96,088 settlements
  living      2,548,273 people      ·  7,236,327 graves
  spacing     a village every ~2.2 km, about a 22-minute walk at the parcel's 1.65 m/s

**That is one cell in three, and SOCIETY-PLAN §5 says this direction "does not go breadth-first" and
that "a planet of shallow people reads as fake faster than an empty one".** One in three is not that
world. So the number was not left where it fell.

SHIPPED, at `SETTLEMENT_RATE` 0.3:

  sampled     3,000 of 284,004 cells, 0.737 ms per cell
  habitable   55.7% of cells        (unchanged: this is the GROUND, and the ground did not move)
  settled      9.4% of cells   ->    26,602 settlements
  living      619,413 people        ·  2,396,426 graves
  village     min 0 · p25 14 · median 23 · p75 34 · max 65   (mean capacity 58.3)
  spacing     a village every ~4.1 km, about a 41-minute walk
  trades      farmer 19.2% · trader 10.9% · herder 9.0% · labourer 8.8% · carpenter 8.0% ·
              smith 6.7% · forester 6.7% · carter 5.2% · miner 4.8% · weaver 4.2% · potter 3.4% ·
              stonecutter 3.4% · teacher 3.3% · innkeeper 2.5% · healer 2.0% · fisher 1.9%

WHAT THE DIAL IS, AND WHAT IT IS NOT. `SETTLEMENT_RATE` is **not** a fact about the ground —
`MIN_HABITABILITY` and `geo.habitability` are that, and neither moved. It is a fact about the world's
HISTORY: people are not spread as thinly as the land allows, they are spread as thinly as three
hundred years of them managed. It multiplies the acceptance draw, so it thins the planet uniformly
and leaves the shape intact: better ground is still likelier to hold a village, there are just fewer
villages. `habitable` staying at 55.7% across both rows is the check that this is true.

WHAT IS GOOD HERE. The trades vary with the ground rather than with a table — fishers are 1.9%
because `coastal` needs water inside 3 km and most land does not have it, and miners are 4.8% because
the planet is half of Earth's ruggedness by C1. A village's median is 23 people, which is Stanford's
Smallville minus two, and it is the size the design argues for. **2.4 million graves exist at day 0
without a single row**, which is what SOC-6.H needs to make mortality visible in a first session on a
clock where nobody will ever watch someone die (C24).

FREE TO MOVE, and this is the second half of why it could be chosen rather than agonised over: C25
means **zero rows**, so the whole planet re-derives from the seed the moment the constant changes. Do
re-measure with the script and put the number here, rather than in a commit message. The test that
guards it derives its bound from `SETTLEMENT_RATE` itself — it was a hard-coded `> 60 && < 260` and
went red the first time this dial moved, which is exactly how a bound gets re-typed to whatever the
code now does.

## C34 — the ML store is SNAPSHOTTED, not replayed; and "shared" is not being taken yet

Answers the design half of SOCIETY-PLAN SOC-2.D, taken 2026-09-09. **No durable store is built by
this entry.** What is built is the precondition (⚑24) and the decision; the build is next, and this
says exactly what it will and will not be.

THE ITEM'S TITLE IS "SHARED, DURABLE" AND THOSE ARE TWO PROBLEMS WITH DIFFERENT COSTS.

  AMNESIA — nothing in `services/ml` serializes anything, so every restart returns every user to the
  prior. Measured frequency: `render.yaml` has `autoDeploy: true` and NO `buildFilter`, so every
  push to the connected branch redeploys both services. Over 90 days on `main`: 143 commits across
  17 active days, **of which only 38 touch `services/ml`** — so the great majority of the redeploys
  that wipe every posterior are for changes that never touch the measurement engine. **A docs commit
  resets everyone.** What a person sees is `EchoPanel`'s "No one knows you here yet — not even your
  echo", plus buckets back to `copilot` and the conditional signature gone.

  ONE PROCESS, FOREVER — `Store` is a process-local dict, so the service can never run a second
  worker or a second instance. Demonstrated with the real Dockerfile command plus `--workers 2`: 12
  sequential observations for one user, then 12 reads on fresh connections, and one read came back
  `persona.version 0`. Distinct versions `[0, 12]`. At `--workers 1`, `[12]`. **And the trap worth
  recording: with a single keep-alive client the split does not appear at all** — the connection
  pins to one socket — so anyone who tests this with one client concludes it is fine.

**THIS DECISION TAKES DURABLE AND LEAVES SHARED.** A snapshot does not make the store shared, and it
was measured not to: version 5 of 10 across two workers, with and without a version guard. The only
thing that would is moving the read-modify-write into Postgres, which this repo already owns the
primitive for — `registry.ts`'s `pg_advisory_xact_lock` — and which is expressible through the `pg`
client and NOT through PostgREST. **So the shared half is coupled to SOC-2.A's choice of access path
and the durable half is not.** Saying which half is being taken is the whole reason this paragraph
exists: SOC-2.D has one name and two problems, and a half-fix recorded as a whole one is this
repo's standing failure.

SNAPSHOT, NOT REPLAY, AND THE REASON IS A MEASUREMENT. The attractive alternative was to keep no
serialized state at all and rebuild a user by replaying their events — `feat/measurement-corpus`
already does this and claims the rebuild "cannot drift from the live fold". **That property does not
survive being ported onto the log this tree actually has.** `behavioral-store.ts` writes
`action: str(ev.type) || "unknown"` — the raw type string — while the posterior was folded on a
synthesized English sentence built in TypeScript ("On a lean day (day 3) they chose …"), which
`persona.py` embeds and stylometrizes. Measured divergence on the real path, six folds each with
identical telemetry: **max|Δmu| = 1.3006 against ‖mu‖ = 1.1579.** Changing one word inside the
sentence moves it 0.3940. Reproducing the fold from migration 0011 means reimplementing a
load-bearing string generator character-for-character in a second language.

AND REPLAY'S ONE GENUINE ADVANTAGE IS INSURANCE AGAINST AN EVENT THAT CANNOT BE SCHEDULED. It would
survive the one-time `W` re-anchor (C29) where a snapshot would not. But `⚑21` records that the
re-anchor "is not schedulable until labels exist". **The argument that settles it: a snapshot stamped
with the `W` it was folded under, which self-invalidates when `W` changes, degrades to the prior —
which is precisely today's behaviour.** So the re-anchor costs nothing relative to the status quo,
and one `w_sha256` column buys the whole of replay's advantage. Replay would also have cost a second
identity-keyed behavioural log whose retention window is explicitly undecided (`⚑22`), an
O(all-events-ever) cold read on a path reachable unauthenticated, and it still would not restore
`reward`, `buckets`, `calib` or `temperature`.

USE THE TABLES THAT EXIST. `persona_state`, `behavior_index`, `reward_model_state`,
`autonomy_buckets`, `preference_pairs` and `meeting_outcomes` have been declared in `0001_init.sql`
since June with **zero writers** — the same shape as `parcels.display_name`, which SOC-2.B has just
filled in rather than superseded. The two expensive things are already right: `z_mean vector(8)`
matches `persona.D == 8`, and `context_embedding vector(256)` matches `embed_dim == 256`, both
enforced by pgvector. **ONE additive migration, numbered 0014** — 0013 is reserved for renaming the
corpus migration off its branch — adding what has no column at all: `cond`, `temperature`, `calib`,
`baseline_mu`, `BehaviorEntry.provenance`, and `Bucket._cusum`. Not `_recent`: it is written and
never read, and the ECE that gates promotion is computed from `calib`.

ONE COMMENT IS A LIE AND IS FIXED BY A COMMENT, NOT A COLUMN. `z_cov_json` says "diagonal covariance
as array" and the shipped Σ is a full 8×8 — the comment was true for **seven hours**, between 0001
shipping and "WI-1: full-covariance persona posterior" landing twelve commits later the same day,
and nothing noticed for 85 days because nothing writes the column. `jsonb` cannot catch it: measured,
the column accepts both the true 8×8 and a flat 8-number diagonal, and reads back as an array either
way. *Sized honestly, though:* the eigenvalue floor pins Σ to exactly `0.02·I` from about the twelfth
fold onward, so the off-diagonals are load-bearing for a user's first eleven observations and vacuous
after. That is still exactly the cold-start case a snapshot exists for.

BUILT, 2026-09-09, in three pieces with a seam between them that is the point:
`snapshot.py` is pure functions of their arguments — no network, no key, no service — so the things
that are easy to get subtly wrong are testable without any of those; `persistence.py` holds the
PostgREST client, the write-behind queue and the hydrate; `store.py` joins them. Migration `0014`
adds only what had no column at all and corrects `z_cov_json`'s comment rather than adding a column
beside it. **34 tests**, and each of the three files was verified fail-to-pass by reverting the thing
it exists for.

FOUR DECISIONS INSIDE THE BUILD THAT ARE NOT OBVIOUS FROM THE OUTSIDE.

  **The snapshot is marked in `Store.updating`, not at the five call sites.** A sixth endpoint will
  be written one day, and a convention that must be remembered at every mutation is one that will be
  missed at one of them — the bug being a user whose posterior is durable on four paths and amnesiac
  on the fifth, which nobody finds.

  **`Store.get` hydrates OUTSIDE the global dict lock.** That lock is held by every user's every
  access; a network read inside it would serialise all of them behind one Supabase latency, which is
  exactly the cost per-user keying exists to avoid. Look under the lock, read outside it, take it
  again to install — and on a race, FIRST WRITER WINS and the hydrated copy is dropped rather than
  merged, because merging two views of one posterior reintroduces `⚑16` through the back door.

  **An absent user is read once per process, not once per request.** `GET /persona/{uid}` is
  unauthenticated until SOC-2.E, so without a negative cache, enumerating ids would be a database
  read per probe. With it, the bound is one read per distinct id — the same bound `Store._users`
  already has.

  **`Store.delete` performs the durable delete FIRST and lets it raise.** Erasure is a promise to a
  person: if the rows cannot be removed, the honest outcome is a failed request, not a cleared cache
  and a surviving row that the next hydrate would bring back.

WHAT IS NOT VERIFIED, AND IT IS THE TRANSPORT. Every test above runs against a dict-backed fake
implementing the same three verbs. **No PostgREST round trip has been made** — there is no PostgREST
to run locally, and the deployed transport is Render→Supabase over TLS, which is not the loopback
number anyone would be tempted to quote. So: the serialization is proven, the queue is proven, the
join is proven, and the wire is not. The first environment to set `ECHO_ML_PERSIST=1` is the test of
the wire, and it should be a staging project rather than the one in `render.yaml`.

THE PRECONDITION, DONE FIRST AND ON PURPOSE — `⚑24`. Every candidate design begins by reading
`SETTINGS.supabase_*`, and those read the repo-wide names that `run.sh` sources from a gitignored
`.env` holding production credentials. The first durable write would have made `npm run dev:ml` a
laptop writing into production. Renamed to ML-owned names behind an explicit `ECHO_ML_PERSIST=1`
before any write exists, because **a default that only fires once the feature lands is a default
nobody tests.**

## C35 — behavioural data lives 90 days; the profile lives while the account does

Answers SOCIETY-PLAN SOC-2.G, taken 2026-09-09. `⚑22` had it as "OPEN, for a human and probably for
a lawyer", and it is the human half that is answered here.

WHAT THERE WAS BEFORE: **nothing.** Thirteen identity-keyed tables, no TTL, no expiry column, no
pruning job anywhere in the schema, and no default in the code. `0011_behavioral_events` shipped a
durable personal-data log and said so in its own header; SOC-2.D then gave four more tables rows.
**"We keep everything forever because nobody chose" is a choice, and it was being made daily.**

  RAW — what you did, when, with whom, in what words          **90 days**, then swept
      behavioral_events · telemetry_events · interactions · messages · narrations
  DERIVED — what was concluded about you                       kept while the account lives
      persona_state · behavior_index · reward_model_state · autonomy_buckets ·
      preference_pairs · meeting_outcomes

THE SPLIT IS THE DECISION, not the number. The sensitive surface is the log; the eight axes are the
product. An echo that forgets you every quarter is not an echo, and a world that keeps a
minute-by-minute record of a named person forever is not defensible — so one expires on a clock and
the other does not.

WHAT IT COSTS, and it is a real price rather than a free win. `⚑21` measured a 240-row corpus with
variance in only **7 of its 66 features**, so the second `W` re-anchor needs volume, and a rolling
90-day window may never accumulate it. That is paid deliberately: `⚑21` also records that the
re-anchor "is not schedulable until labels exist", so this trades a corpus for an event with no date
against an exposure that is real every day. **If a date ever appears, this is the number to revisit
first**, and revisiting it is a config change rather than a rebuild.

THE LAWFUL BASIS IS CONSENT, which is what the card already asks for — and consent is what decides
the next line rather than a label on top of it.

ON WITHDRAWAL: `revoke()` stops all new sampling immediately, and rows already collected age out on
the clock above. **It does not erase.** `/account` does that, on demand, and SOC-1.E was careful that
the inspector's copy says so rather than implying a toggle undoes what was already sent. The
alternative — withdrawal triggering the full cascade — would make a one-click control irreversible,
which is a different kind of thing from a toggle and should not wear a toggle's clothes.

A SUBJECT-ACCESS REQUEST RETURNS BOTH, CLEARLY SEPARATED: the derived profile and the raw events it
was folded from, labelled as two different things. That is also what the inspector already shows a
person live — the panel exists so the measurement is not a black box, and an access request should
not be a worse view than the product's own.

MECHANISM. `lib/retention.ts` holds the window, the two table sets and the sweep;
`0016_retention_indexes.sql` indexes the five timestamp columns, because there is no TTL in Postgres
(0007 wrote that sentence first) and a sweep without indexes is five sequential scans a day over the
fastest-growing tables. **It is NOT its own cron entry**, and that is a constraint: Vercel's Hobby
plan permits at most one cron run per day and rejects the WHOLE DEPLOYMENT if a schedule is more
frequent — the twelve-hour outage `api/cron/waitlist-sweep` records in its own header. So the sweep
rides the existing daily cron, and runs first, before the portrait path's several early returns,
because a sweep that only happens on the quiet branch is a sweep that mostly does not happen.

NOT DECIDED HERE, and flagged where a reader will meet it: `messages.text` is the actual typed
content of a conversation and the most sensitive row in the schema. It is swept on the same clock as
everything else, which is the conservative option available today — but whether it should exist at
all, given ConsentCard's promise to read "never what you type", is SOC-5.D's question and is open.

## C36 — the frame that breaks the budget, per layer, and it is not the layer anyone was aiming at

Completes SOC-1.A's machine half. `C28` measured WHAT the worst frame costs and `C31` measured WHERE
a frame goes — but C31's split was taken at the SPAWN VIEW, standing still, which is the cheapest
frame either route ever draws. So the attribution existed for a frame that fits and did not exist
for the frame that does not. This is the second one.

Measured over a full 24-heading turn, sky frozen at DUSK, pixel ratio 1, headless Chromium.

  ordinary 8482589 — worst of 24 at -75 deg: 921,050 tri / 103 calls  (main 679,229 · shadow 241,821)
    layer            main tri  calls     shadow tri  calls
    detail            255,481      6              0      0
    meadow            171,600     22              0      0
    scatter           153,678     16        125,662      3
    terrain            80,406      4        100,303      5
    player             15,856     23         15,856     23

  ordinary 847db45 — worst of 24 at +56 deg: 1,580,189 tri / 109 calls  (main 1,471,548 · shadow 108,641)
    detail          1,077,608      8              0      0
    meadow            163,800     21              0      0
    scatter           129,850     23         72,346      4
    terrain            82,226      5         20,439      1
    player             15,856     23         15,856     23

  demo             — worst of 24 at -171 deg: 867,015 tri / 119 calls  (main 658,277 · shadow 208,738)
    detail            254,092      6              0      0
    meadow            156,000     20              0      0
    scatter           150,381     16         93,633      3
    terrain            79,382      5         99,117      5
    player             15,856     23         15,856     23
    slice                 358     12            132      5

FIVE THINGS, AND THE FIRST ONE MAKES C28 AND C31 IMPRECISE.

1. **"THE ORDINARY PARCEL" IS TWO DIFFERENT CELLS.** `scatterSplit.spec.ts` measures
   `8482589ffffffff`; `demoUrl.ORDINARY_CELL` is `847db45ffffffff`. At their worst headings they are
   **921,050 and 1,580,189** — a factor of 1.7 between two parcels the suite calls by the same name.
   C28's 907,250 is the FIRST cell. Both entries say "the ordinary parcel" as though it were
   singular, and a frame budget quoted without its cell is a budget about one parcel of 284,004.

2. **`detailLayer` IS THE WHOLE PROBLEM ON THE WORSE CELL: 1,077,608 triangles in EIGHT DRAW CALLS,
   68% of the entire frame.** That is 4.2x what the same layer costs on the other cell (255,481) and
   5.2x what C31 measured at the spawn (205,466). Nothing else is close: meadow, scatter, terrain and
   the rig together are 259,788 of that frame. **Every plan for making the frame fit was aimed at
   the spawn view's biggest layers, and on the frame that actually breaks the ceiling the answer is
   one layer.**

3. **THE SHADOW PASS IS NOT THE PROBLEM**, which was the standing hypothesis and is refuted:
   241,821 / 108,641 / 208,738 across the three. On the worst frame of all it is 7% of the total.
   C20's "only things 1.7 m and taller cast a shadow" is doing its job — `detail` and `meadow` cast
   nothing at all.

4. **ONE PARCEL IS NOT ONE NUMBER.** On `847db45` the best heading is **596,810** — under C16's
   ceiling — and the worst is 1,580,189. **A 2.6x swing on the same ground without moving.** Any
   figure quoted for "the frame" that does not say which heading is quoting one twenty-fourth of the
   answer.

5. **THE DEMO IS ONE DRAW CALL FROM THE CEILING: 119 of 120.** Not triangles — calls. So the
   draw-call budget is already spent before a second body is drawn, and C31's finding that a body
   costs 46 calls of whole frame is not a future problem on that route.

THE INSTRUMENT WAS CHECKED AGAINST ITSELF before any of this was written down. The per-object
attribution hooks every drawable, so the obvious worry is that it perturbs the frame it measures.
Measured: the same sweep at `?debug=render` (frame only, no per-object hooks) and `?debug=layers`
returns **1,580,189 at both**, identical to the triangle. The tool is not in the reading.

WHAT THIS CHANGES FOR SOC-4. The question was "cut detail or cut meadow"; the answer is that on the
frame that fails, **`detailLayer` is 68% of it and everything else is rounding**. That makes SOC-4's
blocker one layer's LOD behaviour rather than a general fidelity negotiation — and `detailLayer`
already sizes its mesh at the full class count and partitions every frame, which is where to look
first. **This entry does not take that decision**; it removes the guesswork from it.


## Still open

C8 (echo-ml on a paid plan), C13 (regenerate two legend plates).

Both are ACTIONS rather than decisions: they need an account or credits. They are not blocking any
code that is being written now.

C11 IS ANSWERED, by C27: the individuation harness keeps its world. `/play`, `ThreeWorld` and
`/flow1` stay alive, frozen, as a measuring instrument.

C10 IS STILL OPEN AND IS NOW BIGGER THAN IT WAS WRITTEN. "Provision `DATABASE_URL` and run the seed"
is missing a fifth step nobody had scoped: `apps/web/src/lib/planet.ts` hardcodes `backend: "memory"`
and always constructs `MemoryRegistry`, so the pg-backed `packages/planet/lib/registry.ts` — the one
that has the `SKIP LOCKED` and the advisory locks a mutable society needs — IS NEVER INSTANTIATED IN
THE APP. Closing C10 means building the two-backend seam and deciding pooling for `pg` on Vercel
serverless. Tracked as SOC-2.A.

C15 IS REOPENED, by C25. "What an ordinary parcel offers a person who walks it" was deferred
because at launch the whole planet is unclaimed and an unscoped rule puts a cave and a campfire on
all 284,004 parcels. Populating the planet IS that deferred decision arriving. Tracked as SOC-0.F.

NEWLY OPEN, and owed before any society cue is written: which of kinship, bereavement, employment,
transaction, being-known and inheritance already has a cue, which needs one, and which of those has
a `W` direction (SOC-6.G) — and then whether that list consumes the ONE-TIME `W` re-anchor flag 20
records, or ships unrouted like the thirteen manner scalars already riding on this (SOC-0.D).
