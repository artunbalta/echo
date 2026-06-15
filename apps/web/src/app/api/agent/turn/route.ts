import { NextResponse } from "next/server";
import { agentTurn } from "@/lib/ml";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { userId, context = "", userMessage = "", bucket = "smalltalk", stakes = "low" } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  return NextResponse.json(await agentTurn({ userId, context, userMessage, bucket, stakes }));
}
