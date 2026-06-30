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
    // CALM ground tiles (Step-6 polish #3): the ground reads by value + texture, NOT by baked light.
    // Art bible §2/§4: ground tiles are "evenly lit, flat top-down", carry NO outline, and the long
    // upper-left dusk shadows belong on raised OBJECTS — never stamped into the ground. So: flat,
    // shadowless, low-contrast, muted dusk palette, so the map is easy on the eyes and land/water
    // read instantly.
    name: "grass", aspect: "1:1", key: false,
    prompt:
      "Seamless tileable top-down 16-bit pixel-art grass ground texture, calm and evenly lit, FLAT even lighting with NO directional shadows and NO diagonal shading or shadow stripes, low-contrast muted dusk greens (#3f8a45 #57b257 #74c365), only a very faint 1px ordered-dither grain, reads instantly as calm grass and easy on the eyes, tiles perfectly when repeated with no visible seam, flat top-down orthographic view, crisp pixels nearest-neighbor, cohesive limited dusk palette, NO outline, NO text, NO logos, NO watermark, NO border.",
  },
  {
    name: "water", aspect: "1:1", key: false,
    prompt:
      "Seamless tileable top-down 16-bit pixel-art calm sea water texture, evenly lit, FLAT even lighting with NO directional shadows, NO sun-glint streaks and NO diagonal shading or shadow stripes, low-contrast muted dusk blues (#2680c6 #1f5a8f #1c3a5e) with only the faintest gentle ripple, reads instantly as calm open water and easy on the eyes, tiles perfectly when repeated with no visible seam, flat top-down orthographic view, crisp pixels nearest-neighbor, cohesive limited dusk palette, NO outline, NO text, NO logos, NO watermark, NO border.",
  },
  {
    name: "sand", aspect: "1:1", key: false,
    prompt:
      "Seamless tileable top-down 16-bit pixel-art calm beach sand texture, evenly lit, FLAT even lighting with NO directional shadows and NO diagonal shading or shadow stripes, low-contrast muted dusk tan (#9a7e54 #c9ad79 #e8d3a0) with only a faint fine speckle, reads instantly as a calm sandy shore and easy on the eyes, tiles perfectly when repeated with no visible seam, flat top-down orthographic view, crisp pixels nearest-neighbor, cohesive limited dusk palette, NO outline, NO text, NO logos, NO watermark, NO border.",
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
// ONLY=grass,water,sand → regenerate just those jobs (e.g. refresh the ground tiles without
// re-rolling the committed props). Empty/unset → all jobs.
const ONLY = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const RUN = ONLY.length ? JOBS.filter((j) => ONLY.includes(j.name)) : JOBS;
console.log(`[gen:island] generating ${RUN.map((j) => j.name).join(", ")} via Higgsfield CLI (nano_banana_2)…`);

for (const job of RUN) {
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
