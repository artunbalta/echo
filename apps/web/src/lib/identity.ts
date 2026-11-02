/**
 * The ONE canonical user id — used identically for every WRITE (the /observe/behavioral events,
 * the realtime actor_id) and every READ (/persona, the in-game "your echo" panel), so the panel
 * always reflects the real echo-ml posterior for the same user the events were written under.
 *
 * ONE form, NO prefix scheme:
 *   • a signed-in user  → their bare Supabase `users` id (e.g. ff96e0fc-…), set by AuthModal.
 *   • a ?u=<id> override → used verbatim (the zero-key two-tab test path; NOT persisted).
 *   • an anonymous visit → a persisted UUID (crypto.randomUUID), generated once.
 *
 * We deliberately DON'T prepend "u_": the bare form matches the auth / public.users id that the
 * live posterior already accumulates under, so a read can never miss the writer's row (the earlier
 * "wrote ff96e0fc-…, read u_ff96e0fc-…" split). Keep this the single source of the id everywhere.
 */
// The token FORMAT, from the barrel rather than the `@echo/shared/identity` subpath: this file is
// pulled into client components, and the subpath imports `node:crypto`. `tokenMatchesSubject`
// verifies nothing — it answers whether two keys in THIS localStorage still describe one person.
import { tokenMatchesSubject } from "@echo/shared";

/**
 * The id if one already exists, and NOTHING if it does not. Never mints, never writes.
 *
 * `resolveUserId` stamps a durable cross-session identifier into localStorage the first time it is
 * called. On the landing that used to happen during the same render that draws the consent card,
 * which is before the question is asked, under a card that promises "say no and the world plays
 * exactly the same". A key that survives the no is not the same. Anything that runs before an
 * answer reads through this; only the accept path is allowed to mint.
 */
export function peekUserId(): string {
  if (typeof window === "undefined") return "";
  const override = (new URLSearchParams(window.location.search).get("u") || "").trim();
  if (override) return override;
  return localStorage.getItem("echo.userId") ?? "";
}

export function resolveUserId(): string {
  if (typeof window === "undefined") return ""; // SSR guard; callers run client-side
  const override = (new URLSearchParams(window.location.search).get("u") || "").trim();
  if (override) return override; // test/dev override — verbatim, not persisted (don't clobber a real id)
  let id = localStorage.getItem("echo.userId");
  if (!id) {
    id = newAnonUserId();
    localStorage.setItem("echo.userId", id);
  }
  return id;
}

/** A fresh anonymous id in the SAME bare-UUID shape as the auth id (no "u_" prefix), so every user
 *  — signed-in or anonymous — is one consistent form. Falls back for older/insecure contexts. */
