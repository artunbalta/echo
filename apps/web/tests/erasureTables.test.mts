/**
 * Every table that keeps something under a stranger's `subject` is emptied of them on erasure (§13).
 *
 * Read off the migrations and the delete route's own lists, so a table added later and forgotten
 * there fails here: C57's `player_landings` is the reason it exists, and C44–C55's tables are now
 * held to it too.
 *
 * Run:  node --import tsx --test apps/web/tests/erasureTables.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const migrations = join(here, "../../../db/migrations");
const route = readFileSync(join(here, "../src/app/api/account/delete/route.ts"), "utf8");

test("every table with a subject column is erased or forgets who it was", () => {
  const tables: string[] = [];
  for (const f of readdirSync(migrations).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(migrations, f), "utf8");
    for (const m of sql.matchAll(/create table if not exists (\w+) \(([\s\S]*?)\n\);/g)) {
      if (/^\s*subject text/m.test(m[2]!)) tables.push(m[1]!);
    }
  }
  assert.ok(tables.includes("player_landings") && tables.includes("village_deeds"), `found ${tables.join(", ")}`);
  for (const t of tables) assert.ok(route.includes(`["${t}", "subject"]`), `${t} keeps a stranger's subject and the delete route never touches it`);
});
