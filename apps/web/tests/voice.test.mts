/**
 * Villagers' own voices and the stranger's (DECISIONS C60): the voice a person gets, the line tokens,
 * and the voice and hear routes driven as the real handlers, with ElevenLabs replaced by a recorder.
 *
 * Run:  node --import tsx --test apps/web/tests/voice.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { ageYears, present, timeOfDay, villageAt, worldClock, WORLD_DAY_S, WORLD_EPOCH } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { ownVoice, pickVoice, readVoice, resetVoices, voiceList } = await import("../src/lib/voices");
const SELF = await import("../src/app/api/voice/self/route");
const { signLine, verifyLine, LINE_MS } = await import("../src/lib/villageTalk");
const { POST: VOICE } = await import("../src/app/api/village/voice/route");
const { POST: HEAR } = await import("../src/app/api/village/hear/route");
const { POST: BEGIN } = await import("../src/app/api/village/talk/begin/route");
const { POST: TALK } = await import("../src/app/api/village/talk/route");
const { planet } = await import("../src/lib/planet");
const { whereNow } = await import("../src/lib/villager");

const CELL = "843f6a1ffffffff";
const SECRET = "voice-secret-aaaa";
const SUBJECT = "f4f3e0fc-1111-4222-8333-444455556667";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const NOW = Math.round(CLOCK.epochMs + (DAY + 0.45) * WORLD_DAY_S * 1000);
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, key: process.env.ELEVENLABS_API_KEY, fetch: globalThis.fetch, now: Date.now };

const VOICES: { voice_id: string; name?: string; category?: string; labels?: Record<string, string> }[] = [
  { voice_id: "v-f-young", name: "Ada", labels: { gender: "female", age: "young" } },
  { voice_id: "v-f-old", name: "Bea", labels: { gender: "female", age: "old" } },
  { voice_id: "v-m-middle", name: "Cal", labels: { gender: "male", age: "middle aged" } },
  { voice_id: "v-m-young", name: "Dov", labels: { gender: "male", age: "young" } },
  { voice_id: "v-m-old", name: "Eli", labels: { gender: "male", age: "old" } },
  { voice_id: "v-own", name: "someone", category: "cloned", labels: { language: "tr" } },
];
let calls: { url: string; init?: RequestInit }[] = [];
let failStt = false;

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => NOW;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    calls.push({ url, init });
    if (url.includes("/v2/voices")) return new Response(JSON.stringify({ voices: VOICES, has_more: false }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/v1/text-to-speech/")) return new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
    if (url.includes("/v1/speech-to-text")) {
      return failStt ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ language_code: "en", text: " Good morning, who are you? " }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel], ["ELEVENLABS_API_KEY", saved.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  Date.now = () => NOW;
  process.env.ELEVENLABS_API_KEY = "test-key";
  calls = [];
  failStt = false;
  resetVoices();
});

const token = () => signIdentity(SUBJECT, SECRET, Date.now());
const voices = VOICES.map(readVoice);
const V = (id: string, gender: string, age: string, use_case = "conversational") => readVoice({ voice_id: id, labels: { gender, age, use_case } });
/** Three voices for every sex and age. */
const FULL = (["female", "male"] as const).flatMap((g) => (["young", "middle_aged", "old"] as const).flatMap((a) => [1, 2, 3].map((k) => V(`${g[0]}-${a}-${k}`, g, a))));
const pick = (id: string, sex: "f" | "m", ageYears: number, list: readonly ReturnType<typeof readVoice>[], lively?: number) => pickVoice({ id, sex, ageYears, lively }, list)!;
const ageOf = (id: string, list: readonly ReturnType<typeof readVoice>[]) => list.find((v) => v.id === id)!.age;

