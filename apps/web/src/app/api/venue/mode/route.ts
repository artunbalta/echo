import { NextResponse } from "next/server";
import { logModeOnce, modeSummary } from "@/lib/venue/capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  logModeOnce();
  return NextResponse.json(modeSummary());
}
