#!/usr/bin/env node
/**
 * ECHO legend-book plates (landing §1a). One pixel-art illustration per spread of the legend book,
 * generated via the Higgsfield CLI to docs/world-design/art-bible.md and committed.
 *
 * The plates are ART ONLY. Every legend LINE lives in the DOM (see _landing/legend.ts) and is never
 * baked into an image: the whole pitch has to stay selectable, translatable, crawlable and
 * screen-readable, and the copy has to be editable without regenerating art.
 *
 * Consistency is enforced by the PIPELINE, exactly as for the roster portraits and for the same
 * measured reason: a model re-decides framing, palette and density on every call, so asking it to
 * hold a spec across seven runs does not work. process-legend-plates.py quantizes all seven to ONE
 * shared palette and pins them to one canvas.
 *
 * DELIBERATE DEVIATIONS FROM THE BIBLE, both disclosed:
 *  1. CAMERA. The bible's §4 block is "top-down orthographic" because it describes world assets. A
 *     legend plate is a narrative illustration — a woodcut of a scene. Every other bible rule holds:
 *     one dusk light, ink shadows never pure black, selective 1px outline, value-muted saturation,
 *     dither only at value transitions, calm literary slightly-uncanny mood.
 *  2. NO ECHO-VIOLET, ANYWHERE. The bible reserves #a06cd5 for the mirror/echo theme and would
 *     happily spend it on the horizon island or a tide-pool reflection — several of these beats are
 *     literally those. But the landing spends its ENTIRE violet budget on the book cover and the
 *     empty roster slot, so the plates must carry "something is watching" with light and composition
 *     instead of with the accent. That is a landing rule overriding a world rule, on purpose.
 *
 * Run:  npm run gen:plates            (all seven)
 *       node pipeline/generate-legend-plates.mjs 3 5    (just those beats)
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "apps/web/public/assets/legend");

/** Plate width after downscale. 3:2, so 128x85. NOT 4:3 — nano_banana_pro rejects that aspect
 *  outright (the job comes back status "failed" with no result URL); the repo only ever uses
 *  1:1, 2:3, 3:2, 2:1 and 16:9, and 3:2 is the closest supported landscape. Bigger than a roster portrait because a plate is a
 *  scene, not a face — but still small enough that the pixel grid is the point. */
const SIZE = 128;
const ASPECT = "3:2";
const PALETTE_CAP = 28;

const STYLE =
  "TRUE 16-bit pixel art, in the style of a Super Nintendo RPG cutscene illustration. NOT a smooth " +
  "digital painting with a pixel filter over it: drawn pixel by pixel on a single coarse grid, with " +
  "every element at the SAME coarse density. No anti-aliasing, no soft gradients, no blur, no " +
  "airbrush. Shading in FLAT STEPPED BANDS with hard edges, at most two shadow steps per material. " +
  "A selective 1px dark ink outline on objects and figures only, never on the ground. Very limited " +
  "palette, roughly 24 flat colours.";

const LIGHT =
  "One single light: a low dusk sun just under the western horizon, throwing long soft shadows " +
  "toward the upper-left. Shadows are deep-aubergine ink (#1c1326) at low opacity, never pure " +
  "black. Vivid but value-muted dusk saturation — nothing daytime-bright, nothing night-black. " +
  "Palette drawn from ink #1c1326, parchment #f4e9d0, life-green #74c365, bark-brown #7a4a2b, " +
  "water turquoise grading to ink, dusk-mauve sky.";

const MOOD = "Calm, literary, slightly uncanny. Wide, quiet, unpeopled except where stated.";

// The landing's whole violet budget is spent on the book cover and the empty roster slot, so these
// plates carry "something is watching" with light and composition instead of with the accent —
// even on the beats where the bible would happily allow it (the horizon island, the tide pool).
const NO_ECHO =
  "NO purple, NO violet, NO magenta, no glowing aura, no rim light, no bloom, no lens flare " +
  "anywhere in the image.";

const NEG = "NO text, NO letters, NO logos, NO UI, NO watermark, NO border, NO frame, NO signature.";

