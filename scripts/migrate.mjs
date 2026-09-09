#!/usr/bin/env node
/**
 * Report and apply the migrations in db/migrations against one DATABASE_URL (SOCIETY-PLAN SOC-2.C).
 *
 * Until this file existed, `db/migrations` was applied BY HAND and nothing recorded what any
 * database had. Commit 2db6375 states it plainly, and used it as a licence to rename two files:
 * "no runner, no schema_migrations table, nothing recorded the old name". That is survivable for
 * ten files and it is not survivable for a generational society, which is many tables over many
 * months and whose first question on any bad morning is "which migrations does production have?"
 *
 * TWO THINGS IT REFUSES TO DO, AND BOTH ARE THE POINT.
 *   A duplicate version number stops it BEFORE it opens a connection. This repo has produced two
 *   collisions — 0006 twice, resolved by 2db6375; 0009 twice, still live between this branch and
 *   `feat/measurement-corpus` — and BOTH were found by a human reading a folder listing.
 *   An applied file that has since been edited stops `--apply`. The checksum is the only thing
 *   that can tell "this ran" apart from "something that used to be this ran".
 *
 * GAPS IN THE NUMBERING ARE LEGAL. 0010 does not exist and never did; see db/migrations/README.md.
 * The runner keys on the version string and never requires contiguity.
 *
 * Run:  npm run db:migrate                      # report only, changes nothing
 *       npm run db:migrate:apply
 *       node scripts/migrate.mjs --baseline 0008   # adopt a database migrated by hand
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const value = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i < 0 ? undefined : argv[i + 1];
};

const DIR = value("dir") ?? join(root, "db", "migrations");
const URL_ = value("url") ?? process.env.DATABASE_URL;
const APPLY = flag("apply");
const BASELINE = value("baseline");

if (!URL_) {
  console.error("No database. Pass --url or set DATABASE_URL.");
  process.exit(2);
}

const FILENAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const onDisk = [];
for (const f of readdirSync(DIR).sort()) {
  if (!f.endsWith(".sql")) continue;
  const m = FILENAME.exec(f);
  if (!m) {
    console.error(`Not a migration filename: ${f} (expected NNNN_lower_snake.sql)`);
    process.exit(2);
  }
  const body = readFileSync(join(DIR, f));
  onDisk.push({
    version: m[1],
    name: m[2],
    file: f,
    sql: body.toString("utf8"),
    checksum: createHash("sha256").update(body).digest("hex"),
  });
}

// BEFORE ANY CONNECTION. A collision is a fact about the folder, and finding it should not require
// a database, credentials, or the nerve to run something against production.
const seen = new Map();
for (const m of onDisk) {
  if (seen.has(m.version)) {
    console.error(`COLLISION: ${m.version} is claimed by ${seen.get(m.version)} and ${m.file}.`);
    process.exit(2);
  }
  seen.set(m.version, m.file);
}

const BOOTSTRAP = `
create table if not exists schema_migrations (
  version      text primary key,
  name         text        not null,
  checksum     text        not null,
  applied_at   timestamptz not null default now(),
  applied_by   text        not null default current_user,
  execution_ms integer,
  baselined    boolean     not null default false
);
alter table schema_migrations enable row level security;
`;

const pool = new pg.Pool({ connectionString: URL_, max: 2 });
let failed = false;
try {
  await pool.query(BOOTSTRAP);
  const { rows } = await pool.query(
    "select version, name, checksum, applied_at, baselined from schema_migrations order by version",
  );
  const applied = new Map(rows.map((r) => [r.version, r]));

  const pending = onDisk.filter((m) => !applied.has(m.version));
  const drifted = onDisk.filter((m) => applied.has(m.version) && applied.get(m.version).checksum !== m.checksum);
  const orphans = rows.filter((r) => !seen.has(r.version));

  console.log(`db/migrations: ${onDisk.length} files, ${applied.size} recorded applied, ${pending.length} pending`);
  for (const m of onDisk) {
    const a = applied.get(m.version);
    const mark = !a ? "PENDING" : a.checksum !== m.checksum ? "DRIFT  " : a.baselined ? "base   " : "applied";
    console.log(`  ${mark}  ${m.file}${a ? `  ${a.applied_at.toISOString().slice(0, 19)}Z` : ""}`);
  }
  for (const r of orphans) console.log(`  ORPHAN   ${r.version}_${r.name}  recorded applied, no file in the tree`);
  for (const m of drifted) console.log(`  !! ${m.file} was edited after it was applied (checksum differs)`);
  if (orphans.length || drifted.length) failed = true;

  if (BASELINE) {
    // Adopting a database that was migrated by hand. It RECORDS without RUNNING, and marks the row
    // so the history never claims more than it knows.
    for (const m of onDisk.filter((m) => m.version <= BASELINE && !applied.has(m.version))) {
      await pool.query(
        "insert into schema_migrations (version, name, checksum, execution_ms, baselined) values ($1,$2,$3,0,true) on conflict (version) do nothing",
        [m.version, m.name, m.checksum],
      );
      console.log(`  baselined ${m.file} (recorded as applied, NOT run)`);
    }
  } else if (APPLY) {
    if (drifted.length) {
      console.error("Refusing to apply: an applied file was edited. Resolve the drift first.");
      process.exit(1);
    }
    for (const m of pending) {
      // ONE DEDICATED CLIENT, and the whole file as ONE string. Never split on ';' — 0007 and 0008
      // carry `as $$ … $$;` function bodies and a splitter cuts them in half. begin/file/insert/
      // commit together is why a failure leaves nothing behind, in the schema or in the ledger.
      const client = await pool.connect();
      const t = Date.now();
      try {
        await client.query("begin");
        await client.query(m.sql);
        await client.query(
          "insert into schema_migrations (version, name, checksum, execution_ms) values ($1,$2,$3,$4)",
          [m.version, m.name, m.checksum, Date.now() - t],
        );
        await client.query("commit");
        console.log(`  applied ${m.file} in ${Date.now() - t} ms`);
      } catch (e) {
        await client.query("rollback").catch(() => {});
        console.error(`  FAILED  ${m.file}: ${e.message}`);
        console.error("  Nothing from this file was applied and nothing was recorded. Later files were not attempted.");
        process.exit(1);
      } finally {
        client.release();
      }
    }
    if (pending.length === 0) console.log("  nothing to apply");
  } else if (pending.length) {
    console.log(`\n${pending.length} pending. Run with --apply to apply them.`);
  }
} finally {
  await pool.end();
}
process.exit(failed ? 1 : 0);
