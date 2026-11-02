/**
 * One subject per browser, however many callers ask at once (`lib/identity.ts` `ensureIdentity`).
 *
 * THE DEFECT: the parcel page mints from two places at the same moment — the measure chain, with an
 * injected fetch, and the act panel, with the default — and the injected caller skipped the memo, so
 * both POSTed and the route minted two subjects. Whichever landed last owned localStorage; the other
 * caller kept its own; every measurement after was refused with identity_mismatch (C50's browser check).
 *
 * Run:  node --import tsx --test apps/web/tests/identityMint.test.mts
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).window = { location: { search: "" } };
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { signIdentity } = await import("@echo/shared/identity");
const { ensureIdentity, identityToken } = await import("../src/lib/identity");

let minted = 0;
const mint = async () => {
  minted++;
  const userId = `aa96e0fc-1111-4222-8333-${String(minted).padStart(12, "0")}`;
  // A slow server, so two callers overlap.
  await new Promise((r) => setTimeout(r, 20));
  return new Response(JSON.stringify({ userId, token: signIdentity(userId, "mint-secret-aaaa", Date.now()) }), { status: 200, headers: { "content-type": "application/json" } });
};

beforeEach(() => {
  store.clear();
  minted = 0;
  globalThis.fetch = (async () => mint()) as typeof fetch;
});

test("the default caller and an injected one, at once, get one subject — and the stored token covers it", async () => {
  const injected = (async () => mint()) as typeof fetch;
  const [a, b] = await Promise.all([ensureIdentity(), ensureIdentity(injected)]);
  assert.equal(minted, 1, "two subjects were minted for one browser");
  assert.equal(a, b);
  assert.ok(identityToken().length > 0);
  assert.equal(store.get("echo.userId"), a);
});

test("an injected caller first, then the default: still one", async () => {
  const injected = (async () => mint()) as typeof fetch;
  const [a, b, c] = await Promise.all([ensureIdentity(injected), ensureIdentity(), ensureIdentity()]);
  assert.equal(minted, 1);
  assert.deepEqual([b, c], [a, a]);
});

test("an injected caller alone still mints through its own transport — a recorder sees the request", async () => {
  let seen = 0;
  const recorder = (async () => {
    seen++;
    return mint();
  }) as typeof fetch;
  await ensureIdentity(recorder);
  assert.equal(seen, 1, "the injected transport was not the one used");
});
