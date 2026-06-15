#!/usr/bin/env node
/**
 * Venue asset generation (§5). Drives the Higgsfield CLI to (re)generate the THY stand,
 * concert stage, portal, and plaza floor, then keys + downscales them into
 * apps/web/public/assets/venue/. The results are COMMITTED, so the demo runs with no keys;
 * this script only needs to run when you want to refresh the art.
 *
 * Graceful by design: if the Higgsfield CLI (or a key) is absent, it logs and exits 0,
 * leaving the committed assets untouched. The provider call is isolated here so Fal or
 * another backend can be swapped in. Prompts are English; nothing with text/logos is baked.
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "apps/web/public/assets/venue");

// width = target pixel width for the committed asset; key = chroma-key the magenta bg.
const JOBS = [
  {
    name: "booth", aspect: "1:1", width: 112, key: true,
    prompt:
      "Top-down 16-bit pixel-art exhibition brand booth / kiosk: a clean modern airline-lounge counter with a blank backdrop banner (NO text, NO logo), a roll-up display, two stools and potted plants, warm inviting palette with subtle red and white trim, crisp pixels nearest-neighbor, cohesive limited palette, evening venue lighting. The entire booth is isolated and centered on a solid flat chroma magenta (#ff00ff) background. NO text, NO logos, NO words.",
  },
  {
    name: "stage", aspect: "16:9", width: 160, key: true,
    prompt:
      "Top-down 16-bit pixel-art concert stage structure: a raised stage deck with tall speakers on both sides, an overhead truss with colored stage lights casting soft light beams downward, a dark blank backdrop (NO text). Warm evening festival palette, crisp pixels nearest-neighbor, cohesive limited palette. The stage is isolated and centered on a solid flat chroma magenta (#ff00ff) background, no crowd, no ground, no text.",
  },
  {
    name: "portal", aspect: "2:3", width: 48, key: true,
    prompt:
      "16-bit pixel-art glowing magical portal archway, tall vertical doorway with a luminous cyan-blue swirling core and stone frame, ethereal dreamlike glow, crisp pixels nearest-neighbor, cohesive limited palette. Isolated and centered on a solid flat chroma magenta (#ff00ff) background, no ground, no text.",
  },
  {
    name: "plaza", aspect: "1:1", width: 64, key: false,
    prompt:
      "Seamless tileable top-down 16-bit pixel-art plaza floor texture: smooth stone tiles with subtle grout lines, muted cool evening palette (dark slate and dusty violet), faint wear and tiny details, evenly lit, tiles perfectly when repeated, flat top-down orthographic view, crisp pixels nearest-neighbor, NO text.",
  },
];

function has(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!has("higgsfield") && !process.env.HIGGSFIELD_API_KEY) {
  console.log("[gen:assets] Higgsfield CLI not found and HIGGSFIELD_API_KEY unset — keeping committed assets. (Mock art mode.)");
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
console.log("[gen:assets] generating venue art via Higgsfield CLI…");

for (const job of JOBS) {
  try {
    const out = execFileSync(
      "higgsfield",
      ["generate", "create", "nano_banana_2", "--json", "--prompt", job.prompt, "--aspect_ratio", job.aspect, "--resolution", "1k", "--wait", "--wait-timeout", "5m"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const url = (out.match(/https:\/\/[^\s"']+\.png/) || [])[0];
    if (!url) throw new Error("no result URL in CLI output");
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(resolve(OUT, `${job.name}_raw.png`), buf);
    console.log(`[gen:assets] ${job.name} ✓`);
  } catch (e) {
    console.warn(`[gen:assets] ${job.name} failed (${String(e).split("\n")[0]}) — keeping committed ${job.name}.png`);
  }
}

// Post-process (chroma-key + crop + downscale). Requires python3 + Pillow; skip gracefully.
if (has("python3")) {
  try {
    execFileSync("python3", [resolve(HERE, "process-venue-assets.py")], { stdio: "inherit" });
  } catch (e) {
    console.warn(`[gen:assets] post-process failed (${String(e).split("\n")[0]}); raw PNGs left in place.`);
  }
} else {
  console.warn("[gen:assets] python3 not found — skipping chroma-key/downscale; *_raw.png left for manual processing.");
}

if (!existsSync(resolve(OUT, "booth.png"))) {
  console.warn("[gen:assets] note: booth.png missing; the scene will fall back to procedural placeholders.");
}
console.log("[gen:assets] done.");
