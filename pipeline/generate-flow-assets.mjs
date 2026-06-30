#!/usr/bin/env node
/**
 * ECHO full-flow asset generation (Step 6, Part A). Drives the Higgsfield CLI (`higgsfield generate
 * create nano_banana_2`) to generate the ENTIRE F0–F6 + stand-archetype asset set in ONE pass,
 * strictly to docs/world-design/art-bible.md — every prompt inherits the §4 Style Token Block
 * (single dusk light → long upper-left soft shadows, selective 1px ink outline on objects only,
 * value-muted dusk saturation, dither at value transitions, echo-violet #a06cd5 SACRED + RARE ≤5%).
 * Raw PNGs land in apps/web/public/assets/<flow>/<name>_raw.png; a per-dir _manifest.json is written
 * so pipeline/process-flow-assets.py keys/downscales them. Results are COMMITTED so the world runs
 * key-free; missing art falls back to the procedural generators (game/art.ts, game/props.ts).
 *
 * Graceful: if the `higgsfield` CLI is absent OR the session isn't authed (`higgsfield auth login`),
 * it logs and exits 0, leaving the procedural fallback in place — never breaks the build.
 *
 * Run (after `higgsfield auth login` + optionally `higgsfield workspace set <id>`):
 *   npm run gen:flow-assets               # the whole set
 *   node pipeline/generate-flow-assets.mjs f0 stands   # just some flows
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ASSETS = resolve(ROOT, "apps/web/public/assets");

// ── the §4 Style Token Block — every prompt inherits this (the bible's coherence guarantee) ──
const STYLE =
  "16-bit top-down orthographic pixel art, dusk light from a low western horizon casting long soft " +
  "shadows toward the upper-left, shadows are deep-aubergine ink (#1c1326) at low opacity never pure " +
  "black, cohesive limited palette (ink #1c1326, parchment #f4e9d0, life-green #74c365, bark-brown " +
  "#7a4a2b, water turquoise-to-ink, dusk-mauve sky), vivid but value-muted dusk saturation, selective " +
  "1px ink outline on objects only (no outline on ground), subtle ordered-dither grain only at value " +
  "transitions, faint film grain, calm literary slightly-uncanny mood, single consistent light " +
  "direction, crisp pixels nearest-neighbor, NO text, NO logos, NO UI, NO watermark, NO border.";
const SEAMLESS =
  "Seamless tileable, tiles perfectly when repeated with no visible seam, evenly lit, flat top-down, fills the whole square.";
const ISOLATED =
  "Isolated and centred on a solid flat chroma magenta (#ff00ff) background, no ground, soft contact shadow only.";
// the uncanny accent — appended ONLY to mirror/echo-theme assets (else echo-violet is absent):
const ECHO = "A single sparse echo-violet (#a06cd5) glint where the mirror/echo theme touches, otherwise echo-violet entirely absent.";

/** tile(name, body) → seamless ground tile job; prop(name, body, size) → keyed sprite job. */
const tile = (name, body, size = 64) => ({ name, key: false, size, aspect: "1:1", prompt: `${body} ${SEAMLESS} ${STYLE}` });
const prop = (name, body, size = 40, aspect = "2:3") => ({ name, key: true, size, aspect, prompt: `${body} ${ISOLATED} ${STYLE}` });
const echoProp = (name, body, size = 40, aspect = "2:3") => ({ name, key: true, size, aspect, prompt: `${body} ${ISOLATED} ${STYLE} ${ECHO}` });

