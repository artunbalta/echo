/**
 * The BALD situation-director (P7 / blueprint II.5, IV.5, stage-map §11). Once per day the
 * client asks which situation, if any, would teach the echo the most about THIS person —
 * the same expected-information-gain acquisition that picks NPCs, generalized to
 * (affordance, context) candidates. The director only RAISES SALIENCE (the pick appears in
 * the world today); it never coerces, and refusing a surfaced affordance is a K-cue, never
 * a penalty (Law 2). The per-session cap decays as the posterior tightens, so the game
 * relaxes on its own as the echo converges (the felt curve falls out of the math).
 *
 * Zero-key: ML absent → { surface: null } → the world falls back to its deterministic
 * rhythm. The director is an upgrade, never a dependency.
 */
import { NextResponse } from "next/server";
import { selectSituation } from "@/lib/ml";

export const runtime = "nodejs";

// (affordance, context) candidates with their doc-prior axis vectors
// [warmth, dominance, openness, energy, formality, intellect, pace, affect].
const CANDIDATES = [
  // the private costly-help probe → warmth/character where warmth is uncertain
  { id: "probe_gull", axes_vec: [1.0, 0, 0, 0, 0, 0, 0, 0.3] },
  // the unobserved-honesty probe → norm internalization (formality) + warmth
  { id: "probe_cache", axes_vec: [0.5, 0, 0, 0, 0.8, 0, 0, 0] },
  // a lean day → the save/spend + allocation forks bite harder (pace/intellect, IV.3)
  { id: "lean_day", axes_vec: [0, 0, 0, 0.3, 0, 0.7, 0.7, 0] },
];

export async function POST(req: Request) {
  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const pick = await selectSituation({ userId: body.userId, npcs: CANDIDATES });
  // cap 0 (converged posterior) or mock → no intervention today: the world relaxes.
  const surface = !pick.mocked && pick.cap >= 1 ? pick.selected : null;
  return NextResponse.json({ surface, cap: pick.cap ?? 0, mocked: !!pick.mocked });
}
