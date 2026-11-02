"use client";

/**
 * The pilot village, start to finish (DECISIONS C75). Joining, in order:
 * - what this is and what is kept, with a yes of its own;
 * - the group's code and a name the friends know;
 * - where they place themselves on the eight axes;
 * - what they say they would do in each of the six, before they meet any of them.
 *
 * Then a visit of 25 minutes in the world, with nothing in it that says how the echo reads them. After
 * it, how they see each of their friends. Then, a day later, the second visit.
 *
 * A first join is a fresh person: whatever identity this browser had is set aside, so the pilot's echo
 * learns from the pilot alone. A returning one is recognised by the same browser.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PERSONA_AXIS_KEYS } from "@echo/shared";

import ParcelCanvas, { type ParcelCanvasProps } from "@/components/planet/ParcelCanvas";
import type { PilotSettings } from "@/components/pilot/PilotOverlay";
import { setLang, t, useLang, type Key } from "@/lib/i18n";
import { ensureIdentity, identityHeaders } from "@/lib/identity";

type Axis = (typeof PERSONA_AXIS_KEYS)[number];

interface Session {
  n: number;
  startedAt: string;
  endedAt: string | null;
}

interface Info {
  on: boolean;
  cell: string;
  sessionMs: number;
  sessions: number;
  me: { nickname: string; sessions: Session[]; open: Session | null; start: { ok: true; n: number } | { ok: false; why: "open" | "done" | "too_soon"; at?: string } } | null;
  group: { nickname: string; rated: boolean }[];
}

interface Stated {
  give: 0 | 1 | 2 | 3 | null;
  lend: boolean | null;
  bet: "bet-safe" | "bet-even" | "bet-long" | "none" | null;
  seed: "now" | "plant" | null;
  path: "marked" | "unmarked" | null;
  greet: boolean | null;
}

type Step = "loading" | "intro" | "self" | "stated" | "ready" | "playing" | "rate" | "thanks" | "unavailable";

const button = "rounded-full bg-parchment px-4 py-2 text-sm font-medium text-ink disabled:opacity-40";
const quiet = "text-sm text-parchment/55 hover:text-parchment";

/** Seven dots between two poles, one chosen. */
function Scale({ axis, value, onChange, lang }: { axis: Axis; value: number | null; onChange: (v: number) => void; lang: "en" | "tr" }) {
  return (
    <div data-pilot-axis={axis} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
      <span className="text-right text-[13px] text-parchment/70">{t(lang, `pilot.lo.${axis}` as Key)}</span>
      <span className="flex gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7].map((v) => (
          <button
            key={v}
            type="button"
            aria-label={`${v}`}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`h-5 w-5 rounded-full border border-parchment/40 ${value === v ? "bg-parchment" : "bg-transparent hover:bg-parchment/25"}`}
          />
        ))}
      </span>
      <span className="text-[13px] text-parchment/70">{t(lang, `pilot.hi.${axis}` as Key)}</span>
    </div>
  );
}

