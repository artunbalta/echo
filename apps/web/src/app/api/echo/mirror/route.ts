/**
 * The mirror (DECISIONS C61): `GET /api/echo/mirror`, how the echo sees the caller and what moved it.
 *
 * Only the caller's own: the subject comes from their signed identity, never from the request. The
 * record is read FIRST and the engine second, so every row read is a move the engine had already
 * made when it answered; a row written in between is left to "not in this record" by `mirrorOf`.
 *
 * Reading the engine (`GET /persona`) is not free: it scores how well the current read reproduces
 * the person's recent acts, which asks the engine's language model. So the mirror is read when it is
 * opened, not polled, and the rate bucket `mirror` keeps it to 30 reads in ten minutes.
 *
 * When the engine cannot be reached the record is still shown, marked as such (`live: false`).
 *
 * It also tells what the director set out for the caller (C63) once each has been answered or has
 * gone, with what it was meant to learn: never while one still stands.
 */
import { NextResponse } from "next/server";
import { PERSONA_AXIS_KEYS } from "@echo/shared";
import { DIRECTOR, SITUATIONS, verbsOf } from "@echo/planet";

import { readLedger } from "@/lib/ledger";
import { mirrorOf, setOutOf, type EchoNow } from "@/lib/mirror";
import { getPersona } from "@/lib/ml";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const vector = (x: unknown): number[] | null =>
  Array.isArray(x) && x.length === PERSONA_AXIS_KEYS.length && x.every((v) => typeof v === "number" && Number.isFinite(v)) ? (x as number[]) : null;

export async function GET(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const rate = await rateLimit(req, { bucket: "mirror", windowMs: 10 * 60 * 1000, max: 30, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const record = await readLedger(caller.subject);
  const snap = (await getPersona(caller.subject)) as Awaited<ReturnType<typeof getPersona>> & {
    reason?: string;
    self_monitoring?: { delta?: unknown } | null;
    measurement?: EchoNow["measurement"];
  };
  const mu = vector(snap.persona?.mu);
  const variance = vector(snap.var);
  const now: EchoNow | null =
    !snap.mocked && mu && variance && Number.isInteger(snap.persona?.version)
      ? { mu, var: variance, version: snap.persona!.version!, watched: vector(snap.self_monitoring?.delta), measurement: snap.measurement ?? null }
      : null;
  const reason = now ? undefined : snap.mocked ? (snap.reason ?? "engine_unreachable") : "engine_unreadable";
  // What the director set out (C63), told now that it has been answered or has gone.
  const stagings = (await villageStore()?.stagingsOf(caller.subject)) ?? [];
  const catalogue = Object.fromEntries(Object.values(SITUATIONS).map((x) => [x.id, { name: x.name, asks: x.asks, verbs: verbsOf(x.kind) }]));
  const setOut = setOutOf(stagings, catalogue, Date.now(), DIRECTOR.lifeMs);
  return NextResponse.json({ ...mirrorOf(now, record.rows, { reason }), setOut, capped: record.capped, source: record.source });
}