// ── the full manifest, flow by flow (per ECHO_level_design_7flows.md manifests + art-bible §5) ──
const FLOWS = {
  // F0 ground tiles share the existing /assets/island artDir the Flow-0 scene already loads.
  island: [
    tile("grass", "Lush dusk-lit top-down grass meadow, life-green with faint blade detail."),
    tile("water", "Dusk shallow sea, turquoise (#3aa0e6) grading to deep ink-blue (#1c3a5e) in gentle depth bands, soft foam flecks."),
    tile("sand", "Beach where wet reflective sand (#9a7e54) grades to warm dry sand (#e8d3a0) with a faint parchment foam tide-line, tiny pebbles and shell flecks."),
    prop("hill", "A small climbable grassy hill seen top-down, a worn bark switchback path winding up it, soft crown highlight.", 44),
    prop("thicket", "A dense dark unkempt bush thicket with tangled twigs, no path, no berries, brooding.", 40),
    prop("driftwood", "A single bleached weathered driftwood log lying on sand, lonely.", 36, "1:1"),
    prop("shell", "A small pale shell / pebble, one of several strewn on a beach.", 14, "1:1"),
    prop("path_marker", "A trodden obvious dirt path with a small guiding cairn-stone, the paved-road affordance.", 30, "1:1"),
    echoProp("tidepool", "A still circular rock-ringed tide pool, the water a perfect dark mirror reflecting a faint parchment figure.", 40, "1:1"),
    echoProp("horizon_island", "A faint distant island silhouette in ink-mauve on the dusk horizon, the seed of somewhere else.", 80, "16:9"),
  ],
  f1: [
    prop("fertile_patch", "A tilled fertile soil patch with a single green sprout, the delayed-payoff plot.", 40, "1:1"),
    prop("berry_bush", "A round leafy bush heavy with bright red berries, the instant-payoff.", 32, "1:1"),
    echoProp("gamble_cave", "A dark cave mouth in a rock face, a far uncertain glimmer deep inside (the risky lure).", 52),
    prop("marker_stone", "A weathered standing marker-stone carved with a faint half-revealed glyph.", 36),
    prop("buried_cache", "A half-buried wooden cache lid in the earth, just unearthed.", 32, "1:1"),
    prop("shy_creature", "A tiny shy woodland creature peeking out, appears only to the still and patient.", 22, "1:1"),
  ],
  f2: [
    prop("raft_causeway", "A raft / stepping-stone causeway of bark beams laid across turquoise-to-ink water, the crossing.", 56, "3:2"),
    tile("ocean", "Open dusk ocean seen top-down, turquoise shallows grading to deep ink, long low-sun glints."),
    prop("solo_figure", "A single hooded duskling traveller standing quietly on a far shore, warm but reserved posture, parchment-and-bark clothing.", 30),
    prop("gift_props", "A small carried gift bundle wrapped in parchment cloth tied with cord.", 20, "1:1"),
  ],
  f3: [
    tile("clearing", "A small warm trodden-earth clearing floor, lantern-lit, dusk."),
    prop("stall_keeper", "A humble market stall with a bark frame and parchment-canvas awning, a kindly keeper who cannot repay you behind it.", 44, "1:1"),
    prop("elder", "A dignified high-status elder figure seated, robes of deeper parchment, an air of quiet authority.", 30),
    prop("queue_line", "A short orderly queue of three waiting figures at a well, a faint cut-path beside it.", 48, "2:1"),
    prop("group_npcs", "A knot of three or four figures conversing in a small circle, mid gesture (a little shared ritual).", 48, "1:1"),
    prop("marginal_npc", "A single figure standing apart from a group, excluded posture, slightly turned away.", 30),
    prop("trader", "A trader at a low bargain table with goods laid out, ready to haggle.", 40, "1:1"),
  ],
  f4: [
    prop("partner_neutral", "A recurring companion figure, neutral friendly posture.", 30),
    prop("partner_ally", "The same companion as a steadfast ally, warm open posture.", 30),
    prop("partner_wronged", "The same companion wronged and wary, turned-away hurt posture.", 30),
    prop("promise_token", "A small carved promise token of bark and parchment.", 18, "1:1"),
    prop("memory_wall", "A low stone memory wall, kept promises etched in parchment-light glyphs, broken ones ink-scratched.", 56, "2:1"),
    prop("bench", "A simple weathered bark bench.", 36, "1:1"),
    prop("shared_fire", "A communal fire ring, warm parchment glow pooling into the ink dusk.", 36, "1:1"),
  ],
  f5: [
    tile("scarcity_overlay", "A desaturated dimmed ground texture, greens drained toward bark-grey, scarcity dressing.", 64),
    prop("found_property", "A clearly valuable dropped item (a coin purse) lying unattended, someone else's.", 18, "1:1"),
    echoProp("unwatched_hush", "A soft circular vignette of warm light narrowing to a lone figure, the rest fading to ink — the unwatched hush.", 64, "1:1"),
  ],
  f6: [
    tile("settlement", "A warm lived-in settlement ground of trodden paths and plaza stone, dusk."),
    prop("home_orderly", "A small tidy orderly home, neat bark walls, everything squared away.", 48, "1:1"),
    prop("home_ornate", "A small ornate decorated home, hung cloth and trinkets, expressive.", 48, "1:1"),
    prop("home_sparse", "A small bare sparse home, minimal, unadorned.", 48, "1:1"),
    prop("gathering", "A gathering scene: figures drawn around a host at a shared table by a fire.", 56, "1:1"),
    echoProp("doppelganger_cameo", "A figure that mirrors the player exactly, its outline glinting echo-violet — the doppelganger.", 30),
  ],
  // ── the 4 stand archetypes (Part B) — each a bark frame + parchment awning + warm lantern glow,
  //    branding is just a cloth/sign skin over this same frame ──
  stands: [
    echoProp("travel_stand", "A small top-down harbour/ferry travel stand: straight bark-beam posts holding a taut parchment-canvas awning, a hanging warm lantern pooling parchment light, a blank departures board, a coil of rope and a mooring post, a little boat at the dock.", 52, "1:1"),
    prop("workplace_stand", "A small top-down workshop/labour stand: a bark workbench under a parchment awning, tools and a half-made craft, an honest place to work for resources.", 52, "1:1"),
    prop("food_stand", "A small top-down food/dining stand: a bark counter under a parchment awning, a warm pot and shared bowls, stools to host a table.", 52, "1:1"),
    prop("market_stand", "A small top-down market/trade stand: a bark stall with parchment-canvas, goods on display, scales for bargaining.", 52, "1:1"),
  ],
};

