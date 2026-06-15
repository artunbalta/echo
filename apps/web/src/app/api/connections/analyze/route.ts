/**
 * Connection analysis endpoint (§10). Takes the transcripts of the conversations the user
 * actually had → produces a grounded, conversation-specific read per person (real LLM when
 * a key is set, heuristic otherwise) → persists transcript + analysis as labeled training
 * data (best-effort). Returns { analyses }.
 */
import { NextResponse } from "next/server";
import { analyzeConnections, type PersonInput } from "@/lib/connections";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  let body: { userId?: string; sessionId?: string; people?: PersonInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const people = Array.isArray(body.people) ? body.people : [];
  const analyses = await analyzeConnections(people);

  // Persist transcript + grounded analysis as training data (best-effort; never blocks).
  if (SUPABASE_URL && SERVICE_KEY && people.length) {
    const rows = people.map((p) => {
      const a = analyses.find((x) => x.id === p.id);
      return {
        user_id: body.userId ?? null,
        session_id: null, // session UUIDs land when Supabase sessions are wired (P8)
        counterpart_id: p.id,
        counterpart_name: p.name,
        turns: p.turns,
        transcript_json: p.lines,
        reason: a?.reason ?? null,
        recommend: a?.recommend ?? null,
        depth: a?.depth ?? null,
        mocked: a?.mocked ?? false,
      };
    });
    fetch(`${SUPABASE_URL}/rest/v1/connection_analyses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    }).catch(() => {});
  }

  return NextResponse.json({ analyses });
}