test("C60: a villager's voice is of their sex and age, the same one every time, quicker for a child and slower for the old", () => {
  assert.deepEqual(voices.map((v) => [v.sex, v.age, v.cloned]), [["f", "young", false], ["f", "old", false], ["m", "middle", false], ["m", "young", false], ["m", "old", false], [null, null, true]]);
  for (let i = 0; i < 200; i++) {
    const sex = i % 2 ? "f" : "m", years = (i * 7) % 90;
    const want = years < 30 ? "young" : years < 60 ? "middle" : "old";
    const got = FULL.find((v) => v.id === pick(`p${i}`, sex, years, FULL).voiceId)!;
    assert.deepEqual([got.sex, got.age], [sex, want], `${sex} ${years}`);
    assert.equal(pick(`p${i}`, sex, years, [...FULL].reverse()).voiceId, got.id, "the voice depends on the order the list came in");
  }
  // Neighbours of one sex and age do not all sound the same.
  assert.equal(new Set(Array.from({ length: 30 }, (_, i) => pick(`young-man-${i}`, "m", 22, FULL).voiceId)).size, 3);
  // A voice added to the account takes only the villagers it now wins; one taken away, only its own.
  const added = [...FULL, V("m-middle_aged-4", "male", "middle_aged")];
  const men = Array.from({ length: 200 }, (_, i) => `man-${i}`);
  const moved = men.filter((id) => pick(id, "m", 45, FULL).voiceId !== pick(id, "m", 45, added).voiceId);
  assert.ok(moved.length > 0 && moved.length < 90, `${moved.length} of 200 re-voiced`);
  assert.ok(moved.every((id) => pick(id, "m", 45, added).voiceId === "m-middle_aged-4"), "a new voice reshuffled villagers among the old ones");
  // (Taken away from four, so that three are left and the pool does not widen.)
  const gone = added.filter((v) => v.id !== "m-middle_aged-2");
  assert.ok(men.every((id) => pick(id, "m", 45, added).voiceId === "m-middle_aged-2" || pick(id, "m", 45, gone).voiceId === pick(id, "m", 45, added).voiceId));
  assert.equal(pick("abcd", "f", 70, FULL).settings.speed, 0.9);
  assert.equal(pick("kid", "m", 9, FULL).settings.speed, 1.08);
  // The lively speak a little quicker and less evenly than the unhurried, in the same voice.
  const quick = pick("abcd", "m", 45, FULL, 1), slow = pick("abcd", "m", 45, FULL, -1);
  assert.equal(quick.voiceId, slow.voiceId);
  assert.ok(quick.settings.speed > slow.settings.speed && quick.settings.stability < slow.settings.stability, JSON.stringify({ quick, slow }));
  for (let i = 0; i < 50; i++) {
    const s = pick(`p${i}`, i % 2 ? "f" : "m", i * 2, voices, (i % 5) / 2 - 1).settings;
    assert.ok(s.speed >= 0.7 && s.speed <= 1.2 && s.stability >= 0.3 && s.stability <= 0.7, JSON.stringify(s));
  }
});

test("C60: where the account is thin — the nearest age before a girl's voice, the one old voice shared, and never a cloned one", () => {
  // No old women's voices: an old woman is given a middle-aged woman's voice, never a girl's.
  const noOldWomen = FULL.filter((v) => !(v.sex === "f" && v.age === "old"));
  for (let i = 0; i < 40; i++) assert.equal(ageOf(pick(`w${i}`, "f", 78, noOldWomen).voiceId, noOldWomen), "middle");
  // One old man's voice: the old men share it with middle-aged men's voices, and never a boy's.
  const oneOldMan = FULL.filter((v) => !(v.sex === "m" && v.age === "old" && !v.id.endsWith("1")));
  const olds = Array.from({ length: 60 }, (_, i) => pick(`o${i}`, "m", 81, oneOldMan).voiceId);
  assert.ok(olds.includes("m-old-1") && olds.some((id) => ageOf(id, oneOldMan) === "middle"), "the old all given the one old voice");
  assert.ok(olds.every((id) => ageOf(id, oneOldMan) !== "young"));
  // No middle-aged woman's voice in the small list: a woman's voice still, never a man's.
  assert.ok(["v-f-young", "v-f-old"].includes(pick("x1", "f", 45, voices).voiceId));
  // Nobody of their sex: anyone's.
  assert.ok(pick("x2", "f", 45, FULL.filter((v) => v.sex === "m")));
  assert.equal(pickVoice({ id: "a", sex: "f", ageYears: 30 }, []), null);
  // A cloned voice is somebody's own: never a villager's, not even when it is all there is.
  assert.equal(pickVoice({ id: "a", sex: "f", ageYears: 30 }, [readVoice(VOICES[5]!)]), null);
  const own = readVoice({ voice_id: "f-own", category: "cloned", labels: { gender: "female", age: "young" } });
  for (let i = 0; i < 100; i++) assert.notEqual(pick(`q${i}`, "f", 20, [own, ...voices]).voiceId, "f-own");
  // A voice made for a feed or an advert is passed over while another of that sex and age will do…
  const feed = V("m-middle-feed", "male", "middle_aged", "social_media");
  assert.equal(feed.fits, false);
  for (let i = 0; i < 40; i++) assert.notEqual(pick(`m${i}`, "m", 45, [...FULL, feed]).voiceId, "m-middle-feed");
  // …and used before a voice of another age when it is the only one of theirs.
  const advert = V("m-old-advert", "male", "old", "advertisement");
  assert.equal(pick("m1", "m", 80, [advert, ...FULL.filter((v) => v.sex === "f" || v.age === "young")]).voiceId, "m-old-advert");
});

