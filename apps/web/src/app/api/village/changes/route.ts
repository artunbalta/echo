/**
 * A village's changes (DECISIONS C44), for the browser to build the same village the server does.
 *
 * PUBLIC, because the world is: every visitor to a parcel sees who has left it. The rows carry no
 * subject and no text — `lib/villageStore.ts` does not select one — so this says what was decided and
 * never who was talking when it was.
 *
 * `available: false` is the store being unreadable, which the browser treats as "build the seed's
 * village", the same posture the talk route takes.
 *
 * C45 adds the marks acts have left (`effects`): a trampled field, a forced door, a shell that is gone.
 * Shared, like the changes, and as anonymous: no subject is selected.
 *
 * C102: `room` names a village room's copy, which has changes and marks of its own; without one, the
 * open world's.
 */
import { NextResponse } from "next/server";
import { WORLD_EPOCH, worldClock, worldDayIndex } from "@echo/planet";
import { roomOfRequest } from "@echo/shared";

import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;
  const cell = query.get("cell") ?? "";
  if (!CELL.test(cell)) return NextResponse.json({ error: "bad_cell" }, { status: 400 });
  const room = roomOfRequest(cell, query.get("room") ?? undefined);
  if (!room.ok) return NextResponse.json({ error: "bad_room" }, { status: 400 });
  const store = villageStore(room.room);
  const day = worldDayIndex(worldClock(WORLD_EPOCH), Date.now());
  const [changes, effects] = store ? await Promise.all([store.changesFor(cell), store.effectsFor(cell, day)]) : [[], []];
  return NextResponse.json(
    { cell, changes: changes ?? [], effects: effects ?? [], available: changes !== null },
    { headers: { "cache-control": "no-store" } },
  );
}
