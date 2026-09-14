/**
 * RETIRED — 410 Gone. The intent-research aggregates the dashboard read.
 *
 * The brand-stand demo's ENTRY POINT was retired in `b406d49` ("consolidate to /play canonical
 * entry"), which replaced `app/venue/page.tsx` with a nine-line redirect. THE API ROUTES UNDER IT
 * WERE NOT, so six unauthenticated endpoints stayed reachable with no page in front of them —
 * including two that spend money at Anthropic and one that spends at a TTS provider.
 * `/api/venue/dialogue/simulate` bills ELEVEN Claude calls per request and stringifies an unbounded
 * caller-supplied `profile` into every system prompt (⚑30).
 *
 * WHY 410 AND NOT A GUARD, AND NOT A DELETE. `docs/BUILD-PLAN.md:98` tables this demo as an
 * "Optional funding wedge — Phase 4" and :547-548 calls it "a faster-revenue wedge that can fund"
 * the rest, so it is planned work rather than an orphan — deleting it would throw away something
 * with a phase attached. But it has no entry point today, so gating it would be securing a surface
 * nobody can reach: investment in an inactive subsystem, and money that can still be spent while
 * that investment is decided. 410 says "this existed and is deliberately gone", stops the spend
 * now, and costs one line to reverse. `lib/venue/*`, `game/venue/VenueScene.ts` and the
 * `/dashboard` page are untouched and still compile.
 *
 * TO BRING IT BACK: restore this file's body from git and give the route the same treatment
 * `/api/vision` and `/api/portrait` got — `subjectOf`, an input cap, and the rate limit ⚑30 names.
 * Do not re-expose it without them; that is the state it was found in.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GONE = {
  error: "venue_retired",
  detail:
    "The venue brand-stand demo is retired. Its entry point went in b406d49; these routes followed. " +
    "See docs/known-gaps.md (30) and BUILD-PLAN.md:98 — the implementation is preserved in git.",
};

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}