/** One question of the six, and its answers. */
function Choice<T extends string | number | boolean>({ id, question, options, value, onChange }: { id: string; question: string; options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <fieldset data-pilot-stated={id} className="border-t border-parchment/10 py-4">
      <legend className="sr-only">{question}</legend>
      <p className="text-[15px] leading-relaxed text-parchment/85">{question}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-full border px-3 py-1.5 text-[13px] ${value === o.value ? "border-parchment bg-parchment text-ink" : "border-parchment/30 text-parchment/80 hover:border-parchment/60"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function PilotFlow(parcel: Omit<ParcelCanvasProps, "demo" | "stations" | "pilot">) {
  const lang = useLang();
  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<Info | null>(null);
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [consent, setConsent] = useState(false);
  const [self, setSelf] = useState<(number | null)[]>(PERSONA_AXIS_KEYS.map(() => null));
  const [stated, setStated] = useState<Stated>({ give: null, lend: null, bet: null, seed: null, path: null, greet: null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [visit, setVisit] = useState<PilotSettings | null>(null);
  const [rating, setRating] = useState<{ ratee: string; know: 0 | 1 | 2 | 3 | null; axes: (number | null)[] } | null>(null);

  const load = useCallback(async (): Promise<Info | null> => {
    try {
      const res = await fetch("/api/pilot", { headers: identityHeaders() });
      if (!res.ok) return null;
      const data = (await res.json()) as Info;
      setInfo(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback(
    (session: Session, sessionMs: number) => {
      setVisit({
        n: session.n,
        startedAt: session.startedAt,
        sessionMs,
        onEnd: () => {
          setVisit(null);
          setStep("rate");
          void load();
        },
      });
      setStep("playing");
    },
    [load],
  );

  useEffect(() => {
    void (async () => {
      const data = await load();
      if (!data) return setStep("unavailable");
      if (!data.me) return setStep("intro");
      if (data.me.open) return play(data.me.open, data.sessionMs);
      setStep("ready");
    })();
  }, [load, play]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      // A fresh person for the pilot, and their yes to being watched in it.
      for (const k of ["echo.userId", "echo.identityToken"]) localStorage.removeItem(k);
      localStorage.setItem("echo.consent", JSON.stringify({ telemetry: true }));
      await ensureIdentity();
      const res = await fetch("/api/pilot?op=join", {
        method: "POST",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ code, nickname, consent, self, stated }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error === "wrong_code" ? t(lang, "pilot.errCode") : data.error === "name_taken" ? t(lang, "pilot.errName") : t(lang, "pilot.errOther"));
        if (data.error === "wrong_code" || data.error === "name_taken") setStep("intro");
        return;
      }
      await load();
      setStep("ready");
    } catch {
      setError(t(lang, "pilot.errOther"));
    } finally {
      setBusy(false);
    }
  };

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureIdentity();
      const res = await fetch("/api/pilot?op=start", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: "{}" });
      const data = (await res.json().catch(() => ({}))) as { session?: Session; error?: string };
      if (!res.ok || !data.session) {
        setError(t(lang, "pilot.errOther"));
        await load();
        return;
      }
      play(data.session, info?.sessionMs ?? 25 * 60 * 1000);
    } catch {
      setError(t(lang, "pilot.errOther"));
    } finally {
      setBusy(false);
    }
  };

  const saveRating = async () => {
    if (!rating || rating.know === null) return;
    setBusy(true);
    setError(null);
    try {
      const axes = rating.know === 0 ? null : rating.axes;
      const res = await fetch("/api/pilot?op=rate", {
        method: "POST",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ ratee: rating.ratee, know: rating.know, axes }),
      });
      if (!res.ok) {
        setError(t(lang, "pilot.errOther"));
        return;
      }
      setRating(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (step === "playing" && visit) return <ParcelCanvas {...parcel} stations={null} pilot={visit} />;

  const page = (children: ReactNode) => (
    <div data-pilot-step={step} className="flex min-h-full w-full justify-center overflow-y-auto bg-ink px-5 py-10">
      <div className="w-[min(560px,100%)] text-parchment">
        <div className="mb-6 flex justify-end gap-3 text-xs text-parchment/50">
          <button type="button" onClick={() => setLang("tr")} className={lang === "tr" ? "text-parchment" : "hover:text-parchment"}>
            TR
          </button>
          <button type="button" onClick={() => setLang("en")} className={lang === "en" ? "text-parchment" : "hover:text-parchment"}>
            EN
          </button>
        </div>
        {children}
        {error ? (
          <p data-pilot-error className="mt-4 text-sm text-[#e8a07a]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (step === "loading") return page(<p className="text-parchment/50">…</p>);
  if (step === "unavailable") return page(<p className="text-parchment/70">{t(lang, "pilot.unavailable")}</p>);

  if (step === "intro")
    return page(
      <>
        <h1 className="font-serif text-4xl leading-tight">{t(lang, "pilot.title")}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-parchment/75">{t(lang, "pilot.intro")}</p>
        <p className="mt-3 text-[13px] leading-relaxed text-parchment/55">{t(lang, "pilot.kept")}</p>
        <p className="mt-3 text-[13px] leading-relaxed text-parchment/55">{t(lang, "pilot.sameBrowser")}</p>
        <label className="mt-6 block text-xs text-parchment/55">
          {t(lang, "pilot.code")}
          <input data-pilot-code value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 block w-full rounded-lg bg-white/10 px-3 py-2 text-[15px] text-parchment outline-none focus:bg-white/15" />
        </label>
        <label className="mt-4 block text-xs text-parchment/55">
          {t(lang, "pilot.nickname")}
          <input data-pilot-nickname maxLength={24} value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-1 block w-full rounded-lg bg-white/10 px-3 py-2 text-[15px] text-parchment outline-none focus:bg-white/15" />
        </label>
        <label className="mt-5 flex items-start gap-3 text-[13px] leading-relaxed text-parchment/80">
          <input data-pilot-consent type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>{t(lang, "pilot.consent")}</span>
        </label>
        <div className="mt-6">
          <button type="button" data-pilot-next disabled={!consent || code.trim().length < 4 || !nickname.trim()} onClick={() => setStep("self")} className={button}>
            {t(lang, "pilot.next")}
          </button>
        </div>
      </>,
    );

  if (step === "self")
    return page(
      <>
        <h2 className="font-serif text-2xl">{t(lang, "pilot.selfTitle")}</h2>
        <p className="mt-2 text-[13px] text-parchment/60">{t(lang, "pilot.selfBody")}</p>
        <div className="mt-4">
          {PERSONA_AXIS_KEYS.map((axis, i) => (
            <Scale key={axis} axis={axis} lang={lang} value={self[i] ?? null} onChange={(v) => setSelf((prev) => prev.map((x, j) => (j === i ? v : x)))} />
          ))}
        </div>
        <div className="mt-6 flex items-center gap-4">
          <button type="button" data-pilot-next disabled={self.some((x) => x === null)} onClick={() => setStep("stated")} className={button}>
            {t(lang, "pilot.next")}
          </button>
          <button type="button" onClick={() => setStep("intro")} className={quiet}>
            {t(lang, "pilot.back")}
          </button>
        </div>
      </>,
    );

  if (step === "stated") {
    const set = <K extends keyof Stated>(k: K) => (v: Exclude<Stated[K], null>) => setStated((s) => ({ ...s, [k]: v }));
    const yesNo = [
      { value: true, label: t(lang, "pilot.yes") },
      { value: false, label: t(lang, "pilot.no") },
    ];
    return page(
      <>
        <h2 className="font-serif text-2xl">{t(lang, "pilot.statedTitle")}</h2>
        <p className="mt-2 text-[13px] text-parchment/60">{t(lang, "pilot.statedBody")}</p>
        <div className="mt-4">
          <Choice id="give" question={t(lang, "pilot.qGive")} value={stated.give} onChange={set("give")} options={([0, 1, 2, 3] as const).map((n) => ({ value: n, label: String(n) }))} />
          <Choice id="lend" question={t(lang, "pilot.qLend")} value={stated.lend} onChange={set("lend")} options={yesNo} />
          <Choice
            id="bet"
            question={t(lang, "pilot.qBet")}
            value={stated.bet}
            onChange={set("bet")}
            options={[
              { value: "bet-safe" as const, label: t(lang, "pilot.betSafe") },
              { value: "bet-even" as const, label: t(lang, "pilot.betEven") },
              { value: "bet-long" as const, label: t(lang, "pilot.betLong") },
              { value: "none" as const, label: t(lang, "pilot.betNone") },
            ]}
          />
          <Choice
            id="seed"
            question={t(lang, "pilot.qSeed")}
            value={stated.seed}
            onChange={set("seed")}
            options={[
              { value: "now" as const, label: t(lang, "pilot.seedNow") },
              { value: "plant" as const, label: t(lang, "pilot.seedPlant") },
            ]}
          />
          <Choice
            id="path"
            question={t(lang, "pilot.qPath")}
            value={stated.path}
            onChange={set("path")}
            options={[
              { value: "marked" as const, label: t(lang, "pilot.pathMarked") },
              { value: "unmarked" as const, label: t(lang, "pilot.pathUnmarked") },
            ]}
          />
          <Choice id="greet" question={t(lang, "pilot.qGreet")} value={stated.greet} onChange={set("greet")} options={yesNo} />
        </div>
        <div className="mt-6 flex items-center gap-4">
          <button type="button" data-pilot-join disabled={busy || Object.values(stated).some((v) => v === null)} onClick={() => void join()} className={button}>
            {busy ? t(lang, "pilot.joining") : t(lang, "pilot.join")}
          </button>
          <button type="button" onClick={() => setStep("self")} className={quiet}>
            {t(lang, "pilot.back")}
          </button>
        </div>
      </>,
    );
  }

  const me = info?.me ?? null;
  const rateLink = (
    <button type="button" data-pilot-rate-open onClick={() => setStep("rate")} className={quiet}>
      {t(lang, "pilot.rateOpen")}
    </button>
  );

  if (step === "ready" && me) {
    const start = me.start;
    return page(
      <>
        <h2 className="font-serif text-3xl">{t(lang, "pilot.hello", { name: me.nickname })}</h2>
        {start.ok ? (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-parchment/75">{t(lang, start.n === 1 ? "pilot.readyFirst" : "pilot.readySecond")}</p>
            <div className="mt-6 flex items-center gap-4">
              <button type="button" data-pilot-begin disabled={busy} onClick={() => void begin()} className={button}>
                {t(lang, "pilot.begin", { n: start.n })}
              </button>
              {rateLink}
            </div>
          </>
        ) : start.why === "too_soon" ? (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-parchment/75">{t(lang, "pilot.tooSoon", { at: start.at ? new Date(start.at).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" }) : "" })}</p>
            <div className="mt-6">{rateLink}</div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-parchment/75">{t(lang, "pilot.allDone")}</p>
            <div className="mt-6">{rateLink}</div>
          </>
        )}
      </>,
    );
  }

  if (step === "rate") {
    const group = info?.group ?? [];
    if (rating) {
      return page(
        <>
          <h2 className="font-serif text-2xl">{rating.ratee}</h2>
          <p className="mt-3 text-[13px] text-parchment/60">{t(lang, "pilot.knowQ")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([0, 1, 2, 3] as const).map((k) => (
              <button
                key={k}
                type="button"
                data-pilot-know={k}
                aria-pressed={rating.know === k}
                onClick={() => setRating({ ...rating, know: k })}
                className={`rounded-full border px-3 py-1.5 text-[13px] ${rating.know === k ? "border-parchment bg-parchment text-ink" : "border-parchment/30 text-parchment/80"}`}
              >
                {t(lang, `pilot.know${k}` as Key)}
              </button>
            ))}
          </div>
          {rating.know !== null && rating.know > 0 ? (
            <div className="mt-4">
              <p className="text-[13px] text-parchment/60">{t(lang, "pilot.rateBody", { name: rating.ratee })}</p>
              {PERSONA_AXIS_KEYS.map((axis, i) => (
                <Scale key={axis} axis={axis} lang={lang} value={rating.axes[i] ?? null} onChange={(v) => setRating({ ...rating, axes: rating.axes.map((x, j) => (j === i ? v : x)) })} />
              ))}
            </div>
          ) : null}
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              data-pilot-rate-save
              disabled={busy || rating.know === null || (rating.know > 0 && rating.axes.some((x) => x === null))}
              onClick={() => void saveRating()}
              className={button}
            >
              {t(lang, "pilot.rateSave")}
            </button>
            <button type="button" onClick={() => setRating(null)} className={quiet}>
              {t(lang, "pilot.back")}
            </button>
          </div>
        </>,
      );
    }
    return page(
      <>
        <h2 className="font-serif text-2xl">{t(lang, "pilot.rateTitle")}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-parchment/60">{t(lang, "pilot.rateIntro")}</p>
        {group.length ? (
          <ul className="mt-4 divide-y divide-parchment/10">
            {group.map((g) => (
              <li key={g.nickname} className="flex items-center justify-between py-2.5">
                <span className="text-[15px]">{g.nickname}</span>
                <button type="button" data-pilot-rate={g.nickname} onClick={() => setRating({ ratee: g.nickname, know: null, axes: PERSONA_AXIS_KEYS.map(() => null) })} className={quiet}>
                  {g.rated ? t(lang, "pilot.rated") : t(lang, "pilot.rateOne")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[13px] text-parchment/50">{t(lang, "pilot.rateNone")}</p>
        )}
        <div className="mt-6">
          <button type="button" data-pilot-finish onClick={() => setStep("thanks")} className={button}>
            {t(lang, "pilot.finish")}
          </button>
        </div>
      </>,
    );
  }

  // thanks
  const next = me?.start;
  return page(
    <>
      <h2 className="font-serif text-3xl">{t(lang, "pilot.thanks")}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-parchment/75">
        {next && !next.ok && next.why === "done" ? t(lang, "pilot.allDone") : t(lang, "pilot.comeBack")}
      </p>
      <div className="mt-6 flex items-center gap-4">
        {rateLink}
        <button type="button" onClick={() => setStep("ready")} className={quiet}>
          {t(lang, "pilot.back")}
        </button>
      </div>
    </>,
  );
}