function has(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: "ignore" }); return true; } catch { return false; }
}
function authed() {
  // a cheap live read; "session expired" / "older auth flow" / no-workspace all surface here.
  try { execFileSync("higgsfield", ["model", "list"], { stdio: "ignore" }); return true; } catch { return false; }
}

const only = process.argv.slice(2);
const flows = only.length ? only : Object.keys(FLOWS);

if (!has("higgsfield")) {
  console.log("[gen:flow] Higgsfield CLI not found — keeping committed/procedural art. (npm i -g, then `higgsfield auth login`.)");
  process.exit(0);
}
if (!authed()) {
  console.log("[gen:flow] Higgsfield CLI not authenticated — run `higgsfield auth login` (browser OAuth), then re-run. Keeping procedural fallback.");
  process.exit(0);
}

for (const flow of flows) {
  const jobs = FLOWS[flow];
  if (!jobs) { console.warn(`[gen:flow] unknown flow "${flow}" — skipping`); continue; }
  const out = resolve(ASSETS, flow);
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "_manifest.json"),
    JSON.stringify(jobs.map(({ name, key, size }) => ({ name, key, size })), null, 2));
  console.log(`[gen:flow] ${flow}: ${jobs.length} assets → ${out}`);
  for (const job of jobs) {
    try {
      const res = execFileSync("higgsfield",
        ["generate", "create", "nano_banana_2", "--json", "--prompt", job.prompt,
         "--aspect_ratio", job.aspect, "--resolution", "1k", "--wait", "--wait-timeout", "5m"],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const url = (res.match(/https:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp)/i) || [])[0];
      if (!url) throw new Error("no result URL");
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      writeFileSync(resolve(out, `${job.name}_raw.png`), buf);
      console.log(`[gen:flow]   ${flow}/${job.name} ✓`);
    } catch (e) {
      console.warn(`[gen:flow]   ${flow}/${job.name} failed (${String(e).split("\n")[0]}) — keeping procedural.`);
    }
  }
}

if (has("python3")) {
  try {
    execFileSync("python3", [resolve(HERE, "process-flow-assets.py"), ...flows], { stdio: "inherit" });
  } catch (e) {
    console.warn(`[gen:flow] post-process failed (${String(e).split("\n")[0]}); *_raw.png left for manual processing.`);
  }
} else {
  console.warn("[gen:flow] python3 not found — skipping chroma-key/downscale; *_raw.png left in place.");
}
console.log("[gen:flow] done.");
