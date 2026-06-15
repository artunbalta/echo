/**
 * Seed script. Generates the ~100-NPC spanning probe set (§8) and:
 *   1. writes db/seed/npcs.generated.json (the realtime server's offline fallback), and
 *   2. upserts NPCs + the world into Supabase when SUPABASE creds are present.
 *
 * Run: npm run seed   (after `npm run build:shared`)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { generateSpanningSet, axesToVector } from "@echo/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

const npcs = generateSpanningSet(100);

// 1) Offline fallback file.
const outPath = resolve(__dirname, "npcs.generated.json");
writeFileSync(outPath, JSON.stringify(npcs, null, 2));
console.log(`✓ wrote ${npcs.length} NPCs → ${outPath}`);

// 2) Supabase upsert (optional).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("• Supabase not configured — skipping DB upsert (set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(0);
}

const rows = npcs.map((n) => ({
  id: n.id,
  name: n.name,
  persona_axes_json: n.axes,
  system_prompt: n.systemPrompt,
  sprite_sheet_url: n.spriteUrl || null,
  home_x: n.homeX,
  home_y: n.homeY,
  behavior_params: { venue: n.venue, axes_vec: axesToVector(n.axes) },
  venue: n.venue,
}));

const res = await fetch(`${url}/rest/v1/npcs`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    apikey: key,
    authorization: `Bearer ${key}`,
    prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});

if (res.ok) {
  console.log(`✓ upserted ${rows.length} NPCs into Supabase`);
} else {
  console.error(`✗ Supabase upsert failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
