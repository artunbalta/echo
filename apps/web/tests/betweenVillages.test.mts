/**
 * Between villages, through the real talk route (DECISIONS C53): a leaving that goes somewhere, a
 * marriage a stranger carries word for between two villages, and going home — with the model's
 * replies stubbed, and the store in memory, so what is tested is what the route writes where.
 *
 * THE CLOCK IS FIXED to mid-morning on day 4940, as in villagerTalk.test.mts.
 *
 * Run:  node --import tsx --test apps/web/tests/betweenVillages.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { ageYears, couldMarry, mayCourt, moveChanges, present, villageAt, worldClock, WORLD_DAY_S, WORLD_EPOCH, type Person, type SettledParcel } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";
delete process.env.VILLAGER_MODEL;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: TALK } = await import("../src/app/api/village/talk/route");
const { POST: BEGIN } = await import("../src/app/api/village/talk/begin/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { whereNow } = await import("../src/lib/villager");

const SECRET = "between-secret-aaaa";
const SUBJECT = "bb96e0fc-1111-4222-8333-444455556667";
const SENSTRAND = "843f6a1ffffffff";
const KAMGULL = "84aed1dffffffff";
/** Three kilometres from Senstrand: near enough to marry into (Kamgull, 329 km off, is not). */
const DRAG = "843f6e7ffffffff";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const NOW = CLOCK.epochMs + (DAY + 0.42) * WORLD_DAY_S * 1000;
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

let calls: { url: string; body: Record<string, unknown> | null }[] = [];
let replies: string[] = [];
const said = (say: string, change: unknown = null) => JSON.stringify({ say, remember: "A stranger who carries word between villages.", change });
const spend = () => calls.filter((c) => c.url.includes("api.anthropic.com"));
const lateNote = (c: { body: Record<string, unknown> | null }) => (c.body!.messages as Array<{ role: string; content: string }>).at(-1)!.content;

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => NOW;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: Record<string, unknown> | null = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = null;
    }
    calls.push({ url, body });
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    const text = replies.shift() ?? said("Good morning.");
    return new Response(
      JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
});
after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  calls = [];
  replies = [];
  Date.now = () => NOW;
  resetMemoryStore();
});

const village = (cell: string, changes = [] as never[], day = DAY): SettledParcel => {
  const { field, calibration, commons, world } = planet();
  return villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day, changes })!;
};
const HOURS = [0.42, 0.3, 0.5, 0.36, 0.55, 0.62, 0.75, 0.27];
/** An hour of the day they are out of doors, on land — where a stranger can walk up to them — or null. */
const outAt = (v: SettledParcel, p: Person, d = DAY): number | null => {
  for (const h of HOURS) {
    const w = whereNow(v.settlement, v.plan, p, d, h, v.changes);
    if (w && w.visible && w.boat === null) return h;
  }
  return null;
};
const outNow = (v: SettledParcel, p: Person, d = DAY) => outAt(v, p, d) !== null;
const bearer = () => signIdentity(SUBJECT, SECRET, Date.now());
const post = (h: (req: Request) => Promise<Response>, path: string, body: unknown) =>
  h(new Request(`https://echo.test${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bearer()}` }, body: JSON.stringify(body) }));

/** Talk to someone, a second meeting or later (begin twice the first time), with the model saying `reply`. */
async function talkTo(cell: string, v: SettledParcel, p: Person, reply: string, times = 2, d = DAY) {
  const h = outAt(v, p, d)!;
  assert.ok(h !== null, `${p.given} is never out of doors on day ${d}`);
  Date.now = () => CLOCK.epochMs + (d + h) * WORLD_DAY_S * 1000;
  const w = whereNow(v.settlement, v.plan, p, d, h, v.changes)!;
  let conv = "";
  for (let i = 0; i < times; i++) conv = ((await (await post(BEGIN, "/api/village/talk/begin", { cell, person: p.id, at: { x: w.x + 2, y: w.y } })).json()) as { conv: string }).conv;
  // A first meeting must have been remembered to count: the route remembers after each line.
  await villageStore()!.remember(SUBJECT, cell, p.id, { note: "Met before.", meetings: 2, firstDay: DAY - 10, lastDay: d });
  calls = [];
  replies = [reply];
  const res = await post(TALK, "/api/village/talk", { cell, person: p.id, message: "Can I tell you about someone?", history: [], conv });
  return (await res.json()) as { reply?: string; decided?: string; change?: { kind: string; toCell?: string } };
}

