"use client";

/**
 * The pilot village, start to finish (DECISIONS C75). Joining, in order:
 * - what this is and what is kept, with a yes of its own;
 * - the group's code and a name the friends know;
 * - where they place themselves on the eight axes;
 * - what they say they would do in each of the six, before they meet any of them.
 *
 * Then a visit of 25 minutes in the world, with nothing in it that says how the echo reads them. After
 * it, how they see each of their friends. Then, a day later, the second visit. After the last, if the
 * owner allows it, who knew them best (C80): their words, their friends, their echo, and what they did.
 *
 * A first join is a fresh person: whatever identity this browser had is set aside, so the pilot's echo
 * learns from the pilot alone. A returning one is recognised by the same browser.
 *
 * Circles (C83), when on: the code says what it opens (the study, or a circle of friends and how many
 * visits) before anyone agrees to anything; a circle asks a yes to play and, apart, an optional yes to
 * research. Anyone can start a circle and send its link (`/pilot?code=…`), on the way in or after their
 * own last visit.
 *
 * The owner's groups (C85): a group's link says its name. Whoever joins one waits on this page for the
 * owner's yes, which it asks about every quarter of a minute, and opens by itself when it comes.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PERSONA_AXIS_KEYS } from "@echo/shared";

import ParcelCanvas, { type ParcelCanvasProps } from "@/components/planet/ParcelCanvas";
import type { PilotSettings } from "@/components/pilot/PilotOverlay";
import PilotReveal, { type Debrief } from "@/components/pilot/PilotReveal";
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
  /** Whether circles are on (C83), the owner's groups (C85), and whether there is a study code at all. */
  circles?: boolean;
  groups?: boolean;
  study?: boolean;
  me: {
    nickname: string;
    inStudy?: boolean;
    /** The owner's group they are in (C85), and whether they are still waiting to be let in. */
    groupName?: string | null;
    waiting?: boolean;
    sessions: Session[];
    open: Session | null;
    start: { ok: true; n: number } | { ok: false; why: "open" | "done" | "too_soon" | "waiting"; at?: string };
  } | null;
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

type Step = "loading" | "intro" | "self" | "stated" | "ready" | "playing" | "rate" | "thanks" | "reveal" | "unavailable";

