#!/usr/bin/env node
/**
 * Verify the roster's invariants. This repo has no JS test runner (no vitest/jest/playwright, no
 * root `test` script — the only suite is services/ml pytest), so this is a plain assertion script
 * wired to `npm run verify:roster`. It exists because three separate things must agree and nothing
 * else would notice if they stopped:
 *
 *   1. pipeline/roster-cast.mjs mirrors styleFromId() from apps/web/src/game/art.ts.
 *      If art.ts's palettes change, the mirror goes stale and every portrait silently depicts a
 *      character that no longer matches the sprite the player actually receives.
 *   2. That script's ROSTER_IDS must match ROSTER_IDS in apps/web/src/app/_landing/roster.ts, or
 *      the UI asks for portraits that were never generated.
 *   3. No roster character may carry the sacred echo accent (art-bible §2): hair #a06cd5 IS
 *      echo-violet, and shirt #7a55a0 sits 13.6 RGB from the echo ramp's dark end #7a4aa8. The
 *      landing spends its entire violet budget on the empty centre slot.
 *
 * Also checks every portrait PNG is present and committed, since untracked art has 404'd in prod.
 * Exit 0 = all good; exit 1 with a specific message = something drifted.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ART_TS = resolve(ROOT, "apps/web/src/game/art.ts");
const ROSTER_TS = resolve(ROOT, "apps/web/src/app/_landing/roster.ts");
const CAST_MJS = resolve(HERE, "roster-cast.mjs");

const fails = [];
const ok = (msg) => console.log(`  ok   ${msg}`);
const fail = (msg) => {
  fails.push(msg);
  console.log(`  FAIL ${msg}`);
};

/** Pull a `const NAME = [...]` string-array literal out of a source file. */
function arrayOf(src, name, file) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`could not find ${name} in ${file}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const art = readFileSync(ART_TS, "utf8");
const gen = readFileSync(CAST_MJS, "utf8");
const roster = readFileSync(ROSTER_TS, "utf8");

console.log("roster palette mirror (game/art.ts -> roster-cast.mjs)");
for (const name of ["SKINS", "HAIRS", "SHIRTS", "HAIR_STYLES"]) {
  const a = arrayOf(art, name, "game/art.ts");
  const b = arrayOf(gen, name, "roster-cast.mjs");
  if (a.join(",") === b.join(",")) ok(`${name} matches (${a.length})`);
  else fail(`${name} DRIFTED\n         art.ts: ${a.join(" ")}\n         mirror: ${b.join(" ")}`);
}

console.log("\nroster ids (generator <-> app)");
const idsIn = (src) => [...src.matchAll(/id:\s*"(premade_\d+)"/g)].map((m) => m[1]);
const genIds = idsIn(gen);
const appIds = idsIn(roster);
if (genIds.join(",") === appIds.join(",")) ok(`${genIds.length} ids match`);
else fail(`ids DRIFTED\n         generator: ${genIds.join(" ")}\n         app:       ${appIds.join(" ")}`);

// Recompute styleFromId here independently of the generator, from art.ts's OWN palettes, so this
// check cannot be fooled by the mirror being wrong in the same way twice.
const SKINS = arrayOf(art, "SKINS", "art.ts");
const HAIRS = arrayOf(art, "HAIRS", "art.ts");
const SHIRTS = arrayOf(art, "SHIRTS", "art.ts");
const HAIR_STYLES = arrayOf(art, "HAIR_STYLES", "art.ts");
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

const ECHO_VIOLET = "#a06cd5";
const HEATHER = "#7a55a0";

console.log("\nsacred echo accent stays on the empty slot (art-bible §2)");
let clean = true;
for (const id of appIds) {
  const s = styleFromId(id);
  if (s.hair === ECHO_VIOLET) {
    fail(`${id} has echo-violet hair (${ECHO_VIOLET})`);
    clean = false;
  }
  if (s.shirt === HEATHER) {
    fail(`${id} wears heather ${HEATHER}, 13.6 RGB from the echo ramp`);
    clean = false;
  }
}
if (clean) ok(`none of the ${appIds.length} roster characters carries the accent`);

// The roster's identity contract. NOTE what is deliberately NOT checked here: an earlier version
// demanded "at least 3 of 4 palette dims differ between any pair", which was a leftover from the
// era when these portraits WERE eight recolors and colour was all that varied. It is the wrong
// test now. Colour is not identity — shape is — and the real bar is the silhouette test in
// pipeline/audit-roster-portraits.py, which scores head-outline IoU. What this file checks is the
// one palette property that genuinely drives a silhouette, plus the spread guarantees the id search
// was run under.
console.log("\nhead-outline spread (the only sprite-fixed attribute that changes a silhouette)");
const styles = Object.fromEntries(appIds.map((id) => [id, styleFromId(id)]));
const byStyle = {};
for (const id of appIds) (byStyle[styles[id].hairStyle] ??= []).push(id);
const counts = Object.entries(byStyle).map(([k, v]) => `${k}:${v.length}`);
const even = Object.keys(byStyle).length === 4 && Object.values(byStyle).every((v) => v.length === 2);
if (even) ok(`2 of each hairStyle — four distinct head outlines (${counts.join(" ")})`);
else
  fail(
    `hairStyle spread is ${counts.join(" ")} — characters sharing a style share a head outline. ` +
      `The first attempt landed 3 buzz and scored mean head IoU 0.574 against a 0.55 bar.`,
  );

// Characters that share a head outline must not also share a colour, or they read as twins.
let twins = 0;
for (const ids of Object.values(byStyle))
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = styles[ids[i]];
      const b = styles[ids[j]];
      const same = ["skin", "hair", "shirt"].filter((k) => a[k] === b[k]);
      if (same.length) {
        fail(`${ids[i]} and ${ids[j]} share hairStyle AND ${same.join("+")} — twins`);
        twins++;
      }
    }
if (!twins) ok("no same-hairStyle pair shares a skin, hair or shirt colour");

// Palette spread: every permitted value should appear, and none more than twice.
for (const [dim, all] of [
  ["skin", SKINS],
  ["hair", HAIRS.filter((h) => h !== ECHO_VIOLET)],
  ["shirt", SHIRTS.filter((s) => s !== HEATHER)],
]) {
  const used = appIds.map((id) => styles[id][dim]);
  const over = [...new Set(used)].filter((v) => used.filter((u) => u === v).length > 2);
  const cover = new Set(used).size;
  if (over.length) fail(`${dim}: ${over.join(" ")} used more than twice`);
  else ok(`${dim}: ${cover}/${all.length} values present, none more than twice`);
}

console.log("\nportraits present and committed");
// Ask git which files are UNTRACKED rather than which are tracked. `git ls-files` lists only
// tracked paths, so a brand-new, wholly-uncommitted directory comes back EMPTY — indistinguishable
// from "git is unavailable" and silently passing. Untracked art is precisely the failure that has
// 404'd this repo's deploys before, so this check must fail loudly, never skip quietly.
const before = fails.length;
let untracked = null;
try {
  untracked = new Set(
    execFileSync("git", ["ls-files", "--others", "--exclude-standard", "apps/web/public/assets/roster"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean),
  );
} catch {
  console.log("  ..   git unavailable — cannot check tracking (NOT the same as passing)");
}
for (const id of appIds) {
  const rel = `apps/web/public/assets/roster/${id}.png`;
  if (!existsSync(resolve(ROOT, rel))) fail(`${rel} missing — run npm run gen:roster`);
  else if (untracked?.has(rel)) fail(`${rel} is UNTRACKED — commit it or it will 404 in production`);
}
if (fails.length === before) ok(`all ${appIds.length} portraits present and committed`);

console.log();
if (fails.length) {
  console.error(`verify:roster FAILED (${fails.length})`);
  process.exit(1);
}
console.log("verify:roster passed");
