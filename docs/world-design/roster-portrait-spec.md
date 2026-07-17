# ECHO — Roster Portrait Spec (landing §1b)

The technical contract every roster portrait must satisfy. It exists because the first attempt
generated eight portraits independently with no shared spec, and the result failed in six ways:
soft airbrushed shading under a pixel filter (not 16-bit); faces rendered at finer detail than the
clothing; visibly different pixel densities across the set; no shared crop baseline; mixed hard/soft
shadows; and eight recolors of one template — passport photos, not a roster.

This spec is subordinate to `art-bible.md`. Where the bible speaks, it wins. This document only adds
what the bible does not cover (it describes a top-down world; a roster portrait is a bust) and
pins down what must be **identical across the whole set**.

---

## 1. Canvas and grid (hard numbers)

| property | value | why |
|---|---|---|
| Delivered canvas | **72 x 108 px**, exact | 2:3 tile. 72 is ~4.5x the ~16px world sprite: "more detailed than the standard 16-bit world sprite" while still reading as a pixel grid. Empirically, 40px destroys the face and 96px still reads as a shrunken painting. |
| Effective pixel size | **1 delivered px = 1 art pixel** | No sub-pixel detail anywhere. The face is drawn at the SAME density as the clothing. This is the single biggest tell of fake pixel art. |
| Display scale | integer only: 1x / 2x / 3x | Enforced in CSS with `box-content` (see CharacterSelect.tsx). |
| Palette cap | **24 colours** per portrait, set-wide shared ramps | Hard cap. Quantized, `dither=NONE`. |
| Tile background | flat ink `#1c1326`, edge to edge | One value. The only permitted variation is the cast shadow below. |

## 2. Light and shadow (identical across the set)

- **One light**, low western sun just under the horizon (art-bible §2). Key from the **upper-left**.
- **NO cast shadow on the background. The tile behind the figure is flat ink, everywhere.**
  This reverses the first draft of this spec, on evidence. A cast shadow is a per-generation
  decision, and the model varied it: hard drop shadow on one portrait, soft on another. The hard
  one read dirty and detached the figure from the tile, and it polluted the silhouette mask so the
  IoU check was comparing shadows instead of people. Deleting the shadow deletes the entire failure
  mode. The light still reads — it lives in the figure's own stepped shading.
  **Enforced in post, not asked for:** the processor flattens every background pixel to exact
  `#1c1326`, so a vignette, glow or shadow that sneaks into a generation is erased.
- **Shading is stepped, not smooth.** Two shadow steps maximum per material. No airbrush, no
  gradient ramps, no glow.
- **Selective 1px ink outline** on the figure's lit edges only; the shaded side dissolves into its
  own shadow. No uniform keyline around the whole figure.

## 3. Framing (identical across the set) — enforced in post, never requested

- **Baseline: every bust terminates at the bottom edge of the canvas.** No figure floats.
- **Scale: every figure's height is normalised**, so the set cannot carry two apparent zoom levels.
- Horizontal: centred on the figure's own centroid.

**These are computed, not prompted, and that is the central lesson of the failed test run.** Asked
directly and explicitly to run the bust off the bottom edge, two independent generations floated it
anyway — and floated it by *different* amounts (y=95 and y=100), which is precisely the
"no shared baseline" failure. A model re-decides framing on every call. So the processor measures
the figure's bounding box and re-anchors it deterministically:

    flatten background -> find figure bbox -> scale to target height -> seat bottom on the canvas floor

Per-character crop variance (spec §4 wants the set not to look stamped) is then applied as a
**deliberate** ±4px nudge from the cast table, not left to the model's drift. Controlled variance,
not random variance.

## 4. The silhouette test — the acceptance bar

**Black the character out. You must still tell them apart.** Colour is not identity; shape is.
This is what makes a roster a roster instead of eight recolors.

Every character must differ from every other on **at least three** of:

