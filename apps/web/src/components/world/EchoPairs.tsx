"use client";

/**
 * Letting your echo meet someone's you know (DECISIONS C71), from the HUD's menu.
 *
 * Both people say yes, in two halves: one makes a code and hands it over, the other types it in, each
 * with the name the other knows them by. The panel says what that means before either does it: where
 * the echoes meet, what each will see and hear, what neither sees, and that either can stop it.
 *
 * Only with consent: an echo exists because its person let it watch.
 */
import { useCallback, useEffect, useState } from "react";

import type { ConsentState } from "@/game/world/measure";
import { t, useLang, type Key } from "@/lib/i18n";
import { ensureIdentity, identityHeaders } from "@/lib/identity";
import { openPanel, usePanel } from "@/lib/panels";

import EchoPanel from "./Panel";

type Pair = { id: string; name: string; since: string };

const ERRORS = ["no_such_code", "expired", "own_code", "already", "bad_name", "bad_code", "too_many"] as const;

export default function EchoPairs({ consent }: { consent: ConsentState }) {
  const lang = useLang();
  // One panel at a time over the world (`lib/panels.ts`): this is the echo's "friends" page.
  const open = usePanel() === "friends";
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [theirs, setTheirs] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = useCallback(async (body: Record<string, unknown>) => {
    await ensureIdentity();
    const res = await fetch("/api/echo/pair", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }, []);

  const errorWords = useCallback(
    (data: Record<string, unknown>) => {
      const e = String(data.error ?? "");
      return t(lang, (ERRORS as readonly string[]).includes(e) ? (`pair.err.${e}` as Key) : "pair.err.other");
    },
    [lang],
  );

  const load = useCallback(async () => {
    const { ok, data } = await post({ op: "list" });
    setPairs(ok ? ((data.pairs as Pair[]) ?? []) : []);
  }, [post]);

  useEffect(() => {
    const show = () => openPanel("friends");
    window.addEventListener("echo:pairs", show);
    return () => window.removeEventListener("echo:pairs", show);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Opened afresh: what was said and the code made last time are not carried over.
    setSaid(null);
    setCode(null);
    if (consent === "accepted") void load().catch(() => setPairs([]));
  }, [open, consent, load]);

  if (!open) return null;

  const invite = async () => {
    setBusy(true);
    setSaid(null);
    const { ok, data } = await post({ op: "invite", name });
    setBusy(false);
    if (ok) setCode(String(data.code));
    else setSaid(errorWords(data));
  };
  const accept = async () => {
    setBusy(true);
    setSaid(null);
    const { ok, data } = await post({ op: "accept", code: theirs, name });
    setBusy(false);
    if (!ok) return setSaid(errorWords(data));
    const pair = data.pair as Pair;
    setSaid(t(lang, "pair.paired", { name: pair.name }));
    setTheirs("");
    void load();
  };
  const leave = async (id: string) => {
    const { ok, data } = await post({ op: "leave", id });
    if (!ok) return setSaid(errorWords(data));
    void load();
  };
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // the code is on the screen to read out
    }
  };
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === "tr" ? "tr-TR" : undefined, { day: "numeric", month: "short" });
  const field = "w-full rounded-lg border border-parchment/15 bg-parchment/5 px-3 py-2 text-sm text-parchment placeholder:text-parchment/35 focus:border-echo focus:outline-none";
  const button = "btn btn-sm btn-primary";

  return (
    <EchoPanel tab="friends" label={t(lang, "pair.title")} attrs={{ "data-echo-pairs": "" }} onKeyDown={(e) => e.stopPropagation()}>
      <div className="min-h-0 overflow-y-auto px-5 pb-5 pt-4 text-sm text-parchment">
      <h2 className="font-serif text-[20px] leading-tight">{t(lang, "pair.title")}</h2>
      {consent !== "accepted" ? (
        <p className="mt-3 text-parchment/70">{t(lang, "pair.needsConsent")}</p>
      ) : (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-parchment/60">{t(lang, "pair.intro")}</p>

          <label className="mt-4 block text-xs text-parchment/55">
            {t(lang, "pair.yourName")}
            <input data-pair-name value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={`${field} mt-1`} />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-parchment/[0.04] p-3">
              {code ? (
                <>
                  <p className="text-xs text-parchment/60">{t(lang, "pair.codeIs")}</p>
                  <p className="mt-1.5 font-mono text-xl tracking-[0.2em] text-parchment" data-pair-code>
                    {code}
                  </p>
                  <button type="button" onClick={() => void copy()} className="mt-1.5 text-xs text-echo-soft hover:text-parchment">
                    {copied ? t(lang, "pair.copied") : t(lang, "pair.copy")}
                  </button>
                </>
              ) : (
                <button type="button" data-pair-invite disabled={busy || !name.trim()} onClick={() => void invite()} className={button}>
                  {t(lang, "pair.makeCode")}
                </button>
              )}
            </div>
            <div className="rounded-xl bg-parchment/[0.04] p-3">
              <p className="text-xs text-parchment/60">{t(lang, "pair.haveCode")}</p>
              <input data-pair-their-code value={theirs} maxLength={8} placeholder={t(lang, "pair.code")} onChange={(e) => setTheirs(e.target.value.toUpperCase())} className={`${field} mt-1.5 font-mono tracking-[0.15em]`} />
              <button type="button" data-pair-accept disabled={busy || !name.trim() || theirs.replace(/[^A-Z0-9]/g, "").length !== 6} onClick={() => void accept()} className={`${button} mt-2`}>
                {t(lang, "pair.accept")}
              </button>
            </div>
          </div>

          {said ? (
            <p className="mt-3 text-[13px] text-parchment/80" data-pair-said>
              {said}
            </p>
          ) : null}

          <p className="mt-4 text-[10px] uppercase tracking-[0.14em] text-parchment/45">{t(lang, "pair.with")}</p>
          <ul className="mt-1.5 space-y-1" data-pair-list>
            {pairs === null ? null : pairs.length === 0 ? (
              <li className="text-parchment/45">{t(lang, "pair.none")}</li>
            ) : (
              pairs.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3" data-pair={p.id}>
                  <span>
                    {p.name} <span className="text-xs text-parchment/40">· {t(lang, "pair.since", { date: date(p.since) })}</span>
                  </span>
                  <button type="button" onClick={() => void leave(p.id)} className="text-xs text-parchment/50 hover:text-danger">
                    {t(lang, "pair.stop")}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
      {/* The other thing a friend can do is on another page, and this is where people look for it (C96). */}
      <p className="mt-4 border-t border-parchment/10 pt-3 text-xs text-parchment/50">
        {t(lang, "pair.guessHint")}{" "}
        <button type="button" data-pairs-to-guesses onClick={() => openPanel("guesses")} className="text-echo-soft underline decoration-echo-soft/40 underline-offset-2 hover:text-parchment">
          {t(lang, "hub.guesses")}
        </button>
      </p>
    </div>
    </EchoPanel>
  );
}
