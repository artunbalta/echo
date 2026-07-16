#!/usr/bin/env node
/**
 * ECHO waitlist roster portraits. Drives the Higgsfield CLI (`higgsfield generate create
 * nano_banana_2`) to generate one portrait-grade pixel character per premade id, for the
 * landing's "choose your character" roster (§1b). Raw PNGs land in
 * apps/web/public/assets/roster/<id>_raw.png with a _manifest.json, so the existing
 * pipeline/process-flow-assets.py keys/downscales them by the same recipe as every other asset.
 *
 * WHY THIS EXISTS: the in-world avatar is a ~16px procedural canvas sprite (game/art.ts) varying
 * on five hashed dims. That reads fine at world scale but four of them side-by-side do not read as
 * a fighting-game roster. These portraits are the roster-facing art ONLY — the character a player
 * actually gets is still the procedural sprite from styleFromId(id), and each portrait is generated
 * from that same style's palette so the two agree.
 *
 * TWO DELIBERATE DEVIATIONS FROM docs/world-design/art-bible.md, both approved:
 *  1. CAMERA. The bible's §4 block is "top-down orthographic" because it describes world assets.
 *     A roster portrait is a front-facing head-and-shoulders bust. Every other bible rule is kept
 *     verbatim: single dusk light → soft upper-left shadow, ink (#1c1326) shadow never pure black,
 *     selective 1px ink outline on lit edges only, value-muted dusk saturation, dither only at
 *     value transitions, faint film grain, calm literary slightly-uncanny mood.
 *  2. NO ECHO-VIOLET, EVER. The bible reserves #a06cd5 for the mirror/echo theme and says of the
 *     solo figure: "no echo-violet — they are a person, not the uncanny." The landing spends its
 *     entire violet budget on the empty center slot, so every prompt here bans it explicitly.
 *     Note game/art.ts's HAIRS palette CAN hash to #a06cd5 — ids that do are excluded from ROSTER.
 *
 * Graceful, exactly like generate-flow-assets.mjs: if the `higgsfield` CLI is absent or unauthed it
 * logs and exits 0. Missing portraits fall back to the procedural AvatarPreview in the roster tile,
 * so the landing never shows a broken slot and never needs a key at runtime. Results are COMMITTED.
 *
 * Run (after `higgsfield auth login`):
 *   npm run gen:roster                          # all eight
 *   node pipeline/generate-roster-portraits.mjs premade_0 premade_5    # just some
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "apps/web/public/assets/roster");

// ── the §4 Style Token Block, camera swapped to a bust (see header deviation 1) ──────────────
const STYLE =
  "16-bit pixel art character portrait, front-facing head-and-shoulders bust, crisp pixels " +
  "nearest-neighbor, dusk light from a low western horizon casting a long soft shadow toward the " +
  "upper-left, shadows are deep-aubergine ink (#1c1326) at low opacity never pure black, cohesive " +
  "limited palette drawn from ink #1c1326, parchment #f4e9d0, bark-brown #7a4a2b, vivid but " +
  "value-muted dusk saturation (nothing daytime-bright, nothing night-black), selective 1px ink " +
  "outline on the figure only and only on its lit edges, subtle ordered-dither grain only at value " +
  "transitions, faint film grain, calm literary slightly-uncanny mood, single consistent light " +
  "direction, NO text, NO logos, NO UI, NO watermark, NO border.";
// NOT the bible's ISOLATED/chroma-magenta recipe, on purpose. A magenta key would eat this palette:
// heather (#7a55a0) and rose (#b05a86) shirts key fully transparent and rose-pink hair (#d05a7a)
// despills to grey. See pipeline/process-roster-portraits.py. A roster tile is a rectangular
// portrait with a background anyway, so we generate straight onto flat ink and never key.
const ON_INK =
  "The background is one completely flat, plain, uniform dark ink (#1c1326) colour, identical edge " +
  "to edge — no scenery, no horizon, no props, no vignette, no gradient, no lighter patch behind " +
  "the head. The figure's long soft shadow falls across it toward the upper-left, and that cast " +
  "shadow is the ONLY variation the background is allowed.";
// The bible's violet rule, inverted into a hard ban: these are people, not the uncanny. Targeted at
// the ECHO ACCENT specifically, not at "all purple" — a blanket purple ban would contradict the
// per-character palette below (rose-pink hair #d05a7a is a legitimate world colour) and a
// self-contradictory prompt is a coin-flip. What must never appear is the *glow*.
const NO_ECHO =
  "NO echo-violet (#a06cd5), no luminous or glowing purple, no violet rim-light, aura, halo or " +
  "shine anywhere on the figure or the background — this is an ordinary person, not the uncanny.";

/** Human words for the palette hexes in game/art.ts — models read words better than hex codes. */
const SKIN_WORD = {
  "#f1c79b": "fair warm",
  "#e0a87e": "light tan",
  "#c98a5e": "medium bronze",
  "#a9704a": "deep amber-brown",
  "#7c4f33": "rich dark brown",
};
const HAIR_WORD = {
  "#3a2a1a": "dark coffee-brown",
  "#7a4a2b": "bark-brown",
  "#1c1326": "black",
  "#5aa6d0": "faded sea-blue",
  "#d05a7a": "faded rose-pink",
  "#cfcfcf": "silver-grey",
};
const SHIRT_WORD = {
  "#b9543f": "muted brick-red",
  "#41699e": "muted slate-blue",
  "#3f8a64": "muted forest-green",
  "#b89a4a": "muted ochre-gold",
  "#7a55a0": "muted heather",
  "#b05a86": "muted rose",
  "#557089": "muted steel-blue",
};
const HAIRSTYLE_WORD = {
  short: "short cropped",
  long: "long loose shoulder-length",
  buzz: "close-shaved buzzcut",
  bun: "hair tied up in a topknot bun",
};