/** How often a page waiting for the owner's yes asks again (C85). */
const WAIT_POLL_MS = 15_000;

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
  const [rating, setRating] = useState<{ ratee: string; know: 0 | 1 | 2 | 3 | null; axes: (number | null)[]; predicted: Stated; noIdea: boolean } | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  // What the typed code opens (C83): undefined while unknown, null for nothing; `failed` if it could not be asked.
  const [opens, setOpens] = useState<{ kind: "study" | "circle" | "group"; visits: number; name?: string } | null | undefined>(undefined);
  const [checkFailed, setCheckFailed] = useState(false);
  const [research, setResearch] = useState(false);
  const [made, setMade] = useState<{ code: string; link: string; after: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  // A circle started on the way in already set up this browser's fresh identity: joining keeps it.
  const fresh = useRef(false);

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
    (session: Session, sessionMs: number, total: number) => {
      setVisit({
        n: session.n,
        total,
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
      if (data.me.open) return play(data.me.open, data.sessionMs, data.sessions);
      setStep("ready");
    })();
  }, [load, play]);

  // A code in the link (`/pilot?code=…`) fills the field.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("code");
    if (fromLink) setCode(fromLink);
  }, []);

  // What the code opens, asked a moment after typing stops.
  useEffect(() => {
    setOpens(undefined);
    setCheckFailed(false);
    if (code.replace(/[^a-z0-9]/gi, "").length < 4) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/pilot?op=code&code=${encodeURIComponent(code)}`);
          if (!res.ok) return setCheckFailed(true);
          const data = (await res.json()) as { kind: "study" | "circle" | "group" | null; visits?: number; name?: string };
          setOpens(data.kind ? { kind: data.kind, visits: data.visits ?? 2, name: data.name } : null);
        } catch {
          setCheckFailed(true);
        }
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [code]);

  const freshPerson = async () => {
    // A fresh person for the pilot, and their yes to being watched in it.
    for (const k of ["echo.userId", "echo.identityToken"]) localStorage.removeItem(k);
    localStorage.setItem("echo.consent", JSON.stringify({ telemetry: true }));
    await ensureIdentity();
  };

  /** A new circle and its link; `after` when its starter has played their own already. */
  const startCircle = async (after: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (!after && !fresh.current) {
        await freshPerson();
        fresh.current = true;
      } else {
        await ensureIdentity();
      }
      const res = await fetch("/api/pilot?op=circle", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ visits: 3 }) });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok || !data.code) return setError(t(lang, "pilot.errOther"));
      setMade({ code: data.code, link: `${window.location.origin}/pilot?code=${data.code}`, after });
      setCopied(false);
      if (!after) setCode(data.code);
    } catch {
      setError(t(lang, "pilot.errOther"));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.link);
      setCopied(true);
    } catch {
      // The link is on the page to copy by hand.
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!fresh.current) await freshPerson();
      const res = await fetch("/api/pilot?op=join", {
        method: "POST",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ code, nickname, consent, self, stated, research: opens?.kind === "circle" ? research : undefined }),
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
      play(data.session, info?.sessionMs ?? 25 * 60 * 1000, info?.sessions ?? 2);
    } catch {
      setError(t(lang, "pilot.errOther"));
    } finally {
      setBusy(false);
    }
  };

  // Once every visit is over: who knew them best, if the owner allows it (a 404 otherwise, and no button).
  const done = info?.me ? !info.me.start.ok && info.me.start.why === "done" : false;
  useEffect(() => {
    if (!done) return;
    void (async () => {
      try {
        const res = await fetch("/api/pilot?op=reveal", { headers: identityHeaders() });
        if (res.ok) setDebrief((await res.json()) as Debrief);
      } catch {
        // No debrief is a quiet page, not an error.
      }
    })();
  }, [done]);

  // Waiting for the owner's yes (C85): ask again every so often, and open when it comes. A request that
  // was turned down is gone, and the page goes back to the start with a word about it.
  const waiting = step === "ready" && info?.me?.waiting === true;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      void (async () => {
        const data = await load();
        if (data && !data.me) {
          setStep("intro");
          setError(t(lang, "pilot.group.declined"));
        }
      })();
    }, WAIT_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, load, lang]);

  const saveRating = async () => {
    if (!rating || rating.know === null) return;
    setBusy(true);
    setError(null);
    try {
      const axes = rating.know === 0 ? null : rating.axes;
      // What they think the friend would do (C76): none for someone they do not know, or with no idea.
      const predicted = rating.know === 0 || rating.noIdea ? null : rating.predicted;
      const res = await fetch("/api/pilot?op=rate", {
        method: "POST",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ ratee: rating.ratee, know: rating.know, axes, predicted }),
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

  /** A circle's code and link, made just now, to send. */
  const madeBox = made ? (
    <div data-pilot-circle-made className="mt-5 rounded-lg border border-parchment/20 px-4 py-3">
      <p className="text-[13px] leading-relaxed text-parchment/80">{made.after ? t(lang, "pilot.circle.madeAfter") : t(lang, "pilot.circle.made", { code: made.code })}</p>
      <p data-pilot-circle-link className="mt-2 break-all font-mono text-[13px] text-parchment">
        {made.link}
      </p>
      <button type="button" data-pilot-circle-copy onClick={() => void copyLink()} className={`${quiet} mt-2`}>
        {copied ? t(lang, "pilot.circle.copied") : t(lang, "pilot.circle.copy")}
      </button>
    </div>
  ) : null;

  if (step === "intro") {
    const circle = opens?.kind === "circle";
    // One of the owner's groups (C85): the study's words, under the group's name, and the owner's yes to wait for.
    const group = opens?.kind === "group" ? opens : null;
    const typed = code.replace(/[^a-z0-9]/gi, "").length >= 4;
    return page(
      <>
        <h1 className="font-serif text-4xl leading-tight">{group ? t(lang, "pilot.group.title", { name: group.name ?? "" }) : t(lang, circle ? "pilot.circle.title" : "pilot.title")}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-parchment/75">
          {circle ? t(lang, "pilot.circle.intro", { visits: opens!.visits }) : t(lang, (group?.visits ?? info?.sessions ?? 2) === 3 ? "pilot.intro3" : "pilot.intro")}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-parchment/55">{t(lang, circle ? "pilot.circle.kept" : "pilot.kept")}</p>
        {group ? <p className="mt-3 text-[13px] leading-relaxed text-parchment/55">{t(lang, "pilot.group.ask")}</p> : null}
        <p className="mt-3 text-[13px] leading-relaxed text-parchment/55">{t(lang, "pilot.sameBrowser")}</p>
        <label className="mt-6 block text-xs text-parchment/55">
          {t(lang, "pilot.code")}
          <input data-pilot-code value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 block w-full rounded-lg bg-white/10 px-3 py-2 text-[15px] text-parchment outline-none focus:bg-white/15" />
        </label>
        {typed && (info?.circles || info?.groups) ? (
          <p data-pilot-code-opens={opens === undefined ? "" : (opens?.kind ?? "none")} className="mt-1.5 text-[12px] text-parchment/55">
            {opens === undefined
              ? "\u00a0"
              : opens === null
                ? t(lang, "pilot.circle.unknown")
                : opens.kind === "group"
                  ? t(lang, "pilot.group.which", { name: opens.name ?? "", visits: opens.visits })
                  : opens.kind === "circle"
                    ? t(lang, "pilot.circle.which", { visits: opens.visits })
                    : t(lang, "pilot.circle.whichStudy")}
          </p>
        ) : null}
        {madeBox}
        <label className="mt-4 block text-xs text-parchment/55">
          {t(lang, "pilot.nickname")}
          <input data-pilot-nickname maxLength={24} value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-1 block w-full rounded-lg bg-white/10 px-3 py-2 text-[15px] text-parchment outline-none focus:bg-white/15" />
        </label>
        <label className="mt-5 flex items-start gap-3 text-[13px] leading-relaxed text-parchment/80">
          <input data-pilot-consent type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>{t(lang, circle ? "pilot.circle.consent" : "pilot.consent")}</span>
        </label>
        {circle ? (
          <label className="mt-3 flex items-start gap-3 text-[13px] leading-relaxed text-parchment/70">
            <input data-pilot-research type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} className="mt-1" />
            <span>{t(lang, "pilot.circle.research")}</span>
          </label>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            data-pilot-next
            disabled={!consent || !typed || !nickname.trim() || (opens === undefined && !checkFailed) || opens === null}
            onClick={() => setStep("self")}
            className={button}
          >
            {t(lang, "pilot.next")}
          </button>
          {info?.circles && !made ? (
            <button type="button" data-pilot-circle-start disabled={busy} onClick={() => void startCircle(false)} className={quiet}>
              {t(lang, "pilot.circle.start")}
            </button>
          ) : null}
        </div>
      </>,
    );
  }

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

  /** The six, asked of oneself (`q*`) or of a friend by name (`fq*`, C76). */
  const sixQuestions = (value: Stated, onChange: (next: Stated) => void, about: string | null) => {
    const set = <K extends keyof Stated>(k: K) => (v: Exclude<Stated[K], null>) => onChange({ ...value, [k]: v });
    const q = (own: Key, theirs: Key) => (about === null ? t(lang, own) : t(lang, theirs, { name: about }));
    const yesNo = [
      { value: true, label: t(lang, "pilot.yes") },
      { value: false, label: t(lang, "pilot.no") },
    ];
    return (
      <>
        <Choice id="give" question={q("pilot.qGive", "pilot.fqGive")} value={value.give} onChange={set("give")} options={([0, 1, 2, 3] as const).map((n) => ({ value: n, label: String(n) }))} />
        <Choice id="lend" question={q("pilot.qLend", "pilot.fqLend")} value={value.lend} onChange={set("lend")} options={yesNo} />
        <Choice
          id="bet"
          question={q("pilot.qBet", "pilot.fqBet")}
          value={value.bet}
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
          question={q("pilot.qSeed", "pilot.fqSeed")}
          value={value.seed}
          onChange={set("seed")}
          options={[
            { value: "now" as const, label: t(lang, "pilot.seedNow") },
            { value: "plant" as const, label: t(lang, "pilot.seedPlant") },
          ]}
        />
        <Choice
          id="path"
          question={q("pilot.qPath", "pilot.fqPath")}
          value={value.path}
          onChange={set("path")}
          options={[
            { value: "marked" as const, label: t(lang, "pilot.pathMarked") },
            { value: "unmarked" as const, label: t(lang, "pilot.pathUnmarked") },
          ]}
        />
        <Choice id="greet" question={q("pilot.qGreet", "pilot.fqGreet")} value={value.greet} onChange={set("greet")} options={yesNo} />
      </>
    );
  };

  if (step === "stated") {
    return page(
      <>
        <h2 className="font-serif text-2xl">{t(lang, "pilot.statedTitle")}</h2>
        <p className="mt-2 text-[13px] text-parchment/60">{t(lang, "pilot.statedBody")}</p>
        <div className="mt-4">{sixQuestions(stated, setStated, null)}</div>
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

  if (step === "ready" && me?.waiting) {
    return page(
      <div data-pilot-waiting>
        <h2 className="font-serif text-3xl">{t(lang, "pilot.hello", { name: me.nickname })}</h2>
        <p className="mt-1 text-xs uppercase tracking-wider text-parchment/45">{t(lang, "pilot.group.waitingTitle")}</p>
        <p className="mt-4 text-[15px] leading-relaxed text-parchment/75">{t(lang, "pilot.group.waiting", { name: me.groupName ?? "" })}</p>
      </div>,
    );
  }

  if (step === "ready" && me) {
    const start = me.start;
    return page(
      <>
        <h2 className="font-serif text-3xl">{t(lang, "pilot.hello", { name: me.nickname })}</h2>
        {me.groupName ? <p data-pilot-group className="mt-1 text-xs uppercase tracking-wider text-parchment/45">{me.groupName}</p> : null}
        {start.ok ? (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-parchment/75">{t(lang, start.n === 1 ? "pilot.readyFirst" : start.n === 2 ? "pilot.readySecond" : "pilot.readyThird")}</p>
            <div className="mt-6 flex items-center gap-4">
              <button type="button" data-pilot-begin disabled={busy} onClick={() => void begin()} className={button}>
                {t(lang, "pilot.begin", { n: start.n })}
              </button>
              {rateLink}
            </div>
          </>
        ) : start.why === "too_soon" ? (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-parchment/75">{t(lang, me.sessions.length + 1 === 3 ? "pilot.tooSoonThird" : "pilot.tooSoon", { at: start.at ? new Date(start.at).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" }) : "" })}</p>
            <div className="mt-6">{rateLink}</div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-parchment/75">{t(lang, (info?.sessions ?? 2) === 3 ? "pilot.allDone3" : "pilot.allDone")}</p>
            <div className="mt-6 flex items-center gap-4">
              {debrief?.ready ? (
                <button type="button" data-pilot-reveal-open onClick={() => setStep("reveal")} className={button}>
                  {t(lang, "pilot.reveal.open")}
                </button>
              ) : null}
              {rateLink}
            </div>
            {info?.circles && !made ? (
              <button type="button" data-pilot-circle-again disabled={busy} onClick={() => void startCircle(true)} className={`${quiet} mt-6`}>
                {t(lang, "pilot.circle.again")}
              </button>
            ) : null}
            {madeBox}
          </>
        )}
      </>,
    );
  }

  if (step === "reveal" && debrief?.ready) return page(<PilotReveal debrief={debrief} lang={lang} onBack={() => setStep("ready")} />);

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
            <>
              <div className="mt-4">
                <p className="text-[13px] text-parchment/60">{t(lang, "pilot.rateBody", { name: rating.ratee })}</p>
                {PERSONA_AXIS_KEYS.map((axis, i) => (
                  <Scale key={axis} axis={axis} lang={lang} value={rating.axes[i] ?? null} onChange={(v) => setRating({ ...rating, axes: rating.axes.map((x, j) => (j === i ? v : x)) })} />
                ))}
              </div>
              <div data-pilot-predict className="mt-6">
                <h3 className="font-serif text-xl">{t(lang, "pilot.predTitle", { name: rating.ratee })}</h3>
                <p className="mt-1 text-[13px] text-parchment/60">{t(lang, "pilot.predBody", { name: rating.ratee })}</p>
                <label className="mt-3 flex items-center gap-2 text-[13px] text-parchment/75">
                  <input data-pilot-no-idea type="checkbox" checked={rating.noIdea} onChange={(e) => setRating({ ...rating, noIdea: e.target.checked })} />
                  <span>{t(lang, "pilot.predSkip")}</span>
                </label>
                {rating.noIdea ? null : <div className="mt-2">{sixQuestions(rating.predicted, (predicted) => setRating({ ...rating, predicted }), rating.ratee)}</div>}
              </div>
            </>
          ) : null}
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              data-pilot-rate-save
              disabled={
                busy ||
                rating.know === null ||
                (rating.know > 0 && rating.axes.some((x) => x === null)) ||
                (rating.know > 0 && !rating.noIdea && Object.values(rating.predicted).some((v) => v === null))
              }
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
                <button
                  type="button"
                  data-pilot-rate={g.nickname}
                  onClick={() => setRating({ ratee: g.nickname, know: null, axes: PERSONA_AXIS_KEYS.map(() => null), predicted: { give: null, lend: null, bet: null, seed: null, path: null, greet: null }, noIdea: false })}
                  className={quiet}
                >
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
        {next && !next.ok && next.why === "done" ? t(lang, (info?.sessions ?? 2) === 3 ? "pilot.allDone3" : "pilot.allDone") : t(lang, me && me.sessions.length === 2 ? "pilot.comeBackThird" : "pilot.comeBack")}
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
