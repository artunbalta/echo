import { NextResponse } from "next/server";
import { getPersona } from "@/lib/ml";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const uid = new URL(req.url).searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
  return NextResponse.json(await getPersona(uid));
}