/**
 * styleFromId, mirrored from apps/web/src/game/art.ts. Mirrored rather than imported because this is
 * a plain .mjs with no bundler and the source is TS. Deliberately NOT a copy of the resulting hexes:
 * a stale hex here would silently generate a portrait that disagrees with the sprite the player
 * actually gets, which is invisible in review. Mirroring the FUNCTION means the only thing that can
 * drift is the palette arrays, and `npm run verify:roster` diffs this against the real game/art.ts.
 */
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
const styleFromId = (id) => ({
  skin: pick(SKINS, hash01(id, 1)),
  hair: pick(HAIRS, hash01(id, 2)),
  shirt: pick(SHIRTS, hash01(id, 3)),
  hairStyle: pick(HAIR_STYLES, hash01(id, 5)),
});

/**
 * The roster ids. Found by searching the premade id space for eight characters that are maximally
 * distinct — a minimum of 3 of the 4 style dims differ between ANY pair — with full coverage of
 * every skin tone (5/5), hair style (4/4), and every permitted shirt (6/6) and hair colour (6/6).
 * KEEP IN SYNC with ROSTER_IDS in apps/web/src/app/_landing/roster.ts (verified by npm run verify:roster).
 *
 * TWO PALETTE VALUES ARE EXCLUDED FROM THE SEARCH, by rule not by taste — both collide with the
 * sacred echo accent, and the landing spends its whole violet budget on the empty centre slot:
 *   - hair  #a06cd5 IS echo-violet. game/art.ts's HAIRS contains it outright (premade_9 draws it).
 *   - shirt #7a55a0 ("heather") sits RGB-distance 13.6 from the echo ramp's dark end #7a4aa8 — the
 *     next-nearest shirt is 61.4 away, 4.5x further. It is the accent wearing a tunic.
 */
const ROSTER_IDS = [
  "premade_0",
  "premade_2",
  "premade_5",
  "premade_7",
  "premade_10",
  "premade_111",
  "premade_121",
  "premade_135",
];
const ROSTER = ROSTER_IDS.map((id) => ({ id, style: styleFromId(id) }));

