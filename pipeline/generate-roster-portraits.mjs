#!/usr/bin/env node
/**
 * ECHO waitlist roster portraits (landing §1b). Drives the Higgsfield CLI to the contract in
 * docs/world-design/roster-portrait-spec.md. The cast and its silhouette design live in
 * pipeline/roster-cast.mjs; the acceptance bar is pipeline/audit-roster-portraits.py.
 *
 * TWO MODES, and the difference is the whole point:
 *
 *   --test <name> <name>   Generate 2 named characters as INDEPENDENT runs, to prove whether the
 *                          CLI can hold the spec across separate generations.
 *   (default)              Generate all eight as ONE CONTACT SHEET and slice it.
 *
 * The default is the sheet because independent runs demonstrably cannot hold a spec this tight:
 * pixel density, crop baseline and shadow treatment are re-decided by the model on every call, and
 * those are exactly the three things that must be identical across a roster. One image is one grid,
 * one light, one shadow, one crop baseline and one palette BY CONSTRUCTION — consistency stops
 * being something we ask for and becomes something the method guarantees. See the report for the
 * measured evidence from --test that forced this.
 *
 * Graceful, like generate-flow-assets.mjs: absent or unauthed CLI logs and exits 0, leaving the
 * procedural AvatarPreview fallback in place. Results are COMMITTED so the landing runs key-free.
 *
 * Run:  npm run gen:roster                    # the whole sheet
 *       npm run gen:roster -- --test Maren Sorrel
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAST, ROSTER_IDS, styleFromId, SKIN_WORD, HAIR_WORD, SHIRT_WORD } from "./roster-cast.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "apps/web/public/assets/roster");

/** Delivered canvas (spec §1). 72 is ~4.5x the ~16px world sprite. */
const SIZE = 72;
const PALETTE_CAP = 24;

// ── the spec, as a prompt block. Every generation inherits this verbatim. ─────────────────────
const STYLE =
  "TRUE 16-bit pixel art, in the style of a Super Nintendo RPG character portrait. This is NOT a " +
  "smooth digital painting with a pixel filter over it: it is drawn pixel by pixel on a single " +
  "coarse grid. CRITICAL: the face is drawn at exactly the SAME coarse pixel density as the " +
  "clothing and hair — no smooth airbrushed skin, no finely rendered eyes on a blocky body, no " +
  "anti-aliasing, no soft gradients, no blur. Shading is done in FLAT STEPPED BANDS of colour, at " +
  "most two shadow steps per material, with hard edges between them. A selective 1px dark ink " +
  "outline on the figure's lit edges only. Very limited palette, roughly 20 flat colours total.";

// No cast shadow, on evidence (spec §2). The model varied it per generation — hard drop shadow on
// one portrait, soft on another; the hard one read dirty, detached the figure from the tile, and
// polluted the silhouette mask so the IoU check compared shadows instead of people. The light lives
// in the figure's own stepped shading instead. The processor also flattens the background to exact
// ink afterwards, so a shadow that sneaks in anyway is erased rather than shipped.
const LIGHT =
  "One single light source: a low dusk sun just under the horizon, keying the figure from the " +
  "UPPER LEFT, so the figure's right side falls into its own shadow. The figure casts NO shadow " +
  "onto the background. Value-muted dusk saturation: nothing daytime-bright, nothing night-black.";

const FRAME =
  "FRAMING, IDENTICAL FOR EVERY FIGURE: a head-and-shoulders bust, centred horizontally, eyes on a " +
  "line about 35% down from the top, and the shoulders/chest running all the way OFF the BOTTOM " +
  "EDGE of the frame so the bust never floats or ends in mid-air. Eye-level camera, no perspective.";

const BG =
  "The background is one completely flat, uniform, dark ink (#1c1326) colour, identical edge to " +
  "edge — no scenery, no horizon, no props behind the figure, no vignette, no gradient, no glow, " +
  "no shadow cast onto it, nothing behind the figure at all.";

const NO_ECHO =
  "NO echo-violet (#a06cd5), no purple, no violet, no magenta, and no luminous or glowing rim " +
  "light, aura or halo anywhere on the figure or background. These are ordinary people.";

const NEG = "NO text, NO logos, NO UI, NO watermark, NO border, NO frame, NO signature.";

function describe(c) {
  const s = styleFromId(c.id);
  const skin = SKIN_WORD[s.skin] ?? "warm";
  const hair = HAIR_WORD[s.hair] ?? "dark";
  const shirt = SHIRT_WORD[s.shirt] ?? "muted";
  return (
    `${c.name}: an islander with ${skin} skin (${s.skin}) and ${hair} (${s.hair}) hair. ` +
    `Hair: ${c.hairShape}. Build: ${c.build}. Pose: ${c.posture}. ` +
    `Wearing a ${shirt} (${s.shirt}) roughspun tunic with a bark-brown trim; ${c.garment}. ` +
    `Prop: ${c.prop}. Expression: ${c.expression}.`
  );
}

/** One character, one image (used only by --test). */
function promptSingle(c) {
  return `A single ${describe(c)} ${FRAME} ${BG} ${LIGHT} ${STYLE} ${NO_ECHO} ${NEG}`;
}

