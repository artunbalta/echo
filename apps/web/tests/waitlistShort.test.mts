/**
 * A place taken by the short form (DECISIONS C97): a name and an email, no figure, and for someone
 * already on the list the character they have is left as it is.
 *
 * The route is driven as the real handler; the database is its HTTP surface, answered here.
 *
 * Run:  node --import tsx --test apps/web/tests/waitlistShort.test.mts
 */
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST } = await import("../src/app/api/waitlist/route");

type Row = { character_source: string; character_ref: string | null };
type Call = { path: string; method: string; body: Record<string, unknown> | null };

const savedFetch = globalThis.fetch;
let calls: Call[] = [];
/** The list, by email: who is already on it and what they chose. */
let list: Record<string, Row> = {};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
  const raw = init?.body ?? (req && method !== "GET" ? await req.clone().text() : null);
  const body = typeof raw === "string" && raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  calls.push({ path: url.pathname, method, body });
  if (url.pathname === "/rest/v1/rpc/rate_limit_hit") return json(1);
  if (url.pathname === "/rest/v1/waitlist" && method === "GET") {
    const email = (url.searchParams.get("email") ?? "").replace(/^eq\./, "");
    const row = list[email];
    const headers = new Headers(init?.headers ?? req?.headers);
    // A single row is asked for one of two ways, by the client's version: answer either.
    if ((headers.get("accept") ?? "").includes("vnd.pgrst.object")) return row ? json(row) : json({ code: "PGRST116", message: "no rows" }, 406);
    return json(row ? [row] : []);
  }
  if (url.pathname === "/rest/v1/rpc/waitlist_join") {
    const email = String(body?.p_email);
    const already = email in list;
    list[email] = { character_source: String(body?.p_source), character_ref: (body?.p_ref as string | null) ?? null };
    return json({ ok: true, already, full: false, seat: already ? 3 : 7, taken: 7, remaining: 100 });
  }
  return json({ message: "not stubbed" }, 404);
}) as typeof fetch;

after(() => {
  globalThis.fetch = savedFetch;
});
beforeEach(() => {
  calls = [];
  list = {};
});

const post = (body: Record<string, unknown>) =>
  POST(new Request("https://echovirtualworld.com/api/waitlist", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) }));
const joined = () => calls.find((c) => c.path === "/rest/v1/rpc/waitlist_join")?.body ?? null;
const short = (email: string) => ({ name: "Deniz", email, website: "", characterSource: "premade", characterRef: null, keepCharacter: true });

test("the short form takes a place with no figure", async () => {
  const res = await post(short("deniz@example.com"));
  assert.equal(res.status, 200);
  const out = (await res.json()) as { ok: boolean; already: boolean; seat: number };
  assert.deepEqual({ ok: out.ok, already: out.already, seat: out.seat }, { ok: true, already: false, seat: 7 });
  assert.equal(joined()?.p_source, "premade");
  assert.equal(joined()?.p_ref, null);
  assert.equal(joined()?.p_name, "Deniz");
});

test("someone already on the list keeps the figure they chose, and the photo they sent", async () => {
  list["pell@example.com"] = { character_source: "premade", character_ref: "premade_1480" };
  const again = await post(short("Pell@Example.com "));
  assert.equal(((await again.json()) as { already: boolean }).already, true);
  assert.equal(joined()?.p_email, "pell@example.com");
  assert.equal(joined()?.p_source, "premade");
  assert.equal(joined()?.p_ref, "premade_1480");
  assert.deepEqual(list["pell@example.com"], { character_source: "premade", character_ref: "premade_1480" });

  calls = [];
  list["photo@example.com"] = { character_source: "selfie", character_ref: null };
  const photo = await post(short("photo@example.com"));
  // Their drawing was asked for when they sent the photo; this request sends none and starts none.
  assert.equal(joined()?.p_source, "selfie");
  assert.equal(joined()?.p_ref, null);
  assert.equal(calls.some((c) => c.method === "PATCH"), false);
  assert.equal(photo.status, 200);
});

test("the roster's form still changes the figure: it says one, and the list is not asked what was there", async () => {
  list["pell@example.com"] = { character_source: "premade", character_ref: "premade_1480" };
  await post({ name: "Pell", email: "pell@example.com", website: "", characterSource: "premade", characterRef: "premade_0", characterSpriteUrl: "", characterAttributes: null });
  assert.equal(joined()?.p_ref, "premade_0");
  assert.equal(calls.some((c) => c.path === "/rest/v1/waitlist" && c.method === "GET"), false);
});

test("the short form's checks are the route's: a name, an address that looks like one, and a field no person fills", async () => {
  assert.equal((await post({ ...short("deniz@example.com"), name: "  " })).status, 400);
  assert.equal((await post(short("deniz@"))).status, 400);
  assert.equal(calls.length, 0);
  const bot = await post({ ...short("deniz@example.com"), website: "https://spam.example" });
  assert.equal(bot.status, 200);
  assert.equal(calls.length, 0);
});
