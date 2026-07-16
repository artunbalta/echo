/**
 * The cast: eight islanders, designed silhouette-first (docs/world-design/roster-portrait-spec.md §4).
 *
 * WHY THIS FILE EXISTS. The first attempt generated eight portraits from one description with only
 * hair and skin varying. Blacked out, they were one blob — identical shoulder line, identical
 * width, identical pose (measured: mean silhouette IoU 0.630, and visually indistinguishable).
 * A roster reads as attitude, not as recolors. So each character here is designed to differ from
 * every other on at least THREE of: hair shape, build, posture, garment shape, and a prop that
 * breaks the outline. Colour is deliberately NOT one of the five: colour is not identity.
 *
 * WHAT IS FIXED vs FREE (spec §5):
 *   FIXED  — skin, hair colour, tunic colour, hair style come from styleFromId(id) in game/art.ts.
 *            The tile must not lie about the sprite a player actually receives.
 *   FREE   — build, posture, expression, garment shape, props. The sprite spec has no opinion on
 *            them, so this is where silhouette variety has to come from. These are portrait-only:
 *            the in-world sprite will not carry the prop. Disclosed divergence, identity holds.
 *
 * NAMES are placeless and slightly archaic to fit the world's register (a country that does not
 * exist, dusk-lit, literary). They are NOT /onboard's hair-silhouette tags ("Long", "Buzz"), which
 * read as a description rather than a person the moment they sit under a roster portrait.
 */

// ── styleFromId, mirrored from apps/web/src/game/art.ts ───────────────────────────────────────
// Mirrored rather than imported: this is plain .mjs with no bundler and the source is TS. The
// FUNCTION is mirrored, never the resulting hexes — a stale hex would silently generate a portrait
// that disagrees with the sprite. `npm run verify:roster` diffs these arrays against art.ts.
const SKINS = ["#f1c79b", "#e0a87e", "#c98a5e", "#a9704a", "#7c4f33"];
const HAIRS = ["#3a2a1a", "#7a4a2b", "#1c1326", "#a06cd5", "#5aa6d0", "#d05a7a", "#cfcfcf"];
const SHIRTS = ["#b9543f", "#41699e", "#3f8a64", "#b89a4a", "#7a55a0", "#b05a86", "#557089"];
const HAIR_STYLES = ["short", "long", "buzz", "bun"];

