/**
 * What a stranger carries (DECISIONS C47): read it, put something down, or make something.
 *
 * Things come INTO the pack only through `/api/world/act` (a verb that gives something), so nothing
 * appears in a pack that the world did not hand over. Here a thing can only leave it (put down) or be
 * turned into something else by a recipe the planet package lists — checked against what is actually
 * in the pack, never against what the request says is.
 */
import { NextResponse } from "next/server";
import { RECIPES, make, remove } from "@echo/planet";

import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  const pack = store ? await store.packOf(caller.subject) : {};
  return pack === null ? NextResponse.json({ error: "pack_unavailable" }, { status: 503 }) : NextResponse.json({ pack });
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { op?: unknown; item?: unknown; recipe?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const store = villageStore();
  if (!store) return NextResponse.json({ error: "no_store" }, { status: 503 });
  const pack = await store.packOf(caller.subject);
  if (pack === null) return NextResponse.json({ error: "pack_unavailable" }, { status: 503 });
  let next = null;
  if (body.op === "drop" && typeof body.item === "string") next = remove(pack, body.item);
  else if (body.op === "make" && typeof body.recipe === "string") {
    const recipe = RECIPES.find((r) => r.id === body.recipe);
    if (!recipe) return NextResponse.json({ error: "no_such_recipe" }, { status: 404 });
    next = make(pack, recipe);
  } else return NextResponse.json({ error: "bad_op" }, { status: 400 });
  if (!next) return NextResponse.json({ error: body.op === "drop" ? "not_carried" : "cannot_make", pack }, { status: 409 });
  if (!(await store.setPack(caller.subject, next))) return NextResponse.json({ error: "pack_unavailable" }, { status: 503 });
  return NextResponse.json({ pack: next });
}