test("C53: a leaving goes somewhere — the family arrives in a village round theirs, carried there", async () => {
  const v = village(SENSTRAND);
  const s = v.settlement;
  const me = s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) > 25 && ageYears(p, DAY) < 50 && p.deathDay > DAY + 365 * 5 && outNow(v, p))!;
  const data = await talkTo(SENSTRAND, v, me, said("I'll go. There is nothing for me here now.", { kind: "leave", in_days: 7 }));
  assert.equal(data.change?.kind, "leave", JSON.stringify(data));
  const to = data.change!.toCell!;
  assert.ok(to && to !== SENSTRAND, "the leaving went nowhere");
  assert.match(data.decided ?? "", new RegExp(`for ${village(to).settlement.name}`));
  const there = (await villageStore()!.changesFor(to))!;
  const arrivals = there.filter((c) => c.kind === "arrive");
  assert.ok(arrivals.some((c) => c.person === me.id && c.fromCell === SENSTRAND), "nobody arrived where they went");
  // In the village gone to, a week on, they are there: the same person.
  const after = village(to, there as never[], DAY + 8).settlement;
  const them = after.people.find((p) => p.id === me.id)!;
  assert.ok(them && present(after, them, DAY + 8));
  assert.deepEqual([them.given, them.birthDay, them.deathDay], [me.given, me.birthDay, me.deathDay]);
});

test("C53: a stranger carries word between two villages: they meet when one comes to visit, and then they marry", async () => {
  const sv = village(SENSTRAND);
  const dv = village(DRAG);
  // An unmarried pair who could marry, one in each, both out of doors on the day.
  let pair: [Person, Person] | null = null;
  for (const x of sv.settlement.people) {
    if (!mayCourt(sv.settlement, x, DAY) || !outNow(sv, x)) continue;
    const y = dv.settlement.people.find((z) => mayCourt(dv.settlement, z, DAY) && couldMarry(x, z) && outNow(dv, z));
    if (y) {
      pair = [x, y];
      break;
    }
  }
  assert.ok(pair, "nobody in Senstrand and Dragcrachadit, out on the day, could marry each other");
  const [x, y] = pair;
  const changesOf = async (c: string) => ((await villageStore()!.changesFor(c)) ?? []) as never[];
  await villageStore()!.remember(SUBJECT, DRAG, y.id, { note: "A kind one.", meetings: 1, firstDay: DAY - 3, lastDay: DAY - 1 });

  // 1. X hears of Y, and would like to meet them.
  const first = await talkTo(SENSTRAND, sv, x, said(`Tell ${y.given} I'd like to meet them.`, { kind: "court", about: `${y.given} ${y.family}` }));
  assert.match(lateNote(spend()[0]), new RegExp(`would like to meet ${y.given} ${y.family}`), "meeting was not what was offered first");
  assert.equal(first.change?.kind, "court", JSON.stringify(first));
  assert.match(first.decided ?? "", /would like to meet/);
  assert.ok((await changesOf(DRAG)).some((c: { kind: string; person: string; target?: string }) => c.kind === "court" && c.person === x.id && c.target === y.id), "the word never reached Dragcrachadit");

  // 2. Y would like to meet X too: X comes to visit in two days.
  const second = await talkTo(DRAG, village(DRAG, await changesOf(DRAG)), y, said(`Then let ${x.given} come.`, { kind: "court", about: `${x.given} ${x.family}` }));
  assert.match((spend()[0].body!.system as Array<{ text: string }>)[1].text, new RegExp(`${x.given}.*sent word`), "Y does not know of the word sent");
  assert.match(second.decided ?? "", /visit in two days/, JSON.stringify(second));
  const V = DAY + 2;
  const atDrag = village(DRAG, await changesOf(DRAG), V).settlement;
  assert.ok(present(atDrag, atDrag.people.find((p) => p.id === x.id)!, V), `${x.given} is not in Dragcrachadit on the day of the visit`);
  const atHome = village(SENSTRAND, await changesOf(SENSTRAND), V).settlement;
  assert.ok(!present(atHome, atHome.people.find((p) => p.id === x.id)!, V), `${x.given} is at home on the day of the visit`);

  // 3. After the visit, word to marry: X first.
  const D = DAY + 4;
  const third = await talkTo(SENSTRAND, village(SENSTRAND, await changesOf(SENSTRAND), D), x, said(`I would marry ${y.given}.`, { kind: "court", about: `${y.given} ${y.family}` }), 2, D);
  assert.match(lateNote(spend()[0]), new RegExp(`would marry ${y.given} ${y.family}.*you met`), "after the visit, marriage was not what was offered");
  assert.match(third.decided ?? "", /would marry/, JSON.stringify(third));

  // 4. And Y says yes: X goes to Dragcrachadit, and the wedding is a week on.
  const fourth = await talkTo(DRAG, village(DRAG, await changesOf(DRAG), D), y, said(`Yes. I'll marry ${x.given}.`, { kind: "court", about: `${x.given} ${x.family}` }), 2, D);
  assert.match(fourth.decided ?? "", /married on the green in 7 days/, JSON.stringify(fourth));
  const dChanges = await changesOf(DRAG);
  assert.ok(dChanges.some((c: { kind: string; person: string; target?: string; day: number }) => c.kind === "pair" && c.person === x.id && c.target === y.id && c.day === D + 7));
  assert.ok((await changesOf(SENSTRAND)).some((c: { kind: string; person: string; toCell?: string; day: number }) => c.kind === "leave" && c.person === x.id && c.toCell === DRAG && c.day === D + 5));
  const wed = village(DRAG, dChanges, D + 9).settlement;
  const X = wed.people.find((p) => p.id === x.id)!;
  assert.equal(wed.people[X.partner!]?.id, y.id, "they did not marry");
});

