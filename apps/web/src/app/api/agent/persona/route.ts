import { NextResponse } from "next/server";
import { getPersona } from "@/lib/ml";
import { subjectOf, subjectRejection } from "@/lib/subject";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const asserted = new URL(req.url).searchParams.get("uid");
  if (!asserted) return NextResponse.json({ error: "uid required" }, { status: 400 });
  // The ?uid= SHAPE is unchanged — chain.test.mts pins it and the harnesses pass it from Python.
  // What changed is that the id is now a claim checked against the signature, not the credential
  // itself. This route used to return any person's posterior to anyone who knew their id, and the
  // id was published fifteen hundred at a time by /api/planet/status (⚑27).
  const verdict = subjectOf(req, asserted);
  if (!verdict.ok) {
    const { body, status } = subjectRejection(verdict);
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(await getPersona(verdict.subject));
}
