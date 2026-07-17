#!/usr/bin/env node
/**
 * Freeze the roster's shared palette to a committed file.
 *
 * The eight portraits were quantized onto ONE palette derived across the set; that palette is what
 * makes them read as one roster rather than eight pictures. A runtime-generated portrait has to land
 * on the SAME palette, and it cannot re-derive it: re-deriving would need all eight originals in the
 * request path, and would perturb the approved eight to accommodate a newcomer.
 *
 * So the palette becomes an artifact: read it out once, commit it, and map every future portrait
 * onto it. Deterministic, reviewable, and diffable.
 *
 * Run: npm run gen:palette
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ROSTER = resolve(ROOT, "apps/web/public/assets/roster");
const OUT = resolve(ROOT, "apps/web/src/lib/roster-palette.json");

const py = `
import json
from PIL import Image
D = ${JSON.stringify(ROSTER)}
ids = [j["name"] for j in json.load(open(f"{D}/_manifest.json"))]
ims = [Image.open(f"{D}/{i}.png").convert("RGB") for i in ids]
w = sum(i.width for i in ims); h = max(i.height for i in ims)
strip = Image.new("RGB", (w, h), (28, 19, 38))
x = 0
for i in ims:
    strip.paste(i, (x, 0)); x += i.width
pal = strip.quantize(colors=24, method=Image.MEDIANCUT, dither=Image.NONE)
raw = pal.getpalette()[: 24 * 3]
print(json.dumps({"colors": [raw[i:i+3] for i in range(0, len(raw), 3)], "from": ids}))
`;
const d = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
writeFileSync(OUT, JSON.stringify(d, null, 2) + "\n");
console.log(`[palette] ${d.colors.length} colours frozen from ${d.from.length} portraits -> ${OUT}`);