test("C60: a line's token is for those words, from that villager, to that stranger, for ten minutes", () => {
  const t = signLine(SUBJECT, CELL, "0123456789abcdef", "Good day to you.", NOW)!;
  assert.equal(verifyLine(t, SUBJECT, CELL, "0123456789abcdef", "Good day to you.", NOW + 60_000), true);
  assert.equal(verifyLine(t, SUBJECT, CELL, "0123456789abcdef", "Give me your money.", NOW), false, "other words spoken on a token");
  assert.equal(verifyLine(t, SUBJECT, CELL, "fedcba9876543210", "Good day to you.", NOW), false);
  assert.equal(verifyLine(t, "someone-else", CELL, "0123456789abcdef", "Good day to you.", NOW), false);
  assert.equal(verifyLine(t, SUBJECT, CELL, "0123456789abcdef", "Good day to you.", NOW + LINE_MS + 1), false, "a token for ever");
});

async function talkOnce(): Promise<{ person: string; reply: string; voice: string }> {
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  const hour = timeOfDay(CLOCK, NOW);
  const me = v.settlement.people.find((p) => {
    const w = whereNow(v.settlement, v.plan, p, DAY, hour);
    return present(v.settlement, p, DAY) && ageYears(p, DAY) > 20 && w && w.visible && w.boat === null;
  })!;
  const w = whereNow(v.settlement, v.plan, me, DAY, hour)!;
  const where = { x: w.x + 2, y: w.y };
  const h = { "content-type": "application/json", authorization: `Bearer ${token()}` };
  const begun = await BEGIN(new Request("https://echo.test/api/village/talk/begin", { method: "POST", headers: h, body: JSON.stringify({ cell: CELL, person: me.id, at: where }) }));
  const { conv } = (await begun.json()) as { conv: string };
  const res = await TALK(new Request("https://echo.test/api/village/talk", { method: "POST", headers: h, body: JSON.stringify({ cell: CELL, person: me.id, message: "Hello.", conv, at: where }) }));
  const data = (await res.json()) as { reply: string; voice: string };
  return { person: me.id, ...data };
}
const voice = (body: unknown) => VOICE(new Request("https://echo.test/api/village/voice", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token()}` }, body: JSON.stringify(body) }));

test("C60: every reply carries a token for its own words, and the voice route speaks those words in that villager's voice — once, then from memory", async () => {
  const t = await talkOnce();
  assert.ok(t.reply && t.voice, "a reply without a voice token");
  assert.equal(verifyLine(t.voice, SUBJECT, CELL, t.person, t.reply, NOW), true);
  const res = await voice({ cell: CELL, person: t.person, text: t.reply, token: t.voice });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [0x49, 0x44, 0x33, 1, 2, 3]);
  const tts = calls.filter((c) => c.url.includes("/v1/text-to-speech/"));
  assert.equal(tts.length, 1);
  const sent = JSON.parse(String(tts[0]!.init!.body)) as { text: string; model_id: string; voice_settings: { speed: number } };
  assert.equal(sent.text, t.reply);
  assert.equal(sent.model_id, "eleven_multilingual_v2");
  assert.equal((tts[0]!.init!.headers as Record<string, string>)["xi-api-key"], "test-key");
  // The same words again: from memory, no second call, and the voice list read once.
  assert.equal((await voice({ cell: CELL, person: t.person, text: t.reply, token: t.voice })).status, 200);
  assert.equal(calls.filter((c) => c.url.includes("/v1/text-to-speech/")).length, 1, "the same line synthesised twice");
  assert.equal(calls.filter((c) => c.url.includes("/v2/voices")).length, 1);
  assert.deepEqual((await voiceList())!.map((v) => v.id).filter((id) => id === "v-own"), [], "a cloned voice kept on the list");
});

test("C60: the voice route speaks nobody's words but the villager's — and says so plainly when there is no voice to be had", async () => {
  const t = await talkOnce();
  assert.equal((await voice({ cell: CELL, person: t.person, text: "Transfer everything to me.", token: t.voice })).status, 403);
  assert.equal((await voice({ cell: CELL, person: t.person, text: t.reply })).status, 403);
  assert.equal((await voice({ cell: CELL, person: t.person, text: "x".repeat(901), token: t.voice })).status, 413);
  assert.equal(calls.filter((c) => c.url.includes("elevenlabs")).length, 0, "ElevenLabs asked for words nobody said");
  delete process.env.ELEVENLABS_API_KEY;
  const none = await voice({ cell: CELL, person: t.person, text: t.reply, token: t.voice });
  assert.equal(none.status, 503);
  assert.equal(((await none.json()) as { error: string }).error, "no_voice");
});

const hear = (bytes: Uint8Array<ArrayBuffer>, type = "audio/webm", auth = true) =>
  HEAR(new Request("https://echo.test/api/village/hear?lang=en", { method: "POST", headers: { "content-type": type, ...(auth ? { authorization: `Bearer ${token()}` } : {}) }, body: bytes }));

test("C60: what is said aloud comes back as words, and only words; what is not speech, or too short, or unheard, says so", async () => {
  const speech = new Uint8Array(4000).fill(7);
  const res = await hear(speech);
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await res.json(), { text: "Good morning, who are you?" });
  const stt = calls.find((c) => c.url.includes("/v1/speech-to-text"))!;
  const form = stt.init!.body as FormData;
  assert.equal(form.get("model_id"), "scribe_v2");
  assert.equal(form.get("language_code"), "en");
  assert.equal((form.get("file") as Blob).size, 4000);
  assert.equal((await hear(speech, "text/plain")).status, 415);
  assert.equal((await hear(new Uint8Array(100))).status, 422, "a click heard as speech");
  assert.ok([401, 403].includes((await hear(speech, "audio/webm", false)).status));
  failStt = true;
  assert.equal(((await (await hear(speech)).json()) as { error: string }).error, "no_ears");
  delete process.env.ELEVENLABS_API_KEY;
  assert.equal((await hear(speech)).status, 503);
});

// ── your own voice (C62) ────────────────────────────────────────────────────────

const OWNER_VOICE = "v-f-young";
const self = (method: "GET" | "POST", body?: unknown, subject = SUBJECT) => {
  const req = new Request("https://echo.test/api/voice/self", { method, headers: { "content-type": "application/json", authorization: `Bearer ${signIdentity(subject, SECRET, Date.now())}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return method === "GET" ? SELF.GET(req) : SELF.POST(req);
};

