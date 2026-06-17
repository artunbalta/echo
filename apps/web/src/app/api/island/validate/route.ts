/**
 * Validation capture (BUILD-PLAN §0.F, §4.1). After the dusk reading the player rates each line
 * "this is me / not me" and gives an overall 1–5. We split the lines into SPECIFIC (axis-bound)
 * vs CONTROL (Barnum) and persist the aggregate — the instrument that produces Phase 0's one
 * number (§5.G). Best-effort Supabase write (mirrors api/connections/analyze); never blocks the
 * client, and works key-free (the client also keeps a localStorage copy). Returns { ok }.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface RatedLine {
  control: boolean;
  isMe?: boolean;
}
interface ValidationRecord {
  uid?: string;
  sessionId?: string;
  overall?: number;
  specific?: RatedLine[];
  controls?: RatedLine[];
  recognition?: number;
  mocked?: boolean;
}

const countMe = (lines: RatedLine[] | undefined) => ({
  total: Array.isArray(lines) ? lines.length : 0,
  me: Array.isArray(lines) ? lines.filter((l) => l.isMe === true).length : 0,
});

export async function POST(req: Request) {
  let body: ValidationRecord;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const overall = Number(body.overall);
  if (!Number.isFinite(overall) || overall < 1 || overall > 5) {
    return NextResponse.json({ error: "overall must be 1..5" }, { status: 400 });
  }
  const spec = countMe(body.specific);
  const ctrl = countMe(body.controls);

  const row = {
    user_id: body.uid ?? null,
    session_id: body.sessionId ?? null,
    overall: Math.round(overall),
    specific_total: spec.total,
    specific_me: spec.me,
    control_total: ctrl.total,
    control_me: ctrl.me,
    recognition: typeof body.recognition === "number" ? body.recognition : null,
    mocked: body.mocked === true,
    raw: { specific: body.specific ?? [], controls: body.controls ?? [] },
  };

  if (SUPABASE_URL && SERVICE_KEY) {
    fetch(`${SUPABASE_URL}/rest/v1/island_validation`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, persisted: Boolean(SUPABASE_URL && SERVICE_KEY) });
}
