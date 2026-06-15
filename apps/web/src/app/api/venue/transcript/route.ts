import { NextResponse } from "next/server";
import { getStore } from "@/lib/venue/store";

export const dynamic = "force-dynamic";

/** Full transcript for a conversation (dashboard drill-down). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const c = getStore().getConversation(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id: c.id, isHuman: c.isHuman, messages: c.messages, outcome: c.outcome });
}