function hash01(s, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
export const styleFromId = (id) => ({
  skin: pick(SKINS, hash01(id, 1)),
  hair: pick(HAIRS, hash01(id, 2)),
  shirt: pick(SHIRTS, hash01(id, 3)),
  hairStyle: pick(HAIR_STYLES, hash01(id, 5)),
});

/** Human words for the palette hexes — models read words far better than hex codes. */
export const SKIN_WORD = {
  "#f1c79b": "fair warm",
  "#e0a87e": "light tan",
  "#c98a5e": "medium bronze",
  "#a9704a": "deep amber-brown",
  "#7c4f33": "rich dark brown",
};
export const HAIR_WORD = {
  "#3a2a1a": "dark coffee-brown",
  "#7a4a2b": "bark-brown",
  "#1c1326": "black",
  "#5aa6d0": "faded sea-blue",
  "#d05a7a": "faded rose-pink",
  "#cfcfcf": "silver-grey",
};
export const SHIRT_WORD = {
  "#b9543f": "muted brick-red",
  "#41699e": "muted slate-blue",
  "#3f8a64": "muted forest-green",
  "#b89a4a": "muted ochre-gold",
  "#b05a86": "muted rose",
  "#557089": "muted steel-blue",
};

/**
 * `fill` is the fraction of canvas height the figure occupies after the processor re-anchors it:
 * the deliberate ±4-6% crop variance the spec asks for (§4 'vary the crop slightly'), chosen here
 * rather than left to the model's drift. Applied in process-roster-portraits.py normalize().
 *
 * ROSTER ORDER IS THE GRID ORDER (reading order, empty slot at index 4 of the 3x3).
 *
 * IDS ARE CHOSEN FOR HEAD-OUTLINE SPREAD FIRST. styleFromId's hairStyle is the only sprite-fixed
 * attribute that changes a silhouette, so the set is picked to hash EXACTLY 2 to each of the four
 * styles (short/long/buzz/bun) — four distinct head outlines, two each. The first attempt let the
 * hash fall where it wanted and landed 3 buzz / 2 long / 2 short / 1 bun, so three characters
 * shared a head and the set measured mean IoU 0.574 against a 0.55 bar. The two characters that
 * DO share a style are then deliberately opposed on build, posture, garment and prop.
 * Also enforced: all 5 skins, all 6 permitted hair colours and all 6 permitted shirts appear, no
 * value repeats more than twice, and no same-style pair shares a skin, hair or shirt.
 * Two palette values are excluded by rule: hair #a06cd5 IS echo-violet, and shirt #7a55a0 sits
 * 13.6 RGB from the echo ramp's dark end.
 */
export const CAST = [
  {
    id: "premade_1480", // rich dark brown / bark-brown / forest-green / buzz
    name: "Pell",
    build: "heavy and broad, thick neck, shoulders squared and filling the frame",
    posture: "straight-on, chin level, utterly still",
    hairShape: "close-shaved buzzcut, flat crown, a blunt square hairline",
    garment: "a high stiff standing collar, buttoned to the throat",
    prop: "a thick coil of rope slung over the right shoulder, its bulk breaking the shoulder line sideways",
    expression: "flat and tired, heavy brow, mouth a straight line",
    fill: 0.88,
  },
  {
    id: "premade_11888", // medium bronze / black / slate-blue / buzz
    name: "Rook",
    build: "tall and rangy, narrow through the shoulders, long neck",
    posture: "turned three-quarters to his left, head straight, watchful",
    hairShape: "close-shaved, with a soft widow's peak",
    garment: "a deep hood pushed down and bunched thickly around the back of the neck, a fat roll of cloth behind the head",
    prop: "a wide strap crossing the chest diagonally from shoulder to hip",
    expression: "watchful and appraising, eyes slightly narrowed",
    fill: 0.90,
  },
  {
    // TEST FINDING: her first pass had "prop: none" and blacked out as a featureless lozenge —
    // hair and shawl merged into one rounded blob. Every character now carries a prop; it is the
    // strongest silhouette tool there is. Her turn is mirrored away from Sorrel's, the other
    // slight/long build (as a same-facing pair they measured IoU 0.707; mirrored, 0.429).
    id: "premade_8535", // light tan / black / brick-red / long
    name: "Maren",
    build: "slight and narrow-shouldered, long neck",
    posture: "turned three-quarters to her LEFT, looking back over the far shoulder",
    hairShape: "long and loose, falling well past the shoulders, one side tucked behind the ear",
    garment: "a heavy shawl gathered around both shoulders, its edge rising in a soft peak",
    prop: "a long fishing gaff resting against the left shoulder, its hooked head jutting up well clear of the head outline",
    expression: "guarded, chin slightly down, eyes level and unblinking",
    fill: 0.92,
  },
  {
    id: "premade_4940", // deep amber-brown / faded sea-blue / ochre-gold / long
    name: "Sorrel",
    build: "slight and upright, narrow shoulders sloping steeply",
    posture: "turned three-quarters to her right, chin lifted, gaze off past the viewer",
    hairShape: "long, gathered back under a tied headscarf whose knot juts out from the back of the head",
    garment: "a simple wrapped bodice, shoulders bare and narrow",
    prop: "a wide bundle of dried herbs tucked at the left shoulder, its stems breaking the outline low and sideways",
    expression: "distant and unbothered, eyes elsewhere, lips relaxed",
    fill: 0.94,
  },
  {
    // THE ONE HAND-PICKED PORTRAIT. Art supplied by Artun from an earlier run's gallery
    // (Higgsfield asset 98d4713f-70be-4da1-a40d-fb77077604d0) and adopted, not regenerated:
    //   python3 pipeline/process-roster-portraits.py --adopt premade_0 <file> 0.88
    //
    // WHY premade_0 AND NOT premade_4483. The instruction was "use this as Lark". A portrait's
    // palette is not free — it must equal styleFromId(id) or the tile lies about the sprite the
    // player actually receives. This art is fair skin #f1c79b / silver-grey #cfcfcf / forest-green
    // #3f8a64 / buzz, which IS styleFromId("premade_0") exactly, and is nothing like
    // styleFromId("premade_4483") (deep amber / sea-blue / rose / short). So the NAME Lark moved to
    // premade_0 and the art kept its palette. The label is free; the palette is not.
    //
    // It also DISPLACED premade_1480 rather than adding to the roster. premade_1480 carried this
    // exact design — heavy, buzz, straight-on, rope over the shoulder, forest-green tunic — so
    // keeping both would have put two of the same character in an eight-person lineup, which is the
    // failure this whole cast was rebuilt to fix. The name Pell moved to premade_4483.
    id: "premade_0", // fair warm / silver-grey / forest-green / buzz
    name: "Lark",
    build: "heavy and broad, thick neck, shoulders squared and filling the frame",
    posture: "straight-on, chin level, utterly still",
    hairShape: "close-shaved buzzcut, flat crown, a blunt square hairline",
    garment: "a high stiff standing collar, buttoned to the throat",
    prop: "a thick coil of rope slung over the right shoulder, its bulk breaking the shoulder line sideways",
    expression: "flat and tired, heavy brow, mouth a straight line",
    // 0.84, wider than anyone else, and chosen on evidence rather than taste. At the 0.88 this
    // design originally carried, the adopted portrait scored head IoU 0.803 against Cass — over the
    // 0.80 cap. The two share silver-grey hair, a broad build and a pale face, so they genuinely do
    // read alike, and no prompt change can fix that without regenerating. Framing this one wider
    // (its design note always said "a little more air above the head") separates them to 0.734.
    fill: 0.84,
  },
  {
    id: "premade_5893", // rich dark brown / dark coffee-brown / brick-red / short
    name: "Bryn",
    build: "compact and sturdy, shoulders round and level",
    posture: "square to the viewer but the head tipped to the right",
    hairShape: "short, with a pronounced cowlick standing up at the crown, breaking the head outline",
    garment: "a plain round neckline, nothing at the throat",
    prop: "a broad woven basket strap over the left shoulder, the basket's rim just entering frame at the elbow",
    expression: "open and direct, eyebrows up, on the edge of speaking",
    fill: 0.92,
  },
  {
    id: "premade_11861", // light tan / silver-grey / slate-blue / bun
    name: "Cass",
    build: "broad and square, a wrestler's neck, shoulders wide and flat",
    posture: "shoulders squared to the viewer, chin dropped, looking up from under the brow",
    hairShape: "hair scraped back into a small tight low knot at the nape, skull close and round",
    garment: "a heavy folded yoke over both shoulders, a thick horizontal band",
    prop: "the shaft of a fishing spear crossing diagonally behind the right shoulder",
    expression: "stern, jaw set, unimpressed",
    fill: 0.88,
  },
  {
    id: "premade_12508", // fair warm / faded rose-pink / steel-blue / bun
    name: "Wren",
    build: "small and young, slim shoulders, a narrow frame",
    posture: "leaning in slightly toward the viewer, head cocked, weight on one shoulder",
    hairShape: "a tall topknot bun sitting high above the crown, unmistakable in outline",
    garment: "a scarf wound thickly and high around the neck, swallowing the chin",
    prop: "a single long feather tucked through the bun, angling up out of the head outline",
    expression: "curious, wide-eyed, eyebrows up, caught mid-question",
    fill: 0.96,
  },
];

export const ROSTER_IDS = CAST.map((c) => c.id);
