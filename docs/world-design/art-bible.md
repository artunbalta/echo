# ECHO — Art Bible (the world's visual soul)

The single source of truth so every asset reads as **one place**, not a patchwork. Every later
`hf gen` prompt inherits the **Style Token Block** (§4). Generated to this bible, the world should
feel like *a country that does not exist* — calm, literary, dusk-lit, slightly uncanny.

> Status: **DIRECTION FOR APPROVAL (Step 6, Part 0).** Companion: `art-bible-styleboard.svg`
> (hand-authored palette/light/accent reference — *not* the AI samples). The 4 sample `hf gen`
> prompts are in §6, ready to run once the Higgsfield CLI session is re-authed.

---

## 1. Anchors (fixed — do not drift)

- **16-bit top-down orthographic RPG.** Crisp pixels, nearest-neighbour upscale. Tiles 16px source.
- **Core palette:** ink `#1c1326` · echo-violet `#a06cd5` · parchment `#f4e9d0` · grass `#74c365`
  · bark `#7a4a2b`.
- **Dusk light. Calm, literary, slightly uncanny tone.** The pull is the mirror forming — never points.

## 2. The elevated direction (the soul, within the anchors)

What turns the anchors into a *place*:

- **One light, always.** A low **western** sun just under the horizon. Every object casts a **long,
  soft shadow toward the upper-left.** Shadows are **ink at ~35% over the ground**, never pure black.
  One consistent light is the single biggest unifier — it makes scattered assets feel co-located.
- **Selective outlines, not keylines.** A **1px ink outline on objects/props/figures/stands only**,
  and only on their **lit** edges (the shaded side dissolves into its own shadow). **Ground tiles
  carry no outline** — they read by value and texture. This is the "elevated" move vs. flat
  uniform-black-outline pixel art: it gives depth and a hand-painted feel.
- **Dusk saturation.** Hues are **vivid but value-muted** — saturated colour, lowered brightness, as
  if the sun just left. Nothing is daytime-bright; nothing is night-black. The whole world sits in
  the warm-to-cool dusk band.
- **Texture = restraint + grain.** Flat fills with a **subtle ordered-dither (1–2px) only at value
  transitions** (tile edges, shadow terminators, water depth bands), plus a **very faint film grain**
  over the whole frame. Keeps it from looking like flat vector art; keeps it from looking noisy.
- **Built warmth vs. wild dusk — the emotional contrast.** *Nature* is organic, irregular,
  soft-edged (grass/bark/water, no straight lines). *Built things* (stands, homes) are **deliberate
  geometry** — straight bark beams, parchment canvas/cloth, a **pooled warm lantern glow** spilling
  parchment light into ink shadow. The settlement's warmth against the wild dusk *is* the feeling.
- **The uncanny accent — the one rule that matters most.** **echo-violet `#a06cd5` is sacred and
  rare.** It appears **only where the mirror/echo theme touches** — a tide-pool reflection that holds
  the wrong posture, the doppelgänger, the faint glow of the island on the horizon, bioluminescent
  water at dusk, the echo "forming" in UI. **Never decorative. Target ≤ ~5% of any frame, usually
  0%.** Its scarcity is what makes it land: when violet appears, something is watching / forming.

## 3. Palette extensions (defined here so water/sky/interiors stay coherent)

