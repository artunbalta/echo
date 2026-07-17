/**
 * Island day-state endpoint (P1 / blueprint VII.4). GET loads (applying wall-clock decay
 * exactly once — crops wilt, structures weather, ties cool while you're away) and returns
 * the honest "what changed while you were gone" lines; POST persists a closed day.
 * Zero-key path: backed by the process-lifetime in-memory store when Supabase is unset.
 */
import { NextResponse } from "next/server";
import { loadIslandState, saveIslandState } from "@/lib/island-state";
import type { IslandDayState } from "@echo/shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const loaded = await loadIslandState(userId);
  return NextResponse.json(loaded);
}

export async function POST(req: Request) {
  let body: { userId?: string; state?: IslandDayState };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { userId, state } = body;
  if (!userId || !state || typeof state !== "object") {
    return NextResponse.json({ error: "userId and state required" }, { status: 400 });
  }
  // Minimal shape guard — the pure core owns semantics; reject obviously foreign payloads.
  if (typeof state.dayCount !== "number" || typeof state.scarcityLevel !== "number") {
    return NextResponse.json({ error: "malformed state" }, { status: 400 });
  }
  const persistence = await saveIslandState(userId, { ...state, updatedAt: Date.now() });
  return NextResponse.json({ ok: true, persistence });
}