function newAnonUserId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* insecure context / unsupported → deterministic-enough fallback below */
  }
  return `anon-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * The signature that makes the id above worth trusting (SOC-2.E, C39).
 *
 * `peekUserId` and `resolveUserId` are untouched, synchronous, and still read nothing but
 * `location.search` and `localStorage` — `chain.test.mts` drives them through a thirty-line fake
 * browser, and an async or fetch-bearing resolver would break every caller that reads an id during a
 * render. What is added is a token that rides ALONGSIDE the id, and one async call that mints both.
 */
export const IDENTITY_TOKEN_KEY = "echo.identityToken";
const TOKEN_KEY = IDENTITY_TOKEN_KEY;

/** The bearer token for this browser's identity, or "" — never throws, never mints. */
export function identityToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return ""; // private mode / blocked storage: an unsigned visit, refused by the routes
  }
}

/** The `?u=` two-tab override, or "". Read in one place because three rules now depend on it. */
function overrideId(): string {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("u") || "").trim();
}

/**
 * THE HEADERS EVERY AUTHENTICATED FETCH FROM THE BROWSER SENDS — one place, for two reasons.
 *
 * This was a closure inside `createMeasureChain`, reachable by the three routes the parcel chain
 * calls and by nothing else. Meanwhile `/play` and `/flow4` wrote island state, asked for a persona
 * and claimed an island slot with `content-type` and nothing else, so every one of those writes was
 * refused the moment its route was gated — silently, because each call site swallows its own
 * failure. A header policy that lives in one component's closure is a policy three other components
 * do not have (L5).
 *
 * **THE `?u=` RULE IS THE HALF THAT IS EASY TO MISS.** `subjectFor` checks the TOKEN branch first
 * and answers `mismatch` before it ever reaches the relaxation that honours an asserted id. So a
 * browser profile that has ever held a token would send it alongside `?u=alice` and be refused —
 * which would break the two-tab harness `verify-3d-render.md` depends on, and it is the ONE
 * mechanism in the tree that yields two identities in one browser profile. An override sends no
 * signature: it is asserting an id, and the deployments that honour that are exactly the ones that
 * prove they are not production.
 */
export function identityHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json", ...extra };
  const token = outboundIdentityToken();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

/**
 * The token to SEND, which is not always the token this browser holds — and the two carriers that
 * need it do not share a transport, so the rule cannot live in the header builder.
 *
 * `identityHeaders` puts it in an `Authorization` header; the Colyseus join puts it in a join
 * option, which `WorldRoom.onAuth` reads through the same `subjectFor` the routes use. Both must
 * withhold it under `?u=` for the reason above, so both ask here.
 */
export function outboundIdentityToken(): string {
  if (overrideId()) return "";
  return identityToken();
}

/** Store an id and its signature together. Used by the sign-in path, which mints its own. */
export function storeIdentity(userId: string, token: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem("echo.userId", userId);
    if (token) localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage refused; the session continues unsigned and the routes will say so */
  }
}

/**
 * A server-minted, server-signed identity — asking for one if this browser has none.
 *
 * **THIS MINTS, so it must only be called after the consent card is answered.** Everything above
 * exists to make that possible: `peekUserId` reads without writing precisely so a render that runs
 * before the question cannot stamp a durable key under a card promising that a "no" changes nothing.
 *
 * **THERE ARE NOW THREE CALLERS, AND THE RULE IS THE SAME ONE.** `arm()` is the parcel chain's accept
 * path. `/claim` is the third, where `resolveUserId` already minted unsigned: that page asks no
 * consent question a stamped key would answer early and already promises the identifier is
 * permanent, which is the case `lib/identity.ts` and SOC-2.B both make for it.
 * The second is `/play`'s connect effect, which is downstream of a RENDER GATE: `play/page.tsx`
 * returns a placeholder and redirects to `/onboard` unless `echo.character` exists, and `/onboard`
 * writes `echo.consent` before it writes `echo.character` — so `WorldClient` cannot mount until the
 * question has been answered. The sentence this used to carry ("never from a render") named the
 * mechanism that happened to be true rather than the rule, and the rule is *after the answer*.
 *
 * It is NOT the mistake C39 removed. `Flow0Client` was a SECOND MINTER of a different form, writing
 * `"u_" + Math.random()` into the canonical key on mount, before any question. This is the one
 * minter, reached from two more places that have already asked.
 *
 * **WHO STILL DOES NOT MINT, AND WHY THAT IS A DECISION RATHER THAN AN OMISSION.** `/flow0`,
 * `/flow1`, `/flow4`, `/flow5` and `/account` route their fetches through `identityHeaders()` and so
 * send a signature **if one exists** — but none of them asks for one. For the flow pages that is
 * deliberate: `Flow0Client` is exactly where C39 removed a pre-consent minter, and adding one back
 * under a different name would be the same act. They run under `?u=` and the relaxation, which is
 * what the harnesses use. In production those four write unsigned and are refused. `/account` is the
 * sharper one: a browser with no token cannot prove the subject whose data it is asking to erase.
 * **Both are open, and they are `⚑28`'s named remainder — not something this closed.**
 *
 * A `?u=` override returns verbatim and mints NOTHING. It has no signature and needs none: the
 * server honours an asserted id only where `ECHO_TRUST_CLIENT_ID=1` and the deployment proves it is
 * not production, which is where the harnesses run and nowhere else.
 *
 * `fetchImpl` is injectable for the same reason `measure.ts` injects one: the chain's tests drive a
 * recorder, and a mint that reached past it would be the one request in the flow they could not see.
 *
 * On failure the previous id is left exactly as it was rather than replaced with something unsigned.
 * The writes will be refused with `identity_required`, which is the honest outcome — quietly
 * continuing under an unsigned id is the behaviour this whole change removes.
 */
export async function ensureIdentity(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (typeof window === "undefined") return "";
  const override = overrideId();
  if (override) return override;
  // ONE MINT AT A TIME, PER MODULE. `arm()` and the `/play` join both reach this, React's
  // StrictMode double-invokes the effect that calls it in dev, and nothing here was memoized: two
  // concurrent callers both failed the early return below, both POSTed, and the route minted two
  // different subjects. Whichever response landed last won localStorage while the other caller kept
  // the id it was handed — and a caller holding one subject with the other's token is refused with
  // identity_mismatch. A second caller now awaits the first rather than racing it.
  // AN INJECTED FETCH IS NEVER SERVED FROM THE MEMO, and that is not a detail. `measure.ts` injects
  // a recorder for the reason it states — "a mint that reached past it would be the one request in
  // the flow they could not see" — and a shared promise hands the second caller the FIRST caller's
  // transport, so the recorder records nothing and the test passes anyway. That is this repo's own
  // "a check that cannot fail" shape, introduced by the fix for a different one. The memo exists to
  // stop StrictMode's double-invoke racing itself; those are the default-transport callers.
  //
  // BUT NO MINT RACES ANOTHER, WHATEVER ITS TRANSPORT. The parcel page has both kinds of caller at
  // once — the measure chain's `arm()` with its injected fetch, and the act panel (`Interact`, C47)
  // with the default — and an injected caller skipping the memo raced the default one exactly as
  // StrictMode had: two subjects, and every act's measurement refused with identity_mismatch (seen
  // in the browser at C50, in the HUD as http_403). So mints are queued: each waits for the one
  // before it, and then finds both keys stored and needs no request at all, or makes its own with
  // its own transport. A recorder still sees every request that is made through it.
  if (fetchImpl === fetch && identityInFlight) return identityInFlight;
  const run = mintQueue.then(() => mintIdentity(fetchImpl));
  mintQueue = run.catch(() => undefined);
  if (fetchImpl !== fetch) return run;
  identityInFlight = run.finally(() => {
    identityInFlight = null;
  });
  return identityInFlight;
}

/** The module-level in-flight mint (default transport). Cleared when it settles, so a later failure can retry. */
let identityInFlight: Promise<string> | null = null;
/** Every mint, in order: the next starts when the last has settled. */
let mintQueue: Promise<unknown> = Promise.resolve();

async function mintIdentity(fetchImpl: typeof fetch): Promise<string> {
  let existing = "";
  try {
    existing = localStorage.getItem("echo.userId") ?? "";
  } catch {
    /* unreadable storage is an unsigned visit */
  }
  // BOTH KEYS, AND THEY MUST AGREE. This used to be `existing && identityToken()`, which is true of
  // a browser whose two keys have drifted apart — and one did that routinely: `/account`'s erase
  // removed `echo.userId` and left `echo.identityToken`, then `resolveUserId` minted a fresh
  // anonymous id under the dead signature. Every write from that browser was refused with
  // identity_mismatch and NO RELOAD HEALED IT, because the only thing that could re-mint was this
  // short-circuit. Checking the token actually covers the id makes the state self-correcting.
  if (existing && tokenMatchesSubject(identityToken(), existing)) return existing;

  try {
    const res = await fetchImpl("/api/identity/session", { method: "POST" });
    if (!res.ok) return existing;
    const { userId, token } = (await res.json()) as { userId?: string; token?: string };
    if (!userId || !token) return existing;
    storeIdentity(userId, token);
    return userId;
  } catch {
    return existing;
  }
}