Within the anchors, these are the sanctioned extensions (use these hexes; don't invent new families):

| Family | Ramp (dark → light) | Use |
|---|---|---|
| **Ink/shadow** | `#120c1c` `#1c1326` `#2a2340` | outlines, deep shadow, night water, the horizon silhouette |
| **Water (day-shallow→deep)** | `#3aa0e6` `#2680c6` `#1f5a8f` `#1c3a5e` | shallow turquoise grading to ink-deep sea |
| **Water foam / glint** | `#cfeafb` `#f4e9d0` | foam flecks, sun-glint; (echo-violet shimmer only at uncanny beats) |
| **Sky/horizon (dusk band)** | `#e8b894` (low glow) `#c98a8f` `#8a6a9e` `#5a4a72` `#3a2f50` | parallax horizon gradient |
| **Sand/shore** | `#9a7e54` (wet) `#c9ad79` `#e8d3a0` (dry) | wet→dry beach; tide-line foam = parchment |
| **Grass/life** | `#3f8a45` `#57b257` `#74c365` `#8fd97e` | land, foliage, life |
| **Bark/structure/earth** | `#5d3a22` `#7a4a2b` `#9a6238` `#b88a5a` | wood beams, trunks, soil, stand frames |
| **Parchment/warm-light** | `#cdb88e` `#e8d3a0` `#f4e9d0` `#fbf4e4` | lantern light, cloth/canvas, UI text, the "human/warm" |
| **Echo (uncanny only)** | `#7a4aa8` `#a06cd5` `#c79bf0` | the mirror accent — sparse, never decorative |

## 4. The Style Token Block (every `hf gen` prompt appends this)

> **STYLE:** 16-bit top-down orthographic pixel art, dusk light from a low western horizon casting
> long soft shadows toward the upper-left, shadows are deep-aubergine ink (#1c1326) at low opacity
> never pure black, cohesive limited palette (ink #1c1326, parchment #f4e9d0, life-green #74c365,
> bark-brown #7a4a2b, water turquoise-to-ink, dusk-mauve sky), vivid but value-muted dusk saturation,
> selective 1px ink outline on objects only (none on ground), subtle ordered-dither grain only at
> value transitions, faint film grain, calm literary slightly-uncanny mood, crisp pixels
> nearest-neighbour, cohesive with a single consistent light direction, **NO text, NO logos, NO UI,
> NO watermark, NO border.**

> **UNCANNY ACCENT (add only at mirror/echo beats):** a single sparse echo-violet (#a06cd5) glint
> where the reflection/echo theme touches — otherwise echo-violet is entirely absent.

> **SEAMLESS TILE (ground textures):** "seamless tileable, tiles perfectly when repeated with no
> visible seam, evenly lit, flat top-down, fills the whole square." aspect 1:1, unkeyed.

> **ISOLATED SPRITE (props/figures/stands):** "isolated and centred on a solid flat chroma magenta
> (#ff00ff) background, no ground, soft contact shadow only." keyed + downscaled by the existing
> `process-*-assets.py` recipe.

## 5. Per-area application (so each flow inherits the soul, not a re-interpretation)

- **F0 shore (solitary):** wet→dry sand, tide-line foam, a single climbable grass hill, a tide pool
  whose still water shows a parchment reflection — and, at the egg beat, **one echo-violet frame**
  where the reflection's posture is wrong. Distant-island horizon = ink-mauve silhouette with the
  faintest echo glow. Emptiness + one warm light = solitude.
- **F1 scarcity:** fertile patch (life-green) vs berry bush; a gamble cave mouth (ink interior, a
  far echo-violet glimmer = the uncertain lure); marker-stone with progressive parchment glyphs.
- **F2 crossing:** raft/causeway of bark beams over turquoise-to-ink water; the **solo figure** — a
  hooded duskling, warm-but-reserved, idle/cold/warming states. Ocean set grades to ink at depth.
- **F3 clearing:** small, warm, lantern-lit — stands of bark+parchment-canvas; the station figures
  (stall keeper, elder, well-queue, talker-knot, the one apart, trader). Built warmth, dusk wild edge.
- **F4 community:** bench, shared fire (warm parchment glow pooling in ink dusk), memory wall (kept
  promises in parchment glyphs, broken ones ink-scratched), partner relationship states.
- **F5 pressure/private:** an **"unwatched hush"** lighting state — the frame desaturates, the warm
  light narrows to the player, ambient detail fades to ink; a found-property prop; scarcity overlay
  (the world's greens dim toward bark/grey).
- **F6 settlement:** homes (orderly↔ornate↔sparse customization kit), plaza, gathering scene, and
  the **doppelgänger cameo** — the player-mirroring avatar, rendered with the echo-violet accent on
  its outline (the only figure that carries violet).
- **Stands (all archetypes):** exterior = bark frame + parchment awning + a hanging lantern; interior
  = warm pooled light, bark walls, ink-shadow corners, **one object carrying the echo glint** (the
  sign/trinket). A stand is *built warmth you walk into*. Branding (e.g. THY) is a **cloth/sign skin**
  over this same frame — never a different art language.

## 6. Sample prompts for approval (Part 0 — run these 4 first)

Each = the area-specific line + the §4 Style Token Block. Generated via the proven recipe
(`higgsfield generate create nano_banana_2 --prompt "<…>" --aspect_ratio <a> --resolution 1k --wait`),
then keyed/downscaled by `pipeline/process-*-assets.py`.

1. **`sample_shore` (1:1, unkeyed):** "Seamless tileable top-down beach where wet reflective sand
   (#9a7e54) grades to warm dry sand (#e8d3a0) with a faint parchment tide-line of foam, a few tiny
   pebbles and shell flecks." + STYLE + SEAMLESS TILE.
2. **`sample_water` (1:1, unkeyed):** "Seamless tileable top-down dusk sea, shallow turquoise (#3aa0e6)
   grading to deep ink-blue (#1c3a5e) in gentle depth bands, soft foam flecks (#cfeafb), the low dusk
   light glinting on the ripples." + STYLE + SEAMLESS TILE.
3. **`sample_travel_stand` (2:3, keyed):** "A small top-down harbour/ferry travel stand: straight
   bark-beam posts holding a taut parchment-canvas awning, a hanging warm lantern pooling parchment
   light, a little departures board (blank, no text), a coil of rope and a mooring post — built and
   deliberate against the wild dusk." + STYLE + ISOLATED SPRITE.
4. **`sample_solo_figure` (2:3, keyed):** "A single top-down 16-bit figure: a hooded duskling
   traveller standing quietly, warm but reserved posture, parchment-and-bark clothing, a soft contact
   shadow — the one other person on a far shore." + STYLE + ISOLATED SPRITE (no echo-violet — they are
   a person, not the uncanny).

(If approved, mass-generation in Part A reuses this exact recipe + the §4 block for every manifest
asset in `ECHO_level_design_7flows.md`, and the stands in §5.)

## 7. Pipeline notes (no new rendering path)

- Generation: `higgsfield generate create nano_banana_2` → raw PNG → `pipeline/process-*-assets.py`
  (chroma-key magenta for sprites, downscale to 16-bit). Outputs committed under
  `apps/web/public/assets/<flow>/` so the world runs **key-free** (Invariant 1); missing art falls
  back to the procedural generators (`game/art.ts`, `game/props.ts`).
- Rendering reuses the proven Pixi conventions (`PixiWorld` + `artDir`, VenueScene/TownScene/
  WorldClient). **No new rendering path; no measurement change.**

---

## 8. ADDENDUM — the 2D→3D migration (2026-07-17)

This is written consciously, not silently, because §1 says "do not drift" and this drifts one of the
anchors on purpose. The world moved from 2D Pixi to **third-person low-poly 3D (Three.js/R3F)**. What
that supersedes, and what it does not:

**Superseded (say so out loud):**
- §1 "**16-bit top-down orthographic RPG. Crisp pixels, nearest-neighbour, 16px tiles**" — gone. The
  camera is third-person behind the avatar; forms are **soft low-poly, flat-shaded, carved-clay**
  geometry, not pixels. You see your own body (which is why gaze/orientation are cues now).
- §7 "**No new rendering path**" — there is a new rendering path; that was the entire task. **The
  measurement change is still none:** the spine is renderer-independent, gameplay stays (x, y) on the
  flat plane, the server diff is empty, protected files byte-untouched against main.
- §6 sample `hf gen` prompts and the Higgsfield/PNG pipeline (§7) are dormant for the world: every
  world asset is **procedural geometry** now (`game/three/*`, `game/props3d.ts`), zero GLB, nothing
  to gen or commit. (The **landing** still uses its committed PNGs — untouched.)

**Carried over UNCHANGED (the soul was never about pixels):**
- **One light, always** — a single low **western dusk** key, everything lit by it. Now a real
  `DirectionalLight`, which is what the 2D screen-wash was imitating.
- **Long soft shadows, ink not black** — real soft shadow maps; the shadow/ground tint is ink
  (`#0b0e14`), and `#000000` is still banned.
- **Dusk saturation** — vivid but value-muted; the 9-family palette (`game/three/palette.ts`) is the
  bible's, hue for hue.
- **echo-violet `#a06cd5` sacred and rare, ≤5%** — it marks live humans (the presence ring), the
  marker-stone glyph, and will mark the doppelgänger. Never decoration. This rule is load-bearing and
  fully intact.
- **Pooled warm lantern light vs cool dusk** — the campfire is the one warm pooled light against the
  cool key; nature is organic (spheres/cones/irregular solids), built things geometric (boxes, clean
  rails). The emotional contrast survives.

The one thing 3D ADDS that 2D could not: the body is visible and orientable, so **gaze/heading and
posture** are legible — new embodied signals for the flows to read.
