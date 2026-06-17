/**
 * Pet dialogue endpoint (BUILD-PLAN §0.B). The single-player island talks to its companion
 * through here — a neutral elicitor (real LLM when a key is set, deterministic mirroring
 * otherwise). No Colyseus, no /npc/turn: Phase 0 is free of netcode (§0.A). Returns { text }.
 */
import { NextResponse } from "next/server";
import { petReply, type PetTurn } from "@/lib/pet";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { history?: PetTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const history = Array.isArray(body.history)
    ? body.history
        .filter((h): h is PetTurn => !!h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
        .slice(-24)
    : [];
  const reply = await petReply(history);
  return NextResponse.json(reply);
}
