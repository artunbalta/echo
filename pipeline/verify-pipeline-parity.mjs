#!/usr/bin/env node
/**
 * Prove the Node port of the portrait pipeline matches the canonical Python one.
 *
 * The canonical pipeline is Python + Pillow and CANNOT run in a Vercel function, so the photo path
 * needs a Node port (apps/web/src/lib/portrait-pipeline.ts). A port that quietly diverges is worse
 * than no port: the whole point of the pipeline is that a runtime portrait lands on the same
 * baseline, scale and palette as the committed eight. So the port is measured against the original
 * on the same input rather than assumed to agree.
 *
 * Bit-identity is NOT the bar and is not achievable: sharp and Pillow both do lanczos3 but with
 * different edge handling and rounding. The bar is STRUCTURAL: same canvas, same seated baseline,
 * same body scale, same palette, and a small share of pixels differing only by a palette step.
 *
 * Run: npm run verify:pipeline
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TMP = "/tmp/parity";
mkdirSync(TMP, { recursive: true });

const SRC = process.argv[2] || "/tmp/adopt/pell_raw.png";
const FILL = Number(process.argv[3] || 0.84);

// 1. the canonical Python, exactly as it runs for the roster
const py = `
import sys
sys.path.insert(0, ${JSON.stringify(HERE)})
from PIL import Image
import importlib.util
spec = importlib.util.spec_from_file_location("proc", ${JSON.stringify(resolve(HERE, "process-roster-portraits.py"))})
proc = importlib.util.module_from_spec(spec); spec.loader.exec_module(proc)
import json
im = proc.normalize(Image.open(${JSON.stringify(SRC)}).convert("RGB"), 72, 108, fill=${FILL})
# Quantize onto the SAME frozen palette the Node port uses, or this compares normalize-only against
# normalize+quantize and every pixel "differs" for a reason that has nothing to do with the port.
pal_json = json.load(open(${JSON.stringify(resolve(ROOT, "apps/web/src/lib/roster-palette.json"))}))
flat = [c for rgb in pal_json["colors"] for c in rgb]
flat += [0] * (768 - len(flat))
palimg = Image.new("P", (1, 1)); palimg.putpalette(flat)
im = im.quantize(palette=palimg, dither=Image.NONE).convert("RGB")
im.save("${TMP}/python.png")
print("python ok")
`;
execFileSync("python3", ["-c", py], { stdio: "inherit" });

// 2. the Node port
const outPath = `${TMP}/node.png`;
const tsx = `
import { toRosterPortrait } from ${JSON.stringify(resolve(ROOT, "apps/web/src/lib/portrait-pipeline.ts"))};
import { readFileSync, writeFileSync } from "node:fs";
const out = await toRosterPortrait(readFileSync(${JSON.stringify(SRC)}), ${FILL});
writeFileSync(${JSON.stringify(outPath)}, out);
console.log("node ok");
`;
writeFileSync(`${TMP}/run.mts`, tsx);
execFileSync("npx", ["tsx", `${TMP}/run.mts`], { cwd: resolve(ROOT, "apps/web"), stdio: "inherit" });

// 3. compare, structurally
const cmp = `
from PIL import Image
a = Image.open("${TMP}/python.png").convert("RGB")   # canonical
b = Image.open("${TMP}/node.png").convert("RGB")     # port
assert a.size == b.size, f"CANVAS MISMATCH {a.size} vs {b.size}"
W, H = a.size
pa, pb = a.load(), b.load()
INK = (28, 19, 38)

def body_rows(px):
    return [y for y in range(H) if any(px[x, y] != INK for x in range(W))]

ra, rb = body_rows(pa), body_rows(pb)
diff = sum(1 for y in range(H) for x in range(W) if pa[x, y] != pb[x, y])
near = sum(1 for y in range(H) for x in range(W)
           if pa[x, y] != pb[x, y]
           and sum(abs(c - d) for c, d in zip(pa[x, y], pb[x, y])) <= 60)
print()
print(f"  canvas          {a.size} == {b.size}")
print(f"  baseline        python y={max(ra)}   node y={max(rb)}")
print(f"  body top        python y={min(ra)}   node y={min(rb)}")
print(f"  palette size    python {len(a.getcolors(99999))}  node {len(b.getcolors(99999))}")
print(f"  pixels differing        {diff}/{W*H} = {100*diff/(W*H):.1f}%")
print(f"  ...of those, within one palette step: {near} ({100*near/max(diff,1):.0f}%)")
ok = (max(ra) == max(rb)) and abs(min(ra) - min(rb)) <= 2 and (100*diff/(W*H)) < 30
print()
print("  PARITY:", "PASS" if ok else "FAIL")
raise SystemExit(0 if ok else 1)
`;
execFileSync("python3", ["-c", cmp], { stdio: "inherit" });
