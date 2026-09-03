#!/usr/bin/env node
/**
 * Refuse to start when two env files disagree about the same key.
 *
 * This exists because of a real afternoon. The repo root `.env` carried the real
 * `ML_SERVICE_TOKEN`; `apps/web/.env.local` carried `dev-ml-token-change-me`, which is the ML
 * service's own default. The ML service loads the root file (services/ml/run.sh sources it), Next
 * loads the app-local one and prefers it, so the two processes disagreed by one string. Both
 * reported healthy. `/health` was 200. The world built, the player walked, events were emitted and
 * recorded, and every single forward came back 401, which the bridge turned into a graceful mock.
 * The demo showed "offline" and nothing anywhere said why. It cost an hour to find, and the only
 * reason it was found at all is that someone went looking in the ML service's access log.
 *
 * A mock on a missing key is right; a mock on a WRONG key looks identical and is not. So the fix
 * is at both ends: this check makes the mismatch impossible to start with, and lib/ml.ts turns a
 * 401 into `ml_auth_mismatch` with the two filenames in it, so a drift introduced later still says
 * what it is instead of shrugging.
 *
 * It compares only keys that appear in BOTH files: a key defined in one place is not a conflict,
 * it is just where that key lives. Secrets are never printed, only lengths and whether they match.
 *
 * Run:  node scripts/check-env.mjs [--quiet]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");

/** The pairs that must agree, and who reads each side. */
const PAIRS = [
  {
    a: { file: ".env", readBy: "the ML service (services/ml/run.sh sources it) and the realtime server" },
    b: { file: "apps/web/.env.local", readBy: "Next, which prefers it over any root file" },
  },
];

/** A minimal .env parse: KEY=VALUE lines, `export` allowed, quotes stripped, # comments ignored. */
function parseEnv(path) {
  const out = new Map();
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out.set(m[1], value);
  }
  return out;
}

/** Never print a secret. A name that looks like one is reported by length only. */
const secretish = (key) => /TOKEN|KEY|SECRET|PASSWORD|DSN|URL/i.test(key);
const show = (key, value) => (secretish(key) ? `${value.length} chars` : JSON.stringify(value));

let conflicts = 0;
let compared = 0;

for (const pair of PAIRS) {
  const a = parseEnv(resolve(root, pair.a.file));
  const b = parseEnv(resolve(root, pair.b.file));
  if (a.size === 0 || b.size === 0) continue; // one of them is not present; nothing to compare

  for (const [key, av] of a) {
    if (!b.has(key)) continue;
    compared++;
    const bv = b.get(key);
    if (av === bv) continue;
    conflicts++;
    console.error(
      `\n  ${key} disagrees between two files that are both loaded:\n` +
        `    ${pair.a.file.padEnd(22)} ${show(key, av)}   read by ${pair.a.readBy}\n` +
        `    ${pair.b.file.padEnd(22)} ${show(key, bv)}   read by ${pair.b.readBy}`,
    );
  }
}

if (conflicts > 0) {
  console.error(
    `\n${conflicts} key${conflicts === 1 ? " disagrees" : "s disagree"}. Two processes will each look healthy and refuse each\n` +
      `other's requests. Make them the same value, or delete the one you do not mean to keep.\n`,
  );
  process.exit(1);
}

if (!quiet) console.log(`env: ${compared} shared key${compared === 1 ? "" : "s"} agree across .env and apps/web/.env.local`);
