"use client";

/**
 * The owner's groups (DECISIONS C85), on `/pilot/admin`: each group's link to send, who is waiting to be
 * let in (a yes or a no each), and who is in and how far through their visits. A new group is a name and
 * a number of visits.
 *
 * The token is typed once and kept on this device only (`localStorage`, never sent anywhere but the
 * pilot's own API, as `x-pilot-admin`). The page asks again every twenty seconds while it is open, so a
 * request shows up without a reload.
 */
import { useCallback, useEffect, useState } from "react";

import { setLang, t, useLang } from "@/lib/i18n";

const TOKEN_KEY = "echo.pilotAdmin";
const POLL_MS = 20_000;

interface Group {
  id: string;
  name: string | null;
  code: string | null;
  visits: number;
  createdAt: string;
  waiting: { subject: string; nickname: string; since: string | null }[];
  members: { nickname: string; joinedAt: string; visits: number }[];
}

const button = "rounded-full bg-parchment px-4 py-2 text-sm font-medium text-ink disabled:opacity-40";
const quiet = "text-sm text-parchment/55 hover:text-parchment disabled:opacity-40";
const field = "mt-1 block w-full rounded-lg bg-white/10 px-3 py-2 text-[15px] text-parchment outline-none focus:bg-white/15";

const kept = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};
const keep = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // kept for this page only
  }
};

