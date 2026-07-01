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
