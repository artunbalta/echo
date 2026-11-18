/**
 * The brief an echo keeps its person's body by in a village room (DECISIONS C104), made from what the
 * server keeps of the person's record (C103).
 *
 * For every moment that can be met: the echo's call, made the way the envelopes' calls are (`calls.ts`)
 * from the kept record, and where the echo stands in that moment's family (`standing.ts`). A moment in no
 * family is one it may never act at. The call is made without the village's count (`crowd.ts`), which
 * the server does not read here: where the echo may act its record is long, and its own looks carry it.
 *
 * Signed (`@echo/shared/standin`) so the room reads it as it was written here. Server-only: it signs.
 */
import "server-only";

import { MOMENT_KINDS, MOMENTS } from "@echo/planet";
import { STAND_IN, type StandInBrief } from "@echo/shared";
import { signBrief } from "@echo/shared/standin";

import type { KeptLook } from "@/lib/villageStore";

import { callFor, familyOf, known, type Look } from "./calls";
import type { Standing } from "./standing";

/** The calls a brief carries, before it is signed. */
export function briefCalls(looks: readonly KeptLook[], standing: readonly Standing[]): StandInBrief["calls"] {
  const history: Look[] = looks.filter((l) => known(l.kind)).map((l) => ({ kind: l.kind as Look["kind"], outcome: l.did }));
  const level = new Map(standing.map((s) => [s.bucket, s.level]));
  const calls: StandInBrief["calls"] = {};
  for (const kind of MOMENT_KINDS) {
    if (MOMENTS[kind].followUp) continue;
    const c = callFor(history, kind);
    const family = familyOf(kind);
    calls[kind] = { call: c.outcome, p: Math.round(c.p * 1000) / 1000, may: family ? (level.get(family) ?? "watch") : "watch" };
  }
  return calls;
}

/**
 * The brief for `subject`, signed with `secret`, good for {@link STAND_IN.briefMs} from `now`. It carries where
 * the echo stands in talking (C109), which the room answers by; `/api/echo/speak` checks it again.
 */
export function briefFor(subject: string, looks: readonly KeptLook[], standing: readonly Standing[], now: number, secret: string): string {
  const talk = standing.find((s) => s.bucket === "talk")?.level ?? "watch";
  return signBrief({ sub: subject, exp: now + STAND_IN.briefMs, calls: briefCalls(looks, standing), talk }, secret);
}