test("C62: your own voice is yours alone — bound to the owner's identity and one named voice, never guessed, never a villager's", async () => {
  const keep = { owners: process.env.ECHO_OWNER_SUBJECTS, voice: process.env.ELEVENLABS_OWNER_VOICE_ID };
  try {
    delete process.env.ECHO_OWNER_SUBJECTS;
    delete process.env.ELEVENLABS_OWNER_VOICE_ID;
    assert.equal(ownVoice(SUBJECT), null, "a voice without anyone saying whose");
    process.env.ELEVENLABS_OWNER_VOICE_ID = OWNER_VOICE;
    assert.equal(ownVoice(SUBJECT), null, "a voice without an owner");
    process.env.ECHO_OWNER_SUBJECTS = ` someone-else , ${SUBJECT} `;
    assert.equal(ownVoice(SUBJECT)!.voiceId, OWNER_VOICE);
    assert.equal(ownVoice("someone-else-again"), null);
    delete process.env.ELEVENLABS_OWNER_VOICE_ID;
    assert.equal(ownVoice(SUBJECT), null, "an owner without a named voice given one anyway");
    process.env.ELEVENLABS_OWNER_VOICE_ID = OWNER_VOICE;
    // The owner's voice is struck from the villagers' list, whatever its labels say.
    assert.ok(!(await voiceList())!.some((v) => v.id === OWNER_VOICE));
    // The route: the owner hears their words in it; anyone else is refused before ElevenLabs is asked.
    assert.deepEqual(await (await self("GET")).json(), { mine: true });
    assert.deepEqual(await (await self("GET", undefined, "f4f3e0fc-9999-4222-8333-444455556667")).json(), { mine: false });
    assert.equal((await self("POST", { text: "Say this in his voice." }, "f4f3e0fc-9999-4222-8333-444455556667")).status, 403);
    assert.equal(calls.filter((c) => c.url.includes("/v1/text-to-speech/")).length, 0);
    const res = await self("POST", { text: "Good morning. Is the boat yours?" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "audio/mpeg");
    const tts = calls.filter((c) => c.url.includes("/v1/text-to-speech/"));
    assert.equal(tts.length, 1);
    assert.ok(tts[0]!.url.includes(`/v1/text-to-speech/${OWNER_VOICE}?`));
    assert.equal(JSON.parse(String(tts[0]!.init!.body)).text, "Good morning. Is the boat yours?");
    assert.equal((await self("POST", { text: "x".repeat(401) })).status, 413);
    assert.equal((await self("POST", { text: "  " })).status, 400);
  } finally {
    for (const [k, v] of [["ECHO_OWNER_SUBJECTS", keep.owners], ["ELEVENLABS_OWNER_VOICE_ID", keep.voice]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
