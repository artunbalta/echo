import { NextResponse } from "next/server";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { agentTurn } from "@/lib/ml";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { userId, context = "", userMessage = "", bucket = "smalltalk", stakes = "low" } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const caller = subjectOf(req, String(userId));
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  return NextResponse.json(await agentTurn({ userId: caller.subject, context, userMessage, bucket, stakes }));
}
