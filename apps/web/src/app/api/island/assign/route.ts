/**
 * Island assignment (ECHO_level_design_7flows.md §2). POST { userId } → the home island this user
 * owns: the empty slot nearest the most-recently-joined island (or slot 0 for the first islander),
 * stable across returns. Zero-key: backed by the in-memory store; durable when Supabase is set.
 */
import { NextResponse } from "next/server";
import { assignIslandForUser } from "@/lib/island-registry";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" && body.userId ? body.userId : null;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const placement = await assignIslandForUser(userId);
  return NextResponse.json(placement);
}
