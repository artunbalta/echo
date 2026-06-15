/**
 * High-fidelity portrait generation (§6.3). Server-side so provider secret keys
 * (FAL_KEY / HF_*) never reach the browser. Returns a portrait URL in the reference
 * pixel-art style, or a placeholder when no provider is configured. The in-world sprite
 * sheet itself is composed client-side from attributes — this is the onboarding "reveal"
 * portrait and profile image.
 */
import { NextResponse } from "next/server";
import type { CharacterAttributes } from "@echo/shared";
import { generatePortrait } from "@/lib/art";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { attributes?: CharacterAttributes; selfieUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const attributes = body.attributes ?? {};
  const styleReferenceUrl = process.env.ART_STYLE_REFERENCE;

  const result = await generatePortrait({
    attributes,
    selfieUrl: body.selfieUrl,
    styleReferenceUrl,
  });
  return NextResponse.json(result);
}
