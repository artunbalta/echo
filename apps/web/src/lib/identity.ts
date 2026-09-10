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
const TOKEN_KEY = "echo.identityToken";

/** The bearer token for this browser's identity, or "" — never throws, never mints. */
export function identityToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return ""; // private mode / blocked storage: an unsigned visit, refused by the routes
  }
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
 * The caller is `arm()`, which is the accept path.
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
  const override = (new URLSearchParams(window.location.search).get("u") || "").trim();
  if (override) return override;

  let existing = "";
  try {
    existing = localStorage.getItem("echo.userId") ?? "";
  } catch {
    /* unreadable storage is an unsigned visit */
  }
  if (existing && identityToken()) return existing;

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
