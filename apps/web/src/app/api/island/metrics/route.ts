/**
 * Validation metrics (BUILD-PLAN §0.F/§0.G). Aggregates the island_validation rows into the
 * pre-registered go/no-go number: mean overall ≥ 4.0, specific "this is me" ≥ 70%, and specific
 * must beat control (the Barnum guard). Reads from Supabase when configured; returns an empty,
 * honest snapshot otherwise (the dashboard then falls back to this browser's localStorage so
 * local runs still show a number). Real readings only (mocked rows excluded from the verdict).
 */
import { NextResponse } from "next/server";
import { aggregate, type ValidationRow } from "@/lib/island-metrics";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Row = ValidationRow;

export async function GET() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ source: "none", ...aggregate([]) });
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/island_validation?select=overall,specific_total,specific_me,control_total,control_me,mocked`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    const rows = (await res.json()) as Row[];
    return NextResponse.json({ source: "supabase", ...aggregate(Array.isArray(rows) ? rows : []) });
  } catch (err) {
    console.warn("[island/metrics] supabase read failed:", (err as Error).message);
    return NextResponse.json({ source: "error", ...aggregate([]) });
  }
}
