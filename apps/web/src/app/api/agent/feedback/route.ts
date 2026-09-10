import { NextResponse } from "next/server";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { agentFeedback } from "@/lib/ml";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const caller = subjectOf(req, String(body.userId));
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  // The whole body goes downstream, so the SUBJECT is overwritten rather than merely checked: a
  // later field added to this route cannot smuggle a foreign id past a check that ran on a copy.
  return NextResponse.json(await agentFeedback({ ...body, userId: caller.subject }));
}