/** All eight in one image — the production path. */
function promptSheet(cast) {
  const cells = cast
    .map((c, i) => `Cell ${i + 1} (${["top-left", "top row 2nd", "top row 3rd", "top-right", "bottom-left", "bottom row 2nd", "bottom row 3rd", "bottom-right"][i]}): ${describe(c)}`)
    .join(" ");
  return (
    `A character-select roster sheet for a 16-bit RPG: EXACTLY EIGHT different character portraits ` +
    `arranged in a strict, evenly spaced 4-across by 2-down grid, 4 in the top row and 4 in the ` +
    `bottom row. Every cell is the same size and every figure is drawn at exactly the same scale ` +
    `and on the same pixel grid, as if from one sprite sheet. ${cells} ` +
    `THE EIGHT MUST BE INSTANTLY DISTINGUISHABLE AS SILHOUETTES: different head outlines, different ` +
    `builds, different poses, different collars, and their props must break the outline. They are ` +
    `eight different people, not one person recoloured. ${FRAME} Each figure sits in its own cell. ` +
    `${BG} ${LIGHT} ${STYLE} ${NO_ECHO} ${NEG}`
  );
}

// ── preflight ────────────────────────────────────────────────────────────────────────────────
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

function generate(prompt, aspect, outfile) {
  const res = execFileSync(
    "higgsfield",
    [
      "generate", "create", "nano_banana_2", "--json",
      "--prompt", prompt,
      "--aspect_ratio", aspect,
      "--resolution", "2k",
      "--wait", "--wait-timeout", "8m",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const url = (res.match(/https:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp)/i) || [])[0];
  if (!url) throw new Error("no result URL in CLI output");
  return fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => {
      writeFileSync(outfile, Buffer.from(ab));
      return outfile;
    });
}

const argv = process.argv.slice(2);
const testIdx = argv.indexOf("--test");
const isTest = testIdx !== -1;

if (!has("higgsfield")) {
  console.log("[roster] `higgsfield` CLI not found — keeping procedural avatars. (exit 0)");
  process.exit(0);
}
if (!authed()) {
  console.log("[roster] higgsfield not authed (`higgsfield auth login`) — keeping procedural. (exit 0)");
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

if (isTest) {
  // Independent runs, on purpose: this mode exists to MEASURE cross-run consistency, not to ship.
  const names = argv.slice(testIdx + 1).filter((a) => !a.startsWith("-"));
  const picked = CAST.filter((c) => names.includes(c.name));
  if (!picked.length) {
    console.error(`[roster] --test needs cast names. Have: ${CAST.map((c) => c.name).join(", ")}`);
    process.exit(1);
  }
  const dir = resolve(ROOT, "apps/web/public/assets/roster-test");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, "_manifest.json"),
    JSON.stringify(picked.map((c) => ({ name: c.id, cast: c.name, key: false, size: SIZE, cap: PALETTE_CAP, fill: c.fill })), null, 2) + "\n",
  );
  for (const c of picked) {
    process.stdout.write(`[roster:test] ${c.name} (${c.id}) … `);
    try {
      await generate(promptSingle(c), "2:3", resolve(dir, `${c.id}_raw.png`));
      console.log("ok");
    } catch (err) {
      console.log(`failed (${err.message.split("\n")[0]})`);
    }
  }
  console.log(`[roster:test] -> ${dir}`);
  execFileSync("python3", [resolve(HERE, "process-roster-portraits.py"), dir], { stdio: "inherit" });
  console.log("\nNow audit them:  python3 pipeline/audit-roster-portraits.py apps/web/public/assets/roster-test --silhouettes");
  process.exit(0);
}

// ── production: one run per character, made consistent by the PIPELINE ────────────────────────
// The 2-portrait test settled the method. A contact sheet (promptSheet, kept below for reference)
// would guarantee consistency by construction, but it spends the whole 2k budget on eight tiny
// cells and stakes the roster on the model rendering a clean 4x2 grid — which models routinely
// bungle by merging or dropping cells. Independent runs give each character the full canvas, and
// the three things that must match across the set are then GUARANTEED IN POST rather than asked
// for, because the test proved asking does not work:
//   framing  -> normalize()      measures the body and re-anchors it (the model floated both busts
//                                by different amounts even when told not to)
//   colour   -> shared_palette() derives ONE palette across all eight and maps each onto it
//   grid     -> quantize()       forces a real pixel grid onto a smooth generation
// So consistency no longer depends on the model holding a spec across runs. It cannot, and it
// does not have to.
writeFileSync(
  resolve(OUT, "_manifest.json"),
  JSON.stringify(
    CAST.map((c) => ({ name: c.id, cast: c.name, key: false, size: SIZE, cap: PALETTE_CAP, fill: c.fill })),
    null,
    2,
  ) + "\n",
);

let ok = 0;
for (const c of CAST) {
  process.stdout.write(`[roster] ${c.name.padEnd(7)} (${c.id}) … `);
  try {
    await generate(promptSingle(c), "2:3", resolve(OUT, `${c.id}_raw.png`));
    ok++;
    console.log("ok");
  } catch (err) {
    console.log(`failed (${err.message.split("\n")[0]}) — this slot keeps its procedural avatar`);
  }
}

console.log(`\n[roster] ${ok}/${CAST.length} generated. Normalising + shared palette …`);
if (ok) {
  execFileSync("python3", [resolve(HERE, "process-roster-portraits.py"), OUT], { stdio: "inherit" });
  console.log(`\n[roster] now audit:  python3 pipeline/audit-roster-portraits.py --silhouettes`);
}
