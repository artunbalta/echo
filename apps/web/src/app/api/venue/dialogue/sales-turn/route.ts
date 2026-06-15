import { NextResponse } from "next/server";
import { humanSalesTurn, startHumanConversation } from "@/lib/venue/dialogue/orchestrate";
import type { SalesState } from "@/lib/venue/types";

export const dynamic = "force-dynamic";

/**
 * Human ↔ salesperson. With no conversationId → start a conversation (opening line).
 * With a conversationId + userText → one salesperson reply, advancing the sales state.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { conversationId?: string; userText?: string; state?: SalesState };
    if (!body.conversationId) {
      const started = await startHumanConversation();
      return NextResponse.json(started);
    }
    const turn = await humanSalesTurn(body.conversationId, body.userText ?? "", body.state ?? "GREET");
    return NextResponse.json(turn);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