export default function PilotAdmin() {
  const lang = useLang();
  const [token, setToken] = useState("");
  const [typed, setTyped] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [visits, setVisits] = useState<2 | 3>(3);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(
    async (with_: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/pilot?op=groups", { headers: { "x-pilot-admin": with_ }, cache: "no-store" });
        if (res.status === 404) {
          setGroups(null);
          setError(t(lang, "pilot.admin.badToken"));
          return false;
        }
        if (!res.ok) {
          setError(t(lang, "pilot.errOther"));
          return false;
        }
        const data = (await res.json()) as { groups: Group[] };
        setGroups(data.groups);
        setError(null);
        return true;
      } catch {
        setError(t(lang, "pilot.errOther"));
        return false;
      }
    },
    [lang],
  );

  useEffect(() => {
    const k = kept();
    if (!k) return;
    setToken(k);
    void load(k);
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void load(token), POLL_MS);
    return () => clearInterval(timer);
  }, [token, load]);

  const unlock = async () => {
    setBusy(true);
    const ok = await load(typed.trim());
    if (ok) {
      setToken(typed.trim());
      keep(typed.trim());
    }
    setBusy(false);
  };

  const call = async (op: "group" | "approve" | "decline", body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pilot?op=${op}`, { method: "POST", headers: { "content-type": "application/json", "x-pilot-admin": token }, body: JSON.stringify(body) });
      if (!res.ok) setError(t(lang, "pilot.errOther"));
      await load(token);
      return res.ok;
    } catch {
      setError(t(lang, "pilot.errOther"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const linkOf = (g: Group) => (g.code ? `${window.location.origin}/pilot?code=${g.code}` : "");
  const copy = async (g: Group) => {
    try {
      await navigator.clipboard.writeText(linkOf(g));
      setCopied(g.id);
    } catch {
      // The link is on the page to copy by hand.
    }
  };
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "");

  return (
    <div data-pilot-admin className="flex w-full justify-center px-5 py-10">
      <div className="w-[min(640px,100%)] text-parchment">
        <div className="mb-6 flex items-center justify-between text-xs text-parchment/50">
          <h1 className="font-serif text-3xl text-parchment">{t(lang, "pilot.admin.title")}</h1>
          <span className="flex gap-3">
            <button type="button" onClick={() => setLang("tr")} className={lang === "tr" ? "text-parchment" : "hover:text-parchment"}>
              TR
            </button>
            <button type="button" onClick={() => setLang("en")} className={lang === "en" ? "text-parchment" : "hover:text-parchment"}>
              EN
            </button>
          </span>
        </div>

        {!token ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <label className="block text-xs text-parchment/55">
              {t(lang, "pilot.admin.token")}
              <input data-pilot-admin-token type="password" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className={field} />
            </label>
            <button type="submit" disabled={busy || typed.trim().length < 12} className={`${button} mt-4`}>
              {t(lang, "pilot.admin.unlock")}
            </button>
            <p className="mt-3 text-[12px] leading-relaxed text-parchment/45">{t(lang, "pilot.admin.off")}</p>
          </form>
        ) : (
          <>
            <form
              data-pilot-admin-new
              className="flex flex-wrap items-end gap-3 border-b border-parchment/10 pb-6"
              onSubmit={(e) => {
                e.preventDefault();
                void (async () => {
                  if (await call("group", { name, visits })) setName("");
                })();
              }}
            >
              <label className="min-w-[200px] flex-1 text-xs text-parchment/55">
                {t(lang, "pilot.admin.new")}
                <input data-pilot-admin-name maxLength={40} placeholder={t(lang, "pilot.admin.name")} value={name} onChange={(e) => setName(e.target.value)} className={field} />
              </label>
              <label className="text-xs text-parchment/55">
                {t(lang, "pilot.admin.visits")}
                <select value={visits} onChange={(e) => setVisits(e.target.value === "2" ? 2 : 3)} className={field}>
                  <option value={3}>3</option>
                  <option value={2}>2</option>
                </select>
              </label>
              <button type="submit" disabled={busy || !name.trim()} className={button}>
                {t(lang, "pilot.admin.create")}
              </button>
            </form>

            {groups && groups.length === 0 ? <p className="mt-6 text-[14px] text-parchment/60">{t(lang, "pilot.admin.empty")}</p> : null}

            {(groups ?? []).map((g) => (
              <section key={g.id} data-pilot-admin-group={g.id} className="border-b border-parchment/10 py-6">
                <h2 className="font-serif text-2xl">{g.name}</h2>
                <p data-pilot-admin-link className="mt-2 break-all font-mono text-[13px] text-parchment/85">
                  {linkOf(g)}
                </p>
                <button type="button" onClick={() => void copy(g)} className={`${quiet} mt-1`}>
                  {copied === g.id ? t(lang, "pilot.admin.copied") : t(lang, "pilot.admin.copy")}
                </button>

                <h3 className="mt-5 text-xs uppercase tracking-wider text-parchment/50">{t(lang, "pilot.admin.waiting", { n: g.waiting.length })}</h3>
                {g.waiting.length === 0 ? (
                  <p className="mt-1 text-[13px] text-parchment/45">{t(lang, "pilot.admin.none")}</p>
                ) : (
                  <ul className="mt-1 divide-y divide-parchment/10">
                    {g.waiting.map((w) => (
                      <li key={w.subject} data-pilot-admin-waiting={w.nickname} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                        <span className="text-[15px]">
                          {w.nickname} <span className="text-[12px] text-parchment/40">{when(w.since)}</span>
                        </span>
                        <span className="flex items-center gap-4">
                          <button type="button" data-pilot-admin-approve disabled={busy} onClick={() => void call("approve", { subject: w.subject })} className={button}>
                            {t(lang, "pilot.admin.approve")}
                          </button>
                          <button type="button" data-pilot-admin-decline disabled={busy} onClick={() => void call("decline", { subject: w.subject })} className={quiet}>
                            {t(lang, "pilot.admin.decline")}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <h3 className="mt-5 text-xs uppercase tracking-wider text-parchment/50">{t(lang, "pilot.admin.members", { n: g.members.length })}</h3>
                {g.members.length === 0 ? (
                  <p className="mt-1 text-[13px] text-parchment/45">{t(lang, "pilot.admin.noMembers")}</p>
                ) : (
                  <ul className="mt-1 divide-y divide-parchment/10">
                    {g.members.map((m) => (
                      <li key={m.nickname} className="flex items-center justify-between py-2">
                        <span className="text-[15px]">{m.nickname}</span>
                        <span className="text-[12px] text-parchment/50">{t(lang, "pilot.admin.visitsDone", { n: m.visits, of: g.visits })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <div className="mt-6 flex items-center gap-5">
              <button type="button" disabled={busy} onClick={() => void load(token)} className={quiet}>
                {t(lang, "pilot.admin.refresh")}
              </button>
              <button
                type="button"
                onClick={() => {
                  keep(null);
                  setToken("");
                  setTyped("");
                  setGroups(null);
                }}
                className={quiet}
              >
                {t(lang, "pilot.admin.forget")}
              </button>
            </div>
          </>
        )}

        {error ? (
          <p data-pilot-admin-error className="mt-4 text-sm text-[#e8a07a]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
