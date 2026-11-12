/**
 * The twin audit as an API (DECISIONS C90):
 *
 *   POST /api/v1/audit   { items, truth, earlier, twins: { name: table } }  →  the audit, as JSON
 *   GET  /api/v1/audit   →  what to send
 *
 * Stateless and open: no key, nothing stored, no body logged. A panel comes in, its audit goes out.
 * The work, the request's shape and its limits are in `lib/knowable/api.ts`; the same `audit()` runs
 * in the visitor's browser on `/audit`, where nothing is sent at all.
 *
 * Node, not edge: the audit is a minute of arithmetic at its largest, not a fetch.
 */
import { NextResponse } from "next/server";

import { auditDescription, auditPost } from "@/lib/knowable/api";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };

export async function POST(req: Request) {
  const { status, body } = await auditPost(req);
  return NextResponse.json(body, { status, headers });
}

export function GET() {
  return NextResponse.json(auditDescription(), { headers });
}
