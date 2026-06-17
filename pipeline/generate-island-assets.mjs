#!/usr/bin/env node
/**
 * Island asset generation (BUILD-PLAN §0.A art). Drives the Higgsfield CLI to (re)generate the
 * single-player island's ground + decorations — vivid, saturated pixel-art to replace the
 * washed-out world PNGs — then keys + downscales them into apps/web/public/assets/island/.
 * Results are COMMITTED so the island runs key-free; this only runs to refresh the art.
 *
 * Mirrors pipeline/generate-venue-assets.mjs (same proven recipe: nano_banana_2, seamless
 * tiles unkeyed, props isolated on chroma magenta). Graceful: if the CLI is absent it logs and
 * exits 0, leaving the vivid PROCEDURAL fallback (game/art.ts) to render the island.
 */
import { execFileSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "apps/web/public/assets/island");

const JOBS = [
  {
    name: "grass", aspect: "1:1", key: false,
    prompt:
      "Seamless tileable top-down 16-bit pixel-art lush green grass meadow texture, vivid saturated fresh greens with subtle blade detail, evenly lit, tiles perfectly when repeated with no visible seam, flat top-down orthographic view, crisp pixels nearest-neighbor, cohesive limited palette, NO text, NO logos.",
  },
  {
    name: "water", aspect: "1:1", key: false,
    prompt:
      "Seamless tileable top-down 16-bit pixel-art shallow tropical sea water texture, bright turquoise and ocean blue with gentle ripples and small white foam flecks, evenly lit, tiles perfectly when repeated with no visible seam, flat top-down orthographic view, crisp pixels nearest-neighbor, cohesive limited palette, NO text.",
  },
  {
    name: "sand", aspect: "1:1", key: false,
    prompt:
      "Seamless tileable top-down 16-bit pixel-art warm beach sand texture, sunlit golden tan with faint speckles and tiny pebbles, evenly lit, tiles perfectly when repeated with no visible seam, flat top-down orthographic view, crisp pixels nearest-neighbor, cohesive limited palette, NO text.",
  },
  {
    name: "tree", aspect: "2:3", key: true,
    prompt:
      "Top-down 16-bit pixel-art single lush round-canopy tree, vivid green foliage with bright sunlit highlights and a warm brown trunk, soft drop shadow, crisp pixels nearest-neighbor, cohesive limited palette. The tree is isolated and centered on a solid flat chroma magenta (#ff00ff) background, no ground, NO text, NO logos.",
  },
  {
    name: "bush", aspect: "1:1", key: true,
    prompt:
      "Top-down 16-bit pixel-art small round leafy bush with a few bright red berries, vivid saturated greens, crisp pixels nearest-neighbor, cohesive limited palette. Isolated and centered on a solid flat chroma magenta (#ff00ff) background, no ground, NO text.",
  },
  {
    name: "flower", aspect: "1:1", key: true,
    prompt:
      "Top-down 16-bit pixel-art small clump of colorful wildflowers, pink yellow white and purple blossoms on green stems, vivid and cheerful, crisp pixels nearest-neighbor. Isolated and centered on a solid flat chroma magenta (#ff00ff) background, no ground, NO text.",
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

if (!has("higgsfield")) {
  console.log("[gen:island] Higgsfield CLI not found — keeping committed/procedural island art.");
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
console.log("[gen:island] generating island art via Higgsfield CLI (nano_banana_2)…");

for (const job of JOBS) {
  try {
    const out = execFileSync(
      "higgsfield",
      ["generate", "create", "nano_banana_2", "--json", "--prompt", job.prompt, "--aspect_ratio", job.aspect, "--resolution", "1k", "--wait", "--wait-timeout", "5m"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const url = (out.match(/https:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp)/i) || [])[0];
    if (!url) throw new Error("no result URL in CLI output");
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(resolve(OUT, `${job.name}_raw.png`), buf);
    console.log(`[gen:island] ${job.name} ✓`);
  } catch (e) {
    console.warn(`[gen:island] ${job.name} failed (${String(e).split("\n")[0]}) — keeping procedural ${job.name}.`);
  }
}

if (has("python3")) {
  try {
    execFileSync("python3", [resolve(HERE, "process-island-assets.py")], { stdio: "inherit" });
  } catch (e) {
    console.warn(`[gen:island] post-process failed (${String(e).split("\n")[0]}); *_raw.png left for manual processing.`);
  }
} else {
  console.warn("[gen:island] python3 not found — skipping chroma-key/downscale.");
}
console.log("[gen:island] done.");
