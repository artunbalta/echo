/**
 * NPC registry for the realtime server. Resolution order (§4, §5):
 *   1. Supabase `npcs` table (the persisted spanning set), when configured;
 *   2. db/seed/npcs.generated.json (offline fallback from `npm run seed`);
 *   3. deterministic in-memory generation (so the world is never empty).
 *
 * NPC sprites: each NPC renders a deterministic sprite client-side from its id, so the
 * spanning set has stable, varied appearances with no asset round-trip. A pre-generated
 * sprite_sheet_url from the asset pipeline is used instead when present.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { generateSpanningSet, type NpcSpec, buildNpcSystemPrompt, vectorToAxes } from "@echo/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, "../../../db/seed/npcs.generated.json");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cache: NpcSpec[] | null = null;

function fromFileOrGenerate(): NpcSpec[] {
  if (existsSync(SEED_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(SEED_PATH, "utf8"));
      if (Array.isArray(raw) && raw.length) return raw as NpcSpec[];
    } catch {
      /* fall through */
    }
  }
  return generateSpanningSet(100);
}

/** Synchronous access (used after loadNpcs has populated the cache). */
export function loadNpcs(): NpcSpec[] {
  if (!cache) cache = fromFileOrGenerate();
  return cache;
}

/** Async load that prefers the persisted Supabase spanning set. Call once at room create. */
export async function loadNpcsAsync(): Promise<NpcSpec[]> {
  if (cache) return cache;
  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/npcs?select=*`, {
        headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const rows = (await res.json()) as any[];
        if (Array.isArray(rows) && rows.length) {
          cache = rows.map((r) => {
            const axes =
              r.persona_axes_json ??
              (r.behavior_params?.axes_vec ? vectorToAxes(r.behavior_params.axes_vec) : undefined);
            return {
              id: r.id,
              name: r.name,
              axes,
              systemPrompt: r.system_prompt ?? buildNpcSystemPrompt(r.name, axes, r.venue ?? "the square"),
              spriteUrl: r.sprite_sheet_url ?? "",
              homeX: r.home_x,
              homeY: r.home_y,
              venue: r.venue ?? "the square",
            } as NpcSpec;
          });
          console.log(`[npcs] loaded ${cache.length} NPCs from Supabase`);
          return cache;
        }
      }
    } catch (err) {
      console.warn("[npcs] Supabase load failed, using local:", (err as Error).message);
    }
  }
  cache = fromFileOrGenerate();
  console.log(`[npcs] loaded ${cache.length} NPCs from ${existsSync(SEED_PATH) ? "seed file" : "generation"}`);
  return cache;
}