test("C53: someone who came from elsewhere can go home, and the village they came from has them back", async () => {
  // Someone of Senstrand who went to Kamgull a year ago, unmarried.
  const sv = village(SENSTRAND, [], DAY - 365);
  const goer = sv.settlement.people.find((p) => present(sv.settlement, p, DAY - 365) && p.partner === null && ageYears(p, DAY - 365) > 20 && ageYears(p, DAY - 365) < 40 && p.deathDay > DAY + 400)!;
  const move = moveChanges(sv.settlement, goer, DAY - 365, DAY - 366, KAMGULL);
  for (const c of move.here) await villageStore()!.addChange(SENSTRAND, c, SUBJECT);
  for (const c of move.there) await villageStore()!.addChange(KAMGULL, c, SUBJECT);
  const kv = village(KAMGULL, (await villageStore()!.changesFor(KAMGULL)) as never[]);
  const them = kv.settlement.people.find((p) => p.id === goer.id)!;
  assert.ok(present(kv.settlement, them, DAY), "they never got to Kamgull");
  if (them.partner !== null || !outNow(kv, them)) return assert.fail("the one who went is married by now or indoors this morning; pick another fixture");
  const data = await talkTo(KAMGULL, kv, them, said("You're right. It's time I went home.", { kind: "return" }));
  assert.ok(lateNote(spend()[0]).includes("go home to Senstrand"), "going home was not offered");
  assert.equal(data.change?.kind, "leave");
  assert.equal(data.change?.toCell, SENSTRAND);
  const home = (await villageStore()!.changesFor(SENSTRAND))!;
  assert.ok(home.some((c) => c.kind === "arrive" && c.person === goer.id && c.fromCell === KAMGULL));
  const back = village(SENSTRAND, home as never[], DAY + 5).settlement;
  const me = back.people.find((p) => p.id === goer.id)!;
  assert.ok(present(back, me, DAY + 5), "home, and not there");
  assert.equal(me.backDay, DAY + 2);
});

test("C53: nobody is introduced who lives too far to marry into", async () => {
  const sv = village(SENSTRAND);
  const kv = village(KAMGULL);
  const x = sv.settlement.people.find((p) => mayCourt(sv.settlement, p, DAY) && outNow(sv, p))!;
  const y = kv.settlement.people.find((z) => mayCourt(kv.settlement, z, DAY) && couldMarry(x, z))!;
  assert.ok(x && y);
  await villageStore()!.remember(SUBJECT, KAMGULL, y.id, { note: "Met them.", meetings: 1, firstDay: DAY - 3, lastDay: DAY - 1 });
  await talkTo(SENSTRAND, sv, x, said("Hello."));
  assert.ok(!lateNote(spend()[0]).includes(`${y.given} ${y.family}`), "someone 329 km off was offered as a match");
});

test("C53: nobody is introduced whom the stranger has not met, and nothing is offered at a first meeting", async () => {
  const sv = village(SENSTRAND);
  const x = sv.settlement.people.find((p) => mayCourt(sv.settlement, p, DAY) && outNow(sv, p))!;
  // A first meeting: nothing of the kind is offered.
  const h = outAt(sv, x)!;
  Date.now = () => CLOCK.epochMs + (DAY + h) * WORLD_DAY_S * 1000;
  const w = whereNow(sv.settlement, sv.plan, x, DAY, h)!;
  const conv = ((await (await post(BEGIN, "/api/village/talk/begin", { cell: SENSTRAND, person: x.id, at: { x: w.x + 2, y: w.y } })).json()) as { conv: string }).conv;
  replies = [said("Hello.", { kind: "court", about: "Anybody Atall" })];
  const res = (await (await post(TALK, "/api/village/talk", { cell: SENSTRAND, person: x.id, message: "Hello", history: [], conv })).json()) as { change?: unknown };
  assert.equal(res.change, undefined, "a marriage decided at a first meeting");
  assert.ok(!lateNote(spend()[0]).includes('"court"'), "courting offered at a first meeting");
  // A later meeting, and the stranger has met nobody unmarried: no one to name, and a made-up name is refused.
  const later = await talkTo(SENSTRAND, sv, x, said("I would marry them.", { kind: "court", about: "Someone Invented" }));
  assert.equal(later.change, undefined, "a stranger introduced someone they never met");
  assert.ok(((await villageStore()!.changesFor(SENSTRAND)) ?? []).every((c) => c.kind !== "court"));
});