/** Portrait width in px after downscale — see process-roster-portraits.py for how this was chosen.
 *  72 is ~4.5x the ~16px world sprite ("more detailed than the standard 16-bit world sprite", §1b)
 *  and is the widest size that still reads as a real pixel grid rather than a shrunken painting. */
const SIZE = 72;
const ASPECT = "2:3";

/** Every portrait must be croppable to the same tile, so framing cannot be left to the model — the
 *  first pass drifted from head-and-shoulders to chest-up and the roster read as a ransom note. */
const FRAMING =
  "IDENTICAL FRAMING IN EVERY IMAGE: the figure is centred horizontally, the top of the head sits " +
  "just below the top edge of the frame with a small even gap, the shoulders are cropped by the " +
  "bottom edge, and the head is roughly one third of the frame height. Symmetrical, straight-on, " +
  "eye-level, no tilt, no perspective, no zoom variation.";

function promptFor({ style }) {
  const skin = SKIN_WORD[style.skin] ?? "warm";
  const hair = HAIR_WORD[style.hair] ?? "dark";
  const shirt = SHIRT_WORD[style.shirt] ?? "muted";
  const cut = HAIRSTYLE_WORD[style.hairStyle] ?? "short";
  return (
    `A single islander duskling: ${skin} skin (${style.skin}), ${cut} ${hair} hair (${style.hair}), ` +
    `wearing a simple ${shirt} (${style.shirt}) roughspun tunic with a bark-brown collar. Calm, ` +
    `reserved, quietly watchful expression, looking straight at the viewer, head and shoulders only. ` +
    `A person you might meet on a far shore. ${FRAMING} ${ON_INK} ${STYLE} ${NO_ECHO}`
  );
}

// ── preflight: CLI present + authed, else exit 0 and keep the procedural fallback ──────────────
const has = (bin) => {
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const authed = () => {
  try {
    execSync("higgsfield model list", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const only = process.argv.slice(2);
const jobs = only.length ? ROSTER.filter((r) => only.includes(r.id)) : ROSTER;

if (!has("higgsfield")) {
  console.log("[roster] `higgsfield` CLI not found — keeping procedural avatars. (exit 0)");
  process.exit(0);
}
if (!authed()) {
  console.log("[roster] higgsfield not authed (`higgsfield auth login`) — keeping procedural avatars. (exit 0)");
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
// Written BEFORE generation so process-flow-assets.py can key/downscale whatever lands. Note this
// over-declares if a job fails — same known wart as generate-flow-assets.mjs (see f3/queue_line).
// `key: false` records that these are never chroma-keyed (see process-roster-portraits.py). It is
// also a guard: if anyone ever points process-flow-assets.py at this dir, key:false keeps it from
// punching holes in the palette — it would square-crop instead, which is wrong but recoverable.
writeFileSync(
  resolve(OUT, "_manifest.json"),
  JSON.stringify(jobs.map((j) => ({ name: j.id, key: false, size: SIZE })), null, 2) + "\n",
);

let ok = 0;
for (const job of jobs) {
  process.stdout.write(`[roster] ${job.id} … `);
  try {
    const res = execFileSync(
      "higgsfield",
      [
        "generate", "create", "nano_banana_2", "--json",
        "--prompt", promptFor(job),
        "--aspect_ratio", ASPECT,
        "--resolution", "1k",
        "--wait", "--wait-timeout", "5m",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const url = (res.match(/https:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp)/i) || [])[0];
    if (!url) throw new Error("no result URL in CLI output");
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(resolve(OUT, `${job.id}_raw.png`), buf);
    ok++;
    console.log("ok");
  } catch (err) {
    console.log(`failed (${err.message.split("\n")[0]}) — keeping procedural for this slot`);
  }
}

console.log(`[roster] ${ok}/${jobs.length} generated → ${OUT}`);
if (ok) {
  console.log("[roster] downscaling via process-roster-portraits.py …");
  try {
    execFileSync("python3", [resolve(HERE, "process-roster-portraits.py")], { stdio: "inherit" });
  } catch (err) {
    console.log(`[roster] post-process failed (${err.message.split("\n")[0]}) — raw PNGs left in place.`);
  }
}