/** One plate per legend beat. Ids match BEATS in apps/web/src/app/_landing/legend.ts. */
const PLATES = [
  {
    id: "1_wake",
    body:
      "A single small figure lying alone on a wide empty dusk beach, just beginning to stir. Wet " +
      "sand grading to dry, a thin parchment tide-line of foam, one bleached driftwood log, a few " +
      "shells. The sea is turquoise grading to deep ink. Far out on the horizon, the faint ink-mauve " +
      "silhouette of another island. Enormous emptiness around one small person.",
  },
  {
    id: "2_gather",
    body:
      "A lone figure crouched on a dusk hillside gathering from a berry bush heavy with red fruit. " +
      "Beside it, a tilled patch of soil with one green sprout, and further off a dark cave mouth. " +
      "Three ways to go, no path between them. The figure's long shadow stretches toward the " +
      "upper-left. Nobody else is in the frame, and yet the composition feels observed.",
  },
  {
    id: "3_manner",
    body:
      "A still tide pool ringed with dark rock at dusk, holding a mirror-flat reflection. A lone " +
      "figure stands at its edge, looking down. The reflection is a parchment-pale silhouette, and " +
      "its posture does not quite match the figure's. Wet rock, foam flecks, the sea beyond going " +
      "to ink. Quiet and slightly wrong.",
  },
  {
    id: "4_crossing",
    body:
      "A raft of lashed bark beams crossing turquoise-to-ink dusk water toward a far shore, where a " +
      "single hooded figure stands waiting, small and reserved. One figure on the raft, one figure " +
      "on the shore, a great deal of water between them. The low sun glints in long lines on the " +
      "ripples.",
  },
  {
    id: "5_speaks",
    body:
      "A small warm lantern-lit clearing at dusk: bark-frame market stalls with taut " +
      "parchment-canvas awnings, a hanging lantern pooling warm parchment light into ink shadow, a " +
      "knot of three or four figures mid-conversation. At the edge of the pooled light, one figure " +
      "stands slightly apart, listening. Built warmth against the wild dusk.",
  },
  {
    id: "6_goes",
    body:
      "A wide dusk landscape seen from a high ridge: a lantern-lit settlement far below in the " +
      "valley, a long bark-beam causeway running out across dark water toward more distant lights " +
      "on the horizon. In the foreground, on the ridge, one small figure walks away from the viewer " +
      "toward all of it. Vast, calm, and open.",
  },
  {
    id: "7_networks",
    body:
      "Two figures meeting on a bark-beam pier at dusk, mid-handshake, small in a wide frame. " +
      "Lantern light pools warm on the boards. Behind them a settlement of lit windows, and beyond " +
      "that open water going to ink, with the faintest ink-mauve shapes of further islands on the " +
      "horizon. A door standing open, not a crowd.",
  },
];

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

if (!has("higgsfield")) {
  console.log("[legend] `higgsfield` CLI not found — the book falls back to text-only plates. (exit 0)");
  process.exit(0);
}
if (!authed()) {
  console.log("[legend] higgsfield not authed — the book falls back to text-only plates. (exit 0)");
  process.exit(0);
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const jobs = only.length ? PLATES.filter((p) => only.some((o) => p.id.startsWith(o))) : PLATES;

mkdirSync(OUT, { recursive: true });
writeFileSync(
  resolve(OUT, "_manifest.json"),
  JSON.stringify(jobs.map((j) => ({ name: j.id, size: SIZE, cap: PALETTE_CAP })), null, 2) + "\n",
);

let ok = 0;
for (const job of jobs) {
  process.stdout.write(`[legend] ${job.id.padEnd(12)} … `);
  try {
    const res = execFileSync(
      "higgsfield",
      [
        "generate", "create", "nano_banana_2", "--json",
        "--prompt", `${job.body} ${MOOD} ${LIGHT} ${STYLE} ${NO_ECHO} ${NEG}`,
        "--aspect_ratio", ASPECT,
        "--resolution", "2k",
        "--wait", "--wait-timeout", "8m",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const url = (res.match(/https:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp)/i) || [])[0];
    if (!url) throw new Error("no result URL");
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(resolve(OUT, `${job.id}_raw.png`), buf);
    ok++;
    console.log("ok");
  } catch (err) {
    console.log(`failed (${err.message.split("\n")[0]}) — this spread ships without a plate`);
  }
}

console.log(`\n[legend] ${ok}/${jobs.length} generated. Normalising + shared palette …`);
if (ok) execFileSync("python3", [resolve(HERE, "process-legend-plates.py")], { stdio: "inherit" });
