/**
 * Dusk reading endpoint (BUILD-PLAN §0.E, §13.A). Reads the player's real persona posterior
 * from the ML service, then grounds it — with the day's actual choices — into 4–7 honest
 * statements plus Barnum controls. Phase 0 passes `choices` in-memory (no DB yet). Returns
 * { statements, recognition, mocked }.
 */
import { NextResponse } from "next/server";
import { getPersona } from "@/lib/ml";
import { groundPersonaReading, type ChoiceLog } from "@/lib/reading";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { userId?: string; choices?: ChoiceLog[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" && body.userId ? body.userId : null;
  if (!userId) return NextResponse.json({ error: "missing userId" }, { status: 400 });

  const choices = Array.isArray(body.choices)
    ? body.choices.filter((c): c is ChoiceLog => !!c && typeof c.forkKey === "string" && typeof c.option === "string").slice(0, 32)
    : [];

  const persona = await getPersona(userId);
  const reading = await groundPersonaReading(
    { traits: persona.traits ?? [], uncertainty: persona.uncertainty ?? 1, behaviors: persona.behaviors ?? 0, mocked: persona.mocked },
    choices,
  );
  // The reading is mocked if either the ML posterior or the grounding was a fallback.
  return NextResponse.json({ ...reading, mocked: reading.mocked || persona.mocked });
}
