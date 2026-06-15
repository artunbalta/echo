import { NextResponse } from "next/server";
import { agentFeedback } from "@/lib/ml";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  return NextResponse.json(await agentFeedback(body));
}
