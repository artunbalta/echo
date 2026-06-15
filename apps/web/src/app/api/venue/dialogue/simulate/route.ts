import { NextResponse } from "next/server";
import { simulateConversation } from "@/lib/venue/dialogue/orchestrate";
import type { TravelerProfile } from "@/lib/venue/types";

export const dynamic = "force-dynamic";

/** Run a full autonomous visitor↔salesperson conversation and persist its outcome. */
export async function POST(req: Request) {
  try {
    const { profile, dwellSeconds } = (await req.json()) as { profile: TravelerProfile; dwellSeconds?: number };
    if (!profile?.id) return NextResponse.json({ error: "profile required" }, { status: 400 });
    const record = await simulateConversation(profile, Math.round(dwellSeconds ?? 30));
    return NextResponse.json({
      conversationId: record.id,
      messages: record.messages,
      outcome: record.outcome,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