1. **Hair shape** — the outline of the head. Not hair colour.
2. **Build** — broad / slight / rangy. Shoulder width and slope.
3. **Posture or angle** — straight-on, 3/4 turn left/right, head tilt, shoulders squared vs dropped.
4. **Clothing shape** — collar, hood, shawl, high neck, open jacket. Not tunic colour.
5. **A prop or accessory that BREAKS the outline** — the strongest silhouette tool available.

Also required, per the brief:
- **Vary the crop slightly** (±4px scale/offset) so the set does not look stamped.
- **Vary the expression.** Not eight neutral passport faces.

### Automated bar (pipeline/audit-roster-portraits.py)
- Extract each figure's binary mask (anything that is not the flat ink background).
- Compute pairwise **IoU** of the masks in tile coordinates.
- **Fail if any pair scores IoU > 0.80**, or if the **mean pairwise IoU > 0.55**.

Those numbers are calibrated against the measured baseline, not invented. The rejected first
attempt — eight recolors of one template — scored **mean 0.630, worst pair 0.842**. So a bar of
"mean ≤ 0.80" would have PASSED the set we threw away, and is worthless. The bar is set below the
baseline precisely so the new set has to actually be different, not merely different-ish.

**IoU is necessary but not sufficient**, and this is the honest limitation of the automated check:
the mask includes hair, so the old set already scored 0.630 purely on hair outline while remaining
eight identical bodies. IoU cannot see pose, attitude, or expression. The mechanical bar is
therefore paired with a mandatory human step: render the masks as a black-on-white contact sheet
(`--silhouettes`) and look at it. If the blacked-out set does not read as eight different people,
the set fails regardless of the number.

## 5. What must stay faithful to the world

The roster tile is art; the character a player actually receives is the procedural sprite from
`styleFromId(id)` in `game/art.ts`. So:

- **Skin, hair colour, tunic colour and hair style are NOT free.** They are dictated by
  `styleFromId(id)` and the portrait must match, or the tile lies about what you get.
- **Build, posture, expression, collar shape and props ARE free** — the sprite spec has no opinion
  on them, so they are where silhouette variety must come from. These are portrait-only; the
  in-world sprite will not carry the prop. That is a deliberate, disclosed divergence: roster art
  advertising a character is normal, and the identity-bearing attributes above all hold.

## 6. Forbidden

- Echo-violet `#a06cd5` and the echo ramp (`#7a4aa8`, `#c79bf0`), anywhere, in any amount. The
  landing spends its entire violet budget on the empty centre slot. The bible on the solo figure:
  "no echo-violet — they are a person, not the uncanny."
- Any purple within RGB distance ~20 of the ramp. This bans the `#7a55a0` "heather" tunic, which
  sits 13.6 away — the accent wearing clothes. Ids hashing to it are excluded from the roster.
- Text, logos, UI, watermarks, borders, vignettes, background scenery, rim light, bloom.
- Smooth gradients, airbrush, anti-aliased "pixel filter over a painting".

## 7. Production method

Portraits are generated as **one single contact sheet, not eight independent runs**, and sliced.
See `pipeline/generate-roster-portraits.mjs`. Rationale and the evidence that forced it are in
§8 below and in the report.

Post-processing (`pipeline/process-roster-portraits.py`) is what actually enforces the pixel grid:
a generative model asked for "16-bit pixel art" reliably returns a smooth painting with a pixel
motif. LANCZOS down to the cell width, then MEDIANCUT quantize to the palette cap with dither
disabled, is what makes it real pixel art. The prompt cannot be trusted to do it; the pipeline can.

**Never chroma-key these.** `process-flow-assets.py`'s magenta key reads pinks and purples as spill:
it keys `#7a55a0` and `#b05a86` tunics fully transparent and despills `#d05a7a` hair to grey. The
portraits are generated on flat ink and never keyed.

## 8. Verification record

Filled in by the run that produced the committed set — see the final report and
`npm run verify:roster`.
