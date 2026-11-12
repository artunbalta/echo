"use client";

/**
 * The envelopes (DECISIONS C89): what the echo sealed about the stranger before each moment they met,
 * opened when they choose, beside what they did.
 *
 * WHY. A visit used to end with nothing in the visitor's hands. The echo learned, and said nothing of
 * what it expected until a debrief three visits in, and only in the study. Here every moment of the
 * village gets a call before it can be seen (`lib/knowable/calls.ts`), sealed in a chain
 * (`seal.ts`), and the visitor opens them: this many right, this many a know-nothing guess would have
 * got, and how it did where it had seen them before against where it had not. That last line is the
 * research's claim, made on the person reading it.
 *
 * NEVER A PROMPT (Law 2). Nothing here marks a moment as it begins: the seal is silent, and the small
 * envelope under the meter counts only moments already over. Opening is the visitor's own act: the
 * envelope, the menu, `O`, or the way out.
 *
 * NOT IN THE STUDY (C75). A pilot visit seals nothing and shows nothing: what a participant sees of
 * themselves afterwards cannot shape what they did before, and the pilot's debrief is its own.
 *
 * NOTHING LEAVES THE BROWSER UNASKED. The calls, the outcomes and the person's own words are kept in
 * localStorage (`envelopes.ts`) and are theirs to erase from the panel. So this works whether or not
 * the engine, the store or anything else behind the page is up.
 *
 * THE VILLAGE'S COUNT (C91) is one of two things that can leave, and only where the owner has switched it
 * on and the person has said yes to a sentence that names it: what they did at each moment, under a
 * random id made for that alone, so the next stranger's echo starts from what people do. Where it is
 * on, what most people did is sealed beside the echo's call and opened with it.
 *
 * A TWIN FROM THE PERSON'S WORDS (C93) is the other, and only where there is a model to build one
 * (`/api/twin` says so; where it does not, nothing here speaks of it). The person may write a
 * paragraph about themselves; one press sends it, once, to a language model, which says what they will
 * do at every moment; those calls are sealed beside the echo's and opened with it. The view says, above
 * the button, where the paragraph goes and that it is not kept, because the consent card promised the
 * echo notices "never what you type": the echo never reads it, and the paragraph is held in the view's
 * own state and nowhere else. Only the twin's calls are kept, with the envelopes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ConsentState } from "@/game/world/measure";
import type { MomentsLayer } from "@/game/world/momentsLayer";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import { t, useLang, type Key, type Lang } from "@/lib/i18n";
import { FAMILY_NAMES, tally, type Family, type Said, type Words } from "@/lib/knowable/calls";
import { ROWS_MAX, type Crowd } from "@/lib/knowable/crowd";
import { readTwin, TWIN_TEXT, type Twin } from "@/lib/knowable/twin";
import { asOpened, BOOK_KEY, emptyBook, markSent, openAll, opened, sealMoment, settle, unsent, waiting, type Book, type Envelope } from "@/lib/knowable/envelopes";
import { ADDING_KEY, eraseFromCount, VISITOR_KEY } from "@/lib/knowable/erase";
import { FORGET_EVENT, keeper, numberer, refOf, type Keeper } from "@/lib/knowable/keeper";
import { encodeGuess, GUESS_MIN, pickForFriend } from "@/lib/knowable/guessLink";
import { sawLines } from "@/lib/knowable/saw";
import { momentWords, outcomeWords } from "@/lib/knowable/say";
import { brokenAt } from "@/lib/knowable/seal";
import { step } from "@/lib/steps";

/** How often to look for the layer while the world is still being built. */
const LOOK_MS = 1500;
/** Waiting envelopes before the page says, once, that there are any. */
const NUDGE_AT = 4;
const NUDGE_MS = 9000;
/** Waiting envelopes that make the way out stop and ask. */
const LEAVING_AT = 3;
/** The village's count (C91): how long new rows wait to go. Its two keys are `erase.ts`'s, which is what clears them. */
const SEND_MS = 15_000;

const kept = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const keep = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // kept for this page only
  }
};
/** A random id for the count alone: never the echo's subject, and in no other request. */
const newVisitor = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => (b % 36).toString(36)).join("");

const noFocus = (e: React.MouseEvent) => e.preventDefault();
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

export interface Envelopes {
  book: Book;
  /** Settled and not yet opened. */
  ready: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** One change to the record, after every change before it. */
  apply: (step: (b: Book) => Book | Promise<Book>) => void;
  /**
   * The village's count (C91): whether the owner has it on, whether this person adds to it, and whether
   * rows of theirs are still in it though they add no more (`left`): the count was switched off since,
   * or could not be reached when they asked for them to go. Theirs to remove, for as long as the id is kept.
   */
  count: { on: boolean; adding: boolean; left: boolean };
  /** An erasure ended the keeping on this page: nothing more is sealed until it is walked into again. */
  stopped: boolean;
  /** A twin from the person's words (C93): whether there is a model here to build one. */
  twinOn: boolean;
  /** Say yes or no to adding to the count; no also removes what was added. False if it could not be removed. */
  setAdding: (yes: boolean) => Promise<boolean>;
  /**
   * Erase everything: the envelopes and words here, and this person's rows in the count. The record here
   * goes either way; false if the count's rows could not be removed (`count.left` then says so).
   */
  forgetAll: () => Promise<boolean>;
}

/**
 * The page's record of the echo's calls: sealed as each moment begins, settled as each seen one ends.
 * `on` is false in a pilot visit; without consent nothing is sealed either. `countable` is false in a
 * demo visit: a guest on someone else's machine must not add to the count on the strength of a yes
 * the machine's owner once gave.
 */
export function useEnvelopes(world: () => PlanetWorld | null, consent: ConsentState, on: boolean, cell: string, countable: boolean = true): Envelopes {
  const worldRef = useRef(world);
  worldRef.current = world;
  const cellRef = useRef(cell);
  cellRef.current = cell;
  const countableRef = useRef(countable);
  countableRef.current = countable;
  const [stopped, setStopped] = useState(false);
  const [counting, setCounting] = useState(false);
  const [adding, setAddingState] = useState(false);
  const crowd = useRef<Crowd | null>(null);
  const [twinOn, setTwinOn] = useState(false);
  const [left, setLeft] = useState(false);
  const [book, setBook] = useState<Book>(emptyBook);
  const [open, setOpen] = useState(false);
  // The record's keeper (`keeper.ts`): made once the page is in a browser, since it reads what was kept.
  const keeping = useRef<Keeper | null>(null);
  // A layer numbers its moments from zero, on every page and in every world a raft crosses into, so a
  // moment is named with its page and with which of the page's layers it came from.
  const page = useRef("");
  const [numberOf] = useState(numberer);

  useEffect(() => {
    page.current = Date.now().toString(36);
    const k = keeper(setBook);
    keeping.current = k;
    setBook(k.book());
    // An erasure anywhere on the page (the mirror, the demo's end): the record goes, and nothing more is kept.
    const erased = () => {
      setStopped(true);
      void k.forget({ stop: true });
    };
    // And one in another tab of this browser. A village left open there held the whole record in memory
    // and wrote it back at its next moment, so an erasure lasted until something happened elsewhere.
    // The record's key going (or the whole store being cleared, which names no key) is how this tab hears of it.
    const elsewhere = (e: StorageEvent) => {
      if (e.key === BOOK_KEY ? e.newValue === null : e.key === null && kept(BOOK_KEY) === null) erased();
    };
    window.addEventListener(FORGET_EVENT, erased);
    window.addEventListener("storage", elsewhere);
    return () => {
      window.removeEventListener(FORGET_EVENT, erased);
      window.removeEventListener("storage", elsewhere);
    };
  }, []);

  const apply = useCallback((step: (b: Book) => Book | Promise<Book>) => {
    void keeping.current?.apply(step);
  }, []);

  useEffect(() => {
    if (!on || consent !== "accepted") return;
    let layer: MomentsLayer | null = null;
    const hook = () => {
      const l = worldRef.current()?.context().layer<MomentsLayer>("moments") ?? null;
      if (!l || l === layer) return;
      layer = l;
      const from = numberOf(l);
      // Where it is sealed goes with it: a raft may cross before it is sent, and a demo's are never sent.
      l.onBegan((m) =>
        apply((b) => sealMoment(b, { ref: refOf(page.current, from, m.ref), kind: m.kind, arm: m.arm }, new Date().toISOString(), crowd.current, { cell: cellRef.current, here: !countableRef.current })),
      );
      l.onOver((row) => {
        if (row.lane !== "errand") apply((b) => settle(b, { ref: refOf(page.current, from, row.ref), kind: row.kind, outcome: row.outcome }));
      });
    };
    hook();
    const timer = setInterval(hook, LOOK_MS);
    return () => {
      clearInterval(timer);
      layer?.onBegan(null);
      layer?.onOver(null);
    };
  }, [on, consent, apply, numberOf]);

  // `O`, the menu's line, and anything else that asks.
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => {
      if (e.code === "KeyO" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) setOpen((o) => !o);
      else if (e.code === "Escape") setOpen(false);
    };
    const ask = () => setOpen(true);
    window.addEventListener("keydown", key);
    window.addEventListener("echo:envelopes", ask);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("echo:envelopes", ask);
    };
  }, [on]);

  // The village's count: asked for once, and silent wherever it is switched off or cannot be reached.
  useEffect(() => {
    if (!on || !countable) return;
    let live = true;
    fetch("/api/calls")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { on?: boolean; crowd?: Crowd } | null) => {
        if (!live) return;
        // An id still kept means rows may still be in the count: theirs to remove, whether the count
        // has been switched off since or a removal they asked for never reached it.
        const id = !!kept(VISITOR_KEY);
        if (!d?.on) return setLeft(id);
        const yes = id && kept(ADDING_KEY) === "1";
        crowd.current = d.crowd ?? null;
        setCounting(true);
        setAddingState(yes);
        setLeft(id && !yes);
      })
      .catch(() => {
        // No count: every call is made as it would be with nobody before you.
        if (live) setLeft(!!kept(VISITOR_KEY));
      });
    return () => {
      live = false;
    };
  }, [on, countable]);

  // A twin from words (C93): asked once whether one can be made here, and silent wherever it cannot.
  useEffect(() => {
    if (!on) return;
    let live = true;
    fetch("/api/twin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { on?: boolean } | null) => {
        if (live && d?.on === true) setTwinOn(true);
      })
      .catch(() => {
        // No model: the envelopes are as they were.
      });
    return () => {
      live = false;
    };
  }, [on]);

  const send = useCallback(
    (closing = false) => {
      const visitor = kept(VISITOR_KEY);
      // Only on a yes that still stands in the browser: another tab may have taken it back since.
      if (kept(ADDING_KEY) !== "1") return;
      const rows = unsent(keeping.current?.book() ?? emptyBook(), cellRef.current).slice(0, ROWS_MAX);
      if (!visitor || rows.length === 0) return;
      void fetch("/api/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visitor, rows }), keepalive: closing })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { taken?: string[]; refused?: string[] } | null) => {
          // A row the count will not take is not offered again: it would only hold the others back.
          const done = [...(d?.taken ?? []), ...(d?.refused ?? [])];
          if (done.length) apply((b) => markSent(b, done));
        })
        .catch(() => {
          // Not taken this time: they go with the next.
        });
    },
    [apply],
  );

  // New settled envelopes go a little after they settle, and once more as the page closes.
  const waitingToGo = useMemo(() => unsent(book, "").length, [book]);
  useEffect(() => {
    if (!on || !counting || !adding || consent !== "accepted" || waitingToGo === 0) return;
    const id = setTimeout(() => send(), SEND_MS);
    const closing = () => send(true);
    window.addEventListener("pagehide", closing);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pagehide", closing);
    };
  }, [on, counting, adding, consent, waitingToGo, send]);

  /**
   * Take this person's rows out of the count, and only then let go of the id they are under: an id
   * cleared first would leave rows nobody could ask to have removed. Adding stops either way.
   */
  const remove = useCallback(async (): Promise<boolean> => {
    setAddingState(false);
    const left = (await eraseFromCount()) === "left";
    // Still there: the panel goes on saying so, and offering to remove them, until they are gone.
    setLeft(left);
    return !left;
  }, []);

  const setAdding = useCallback(
    async (yes: boolean): Promise<boolean> => {
      if (!yes) {
        const gone = await remove();
        // Taken back: nothing here counts as added any more.
        if (gone) apply((b) => ({ ...b, chain: b.chain.map((e) => (e.sent ? { ...e, sent: false } : e)) }));
        return gone;
      }
      if (!kept(VISITOR_KEY)) keep(VISITOR_KEY, newVisitor());
      keep(ADDING_KEY, "1");
      setAddingState(true);
      setLeft(false);
      return true;
    },
    [apply, remove],
  );

  const forgetAll = useCallback(async (): Promise<boolean> => {
    // The count first, while its id is in hand. If it cannot be reached the id is kept, so the rows can
    // still be removed, and the panel says they are there.
    const gone = await remove();
    // The record goes either way, here and in the browser: it was only ever here, and holding it back
    // until a server answers would make an erasure wait on something it never depended on. The echo
    // goes on watching, and starts again from nothing.
    await keeping.current?.forget();
    return gone;
  }, [remove]);

  const ready = useMemo(() => waiting(book).length, [book]);
  // How far people come (C92): a first moment met and settled on this page.
  useEffect(() => {
    if (on && ready > 0) step("met");
  }, [on, ready]);
  return { book, ready, open, setOpen, apply, count: { on: counting, adding: counting && adding, left: left && !(counting && adding) }, stopped, twinOn, setAdding, forgetAll };
}

/** The small envelope under the meter: how many are waiting. It counts only moments already over. */
export function EnvelopeChip({ env }: { env: Envelopes }) {
  const lang = useLang();
  if (env.ready < 1) return null;
  return (
    <button
      type="button"
      data-envelopes-chip={env.ready}
      aria-label={t(lang, "env.chip", { n: env.ready })}
      title={t(lang, "env.chip", { n: env.ready })}
      onMouseDown={noFocus}
      onClick={() => env.setOpen(true)}
      className="hud-in pointer-events-auto mt-0.5 flex w-fit items-center gap-1.5 rounded-full bg-ink-deep/45 px-2.5 py-1 text-[11px] tabular-nums text-parchment/80 transition-colors hover:text-parchment"
    >
      <svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" aria-hidden="true">
        <rect x="0.6" y="0.6" width="13.8" height="9.8" rx="1.2" />
        <path d="M0.9 1 7.5 6l6.6-5" />
        <circle cx="7.5" cy="6.4" r="1.7" fill="#a06cd5" stroke="none" />
      </svg>
      {env.ready}
    </button>
  );
}

const WORD_KEYS: Record<Family, Key> = {
  help: "env.words.help",
  honesty: "env.words.honesty",
  courtesy: "env.words.courtesy",
  conformity: "env.words.conformity",
  order: "env.words.order",
  curiosity: "env.words.curiosity",
};
const SAID: readonly Said[] = ["yes", "depends", "no"];

/** What stood behind a call, in a line. */
function basis(lang: Lang, e: Envelope): string {
  if (e.looks.same > 0) return e.looks.same === 1 ? t(lang, "env.same1") : t(lang, "env.same", { n: e.looks.same });
  if (e.looks.family > 0) return e.looks.family === 1 ? t(lang, "env.family1") : t(lang, "env.family", { n: e.looks.family });
  return e.looks.anywhere > 0 ? t(lang, "env.anywhere") : t(lang, "env.first");
}

function Row({ e, lang, i }: { e: Envelope; lang: Lang; i: number }) {
  const words = momentWords(lang, e.kind, e.arm);
  const hit = e.call === e.did;
  const time = new Date(e.at).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB");
  return (
    <li data-envelope={hit ? "hit" : "miss"} className="hud-in flex items-start gap-3 py-3" style={{ animationDelay: `${Math.min(i, 12) * 110}ms` }}>
      <span aria-hidden="true" className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${hit ? "bg-echo" : "border border-parchment/35"}`} />
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[15px] leading-snug text-parchment">
          {words.name}
          {words.arm ? <span className="text-parchment/50"> · {words.arm}</span> : null}
        </p>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px] leading-snug">
          <dt className="text-parchment/45">{t(lang, "env.said")}</dt>
          <dd className="text-parchment/85">{outcomeWords(lang, e.kind, e.call)}</dd>
          <dt className="text-parchment/45">{t(lang, "env.did")}</dt>
          <dd className="text-parchment">{outcomeWords(lang, e.kind, e.did!)}</dd>
          {e.crowd ? (
            <>
              <dt className="text-parchment/45">{t(lang, "env.most")}</dt>
              <dd className="text-parchment/60">{outcomeWords(lang, e.kind, e.crowd)}</dd>
            </>
          ) : null}
        </dl>
        {e.twin ? (
          <p data-envelope-twin={e.twin === e.did ? "hit" : "miss"} className="mt-0.5 text-[13px] leading-snug text-parchment/60">
            {t(lang, "env.twin.said", { what: outcomeWords(lang, e.kind, e.twin) })}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-parchment/40">
          {basis(lang, e)} <span className="tabular-nums">· {t(lang, "env.sealedAt", { time })}</span>
        </p>
      </div>
    </li>
  );
}

/**
 * The paragraph, and the one press that sends it (C93). What is typed lives in this view's own state
 * and nowhere else: not in the record, not in the browser's storage, and it is gone when the view
 * closes. The sentence above the button is the consent, said where the typing is.
 */
export function TwinWords({ lang, onMade, onBack }: { lang: Lang; onMade: (twin: Twin) => void; onBack: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const n = text.trim().length;
  const ready = n >= TWIN_TEXT.min && n <= TWIN_TEXT.max;

  const send = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/twin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.trim() }) });
      const d = res.ok ? ((await res.json()) as { model?: unknown; calls?: unknown }) : null;
      // Read again here as the server read it: only a real ending of a real situation is kept.
      const twin = d ? readTwin({ at: new Date().toISOString(), model: d.model, calls: d.calls }) : null;
      if (!twin) {
        setNote(t(lang, res.status === 429 ? "env.twin.limit" : "env.twin.failed"));
        return;
      }
      setText("");
      onMade(twin);
    } catch {
      setNote(t(lang, "env.twin.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-twin-view className="min-h-0 overflow-y-auto px-5 pb-5">
      <p className="mt-1.5 text-[13px] leading-relaxed text-parchment/60">{t(lang, "env.twin.lead")}</p>
      <textarea
        data-twin-text
        aria-label={t(lang, "env.twin.title")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={TWIN_TEXT.max}
        rows={5}
        disabled={busy}
        placeholder={t(lang, "env.twin.placeholder")}
        className="mt-3 block w-full resize-none rounded-lg border border-parchment/15 bg-transparent px-3.5 py-2.5 text-[14px] leading-relaxed text-parchment placeholder:text-parchment/35 focus:border-parchment/40 focus:outline-none disabled:opacity-60"
      />
      <p className="mt-1 flex justify-between gap-3 text-[11px] tabular-nums text-parchment/40">
        <span>{n > 0 && n < TWIN_TEXT.min ? t(lang, "env.twin.short", { min: TWIN_TEXT.min }) : ""}</span>
        <span>
          {n} / {TWIN_TEXT.max}
        </span>
      </p>
      <p data-twin-consent className="mt-3 text-[12px] leading-relaxed text-parchment/75">
        {t(lang, "env.twin.consent")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-twin-send
          disabled={busy || !ready}
          onClick={() => void send()}
          className="rounded-full bg-parchment px-4 py-2 text-[13px] font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {t(lang, busy ? "env.twin.sending" : "env.twin.send")}
        </button>
        <button type="button" data-twin-back disabled={busy} onClick={onBack} className="rounded-full border border-parchment/20 px-4 py-2 text-[13px] text-parchment/75 transition-colors hover:border-parchment/40 hover:text-parchment disabled:opacity-40">
          {t(lang, "env.twin.back")}
        </button>
      </div>
      {note ? (
        <p data-twin-note className="mt-3 text-[12px] leading-relaxed text-echo-soft">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** The opening: the envelopes, the count, the person's own words, and their say over all of it. */
export function EnvelopesPanel({ env, consent }: { env: Envelopes; consent: ConsentState }) {
  const lang = useLang();
  const { book, apply, open, setOpen } = env;
  // What was waiting as the panel opened: shown first, and then marked opened in the record.
  const [fresh, setFresh] = useState<string[]>([]);
  const [view, setView] = useState<"envelopes" | "words" | "twin">("envelopes");
  const [draft, setDraft] = useState<Words>({});
  const [note, setNote] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [name, setName] = useState("");
  const noteAt = useRef<HTMLParagraphElement>(null);

  // What the panel has just said is brought into view: after the paragraph is sent the list is back at its top.
  useEffect(() => {
    if (note && view === "envelopes") noteAt.current?.scrollIntoView({ block: "nearest" });
  }, [note, view]);

  useEffect(() => {
    if (!open) return;
    setFresh(waiting(book).map((e) => e.ref));
    if (book.chain.some((e) => e.did !== null)) step("opened");
    setView("envelopes");
    setNote(null);
    setSure(false);
    apply(openAll);
    try {
      setName(localStorage.getItem("echo.name") ?? "");
    } catch {
      // no name kept
    }
    // Only as it opens: envelopes that settle while it is open wait for the next opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const all = opened(book);
  const now = all.filter((e) => fresh.includes(e.ref));
  const before = all.filter((e) => !fresh.includes(e.ref));
  const count = tally(now.map(asOpened));
  const whole = tally(all.map(asOpened));
  const firsts = all.filter((e) => e.looks.same === 0);
  const seen = all.filter((e) => e.looks.same > 0);
  const right = (es: Envelope[]) => es.filter((e) => e.call === e.did).length;
  // The record said back as counts of what happened (`saw.ts`): the whole of it, not only this opening.
  const saw = sawLines(lang, all.map((e) => ({ kind: e.kind, outcome: e.did! })));

  const share = async () => {
    const items = pickForFriend(all);
    if (items.length < GUESS_MIN) {
      setNote(t(lang, "env.friend.few"));
      return;
    }
    const url = `${window.location.origin}/guess#${encodeGuess({ v: 1, n: name.trim(), items })}`;
    try {
      if (name.trim()) localStorage.setItem("echo.name", name.trim());
    } catch {
      // kept for this link only
    }
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    try {
      if (nav.share && window.matchMedia("(pointer: coarse)").matches) await nav.share({ url });
      else await navigator.clipboard.writeText(url);
      step("linked");
      setNote(t(lang, "env.friend.copied"));
    } catch {
      // The share sheet was closed, or the clipboard is not ours to write: the link is shown instead.
      setNote(url);
    }
  };

  const check = async () => {
    const at = await brokenAt(book.chain);
    setNote(at === null ? t(lang, "env.whole", { n: book.chain.length }) : t(lang, "env.broken", { n: book.chain[at]!.n + 1 }));
  };

  const link = "underline decoration-parchment/25 underline-offset-2 hover:text-parchment hover:decoration-parchment/60";
  // The six lines until they are given; the paragraph where a twin can be made and none has been.
  // Unwatched, nothing is sealed, so a twin would have nothing to be sealed beside: it is not offered.
  const offerWords = !book.words;
  const offerTwin = env.twinOn && !book.twin && consent === "accepted";
  const offer = "rounded-full border border-parchment/25 px-3.5 py-1.5 text-[12px] text-parchment/85 transition-colors hover:border-parchment/50 hover:text-parchment";

  return (
    <div data-envelopes-panel className="absolute left-1/2 top-14 z-[45] flex max-h-[calc(100%-5rem)] w-[min(540px,94vw)] -translate-x-1/2 flex-col">
      <div className="hud-pop hud-in flex min-h-0 flex-col">
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          <h2 className="font-serif text-[20px] leading-tight text-parchment">{t(lang, view === "words" ? "env.words.title" : view === "twin" ? "env.twin.title" : "env.title")}</h2>
          <button type="button" data-envelopes-close aria-label={t(lang, "env.close")} onMouseDown={noFocus} onClick={() => setOpen(false)} className="hud-btn -mr-1.5 -mt-1 h-8 min-w-8">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" />
            </svg>
          </button>
        </div>

        {view === "twin" ? (
          <TwinWords
            lang={lang}
            onMade={(twin) => {
              apply((b) => ({ ...b, twin }));
              setView("envelopes");
              setNote(t(lang, "env.twin.given"));
            }}
            onBack={() => setView("envelopes")}
          />
        ) : view === "words" ? (
          <div className="min-h-0 overflow-y-auto px-5 pb-5">
            <p className="mt-1.5 text-[13px] leading-relaxed text-parchment/60">{t(lang, "env.words.lead")}</p>
            <ul className="mt-3 space-y-3">
              {FAMILY_NAMES.map((f) => (
                <li key={f} data-words={f}>
                  <p className="text-[14px] leading-snug text-parchment/90">{t(lang, WORD_KEYS[f])}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    {SAID.map((s) => (
                      <button
                        key={s}
                        type="button"
                        data-said={s}
                        aria-pressed={draft[f] === s}
                        onClick={() => setDraft((d) => ({ ...d, [f]: s }))}
                        className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${draft[f] === s ? "border-parchment bg-parchment text-ink" : "border-parchment/20 text-parchment/70 hover:border-parchment/40 hover:text-parchment"}`}
                      >
                        {t(lang, `env.words.${s}`)}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              data-words-save
              disabled={Object.keys(draft).length === 0}
              onClick={() => {
                apply((b) => ({ ...b, words: draft }));
                step("worded");
                setView("envelopes");
                setNote(t(lang, "env.words.given"));
              }}
              className="mt-4 rounded-full bg-parchment px-4 py-2 text-[13px] font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {t(lang, "env.words.save")}
            </button>
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto px-5 pb-4">
            {all.length === 0 ? (
              <p data-envelopes-empty className="mt-2 pb-2 text-[13px] leading-relaxed text-parchment/60">
                {t(lang, env.stopped ? "env.stopped" : consent === "accepted" ? "env.none" : "env.off")}
              </p>
            ) : (
              <>
                <p className="mt-1.5 text-[13px] leading-relaxed text-parchment/60">{t(lang, "env.lead")}</p>

                {now.length > 0 ? (
                  <>
                    <ul className="mt-1 divide-y divide-parchment/[0.07]">
                      {now.map((e, i) => (
                        <Row key={e.ref} e={e} lang={lang} i={i} />
                      ))}
                    </ul>
                    <p data-envelopes-count className="mt-2 border-t border-parchment/10 pt-3 font-serif text-[16px] leading-snug text-parchment">
                      {/* What a know-nothing guess would expect is said only once it is a whole envelope: of one
                          or two it rounds to "about 0", which reads as a claim and is only arithmetic. */}
                      {Math.round(count.chance) >= 1 ? t(lang, "env.count", { echo: count.echo, n: count.n, chance: Math.round(count.chance) }) : t(lang, "env.count.few", { echo: count.echo, n: count.n })}
                    </p>
                  </>
                ) : null}

                {saw.length > 0 ? (
                  <div data-envelopes-saw className="mt-3 border-l-2 border-echo/50 pl-3.5">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-parchment/45">{t(lang, "env.saw")}</p>
                    <ul className="mt-1 space-y-1">
                      {saw.map((line) => (
                        <li key={line} className="font-serif text-[15px] leading-snug text-parchment/90">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-parchment/70">
                  {before.length > 0 ? <p data-envelopes-all>{t(lang, "env.all", { echo: whole.echo, n: whole.n })}</p> : null}
                  {firsts.length > 0 && seen.length > 0 ? <p data-envelopes-curve>{t(lang, "env.curve", { a: right(firsts), b: firsts.length, c: right(seen), d: seen.length })}</p> : null}
                  {whole.both.n > 0 ? <p data-envelopes-words>{t(lang, "env.words.count", { n: whole.both.n, words: whole.both.words, echo: whole.both.echo })}</p> : null}
                  {whole.crowd.n > 0 ? <p data-envelopes-crowd>{t(lang, "env.crowd.count", { n: whole.crowd.n, crowd: whole.crowd.crowd, echo: whole.crowd.echo })}</p> : null}
                  {whole.twin.n > 0 ? <p data-envelopes-twin>{t(lang, "env.twin.count", { n: whole.twin.n, twin: whole.twin.twin, echo: whole.twin.echo })}</p> : null}
                  <p className="text-parchment/50">{t(lang, "env.again")}</p>
                </div>

                {offerWords || offerTwin ? (
                  <div className="mt-3 rounded-lg bg-parchment/[0.05] px-3.5 py-3">
                    <p className="text-[13px] leading-relaxed text-parchment/80">
                      {offerWords ? t(lang, "env.words.offer") : null}
                      {offerWords && offerTwin ? " " : null}
                      {offerTwin ? <span data-twin-offer>{t(lang, "env.twin.offer")}</span> : null}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {offerWords ? (
                        <button type="button" data-words-open onClick={() => setView("words")} className={offer}>
                          {t(lang, "env.words.open")}
                        </button>
                      ) : null}
                      {offerTwin ? (
                        <button type="button" data-twin-open onClick={() => setView("twin")} className={offer}>
                          {t(lang, "env.twin.open")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    data-friend-name
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder={t(lang, "env.friend.name")}
                    className="h-9 min-w-[11rem] flex-1 rounded-full border border-parchment/15 bg-transparent px-3.5 text-[13px] text-parchment placeholder:text-parchment/35 focus:border-parchment/40 focus:outline-none"
                  />
                  <button type="button" data-friend-link onClick={() => void share()} className="h-9 rounded-full bg-parchment px-4 text-[13px] font-medium text-ink transition-opacity hover:opacity-90">
                    {t(lang, "env.friend")}
                  </button>
                </div>

                {before.length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12px] text-parchment/55 hover:text-parchment/80">{t(lang, "env.earlier", { n: before.length })}</summary>
                    <ul className="divide-y divide-parchment/[0.07]">
                      {before
                        .slice(-40)
                        .reverse()
                        .map((e) => (
                          <Row key={e.ref} e={e} lang={lang} i={0} />
                        ))}
                    </ul>
                  </details>
                ) : null}
              </>
            )}

            {note ? (
              <p ref={noteAt} data-envelopes-note className="mt-3 break-words text-[12px] leading-relaxed text-echo-soft">
                {note}
              </p>
            ) : null}

            {env.count.left ? (
              // Rows of theirs are in the count and they add no more (it was switched off, or could not be
              // reached when they asked): what they added is still theirs to remove, and this says so.
              <p data-envelopes-counting="left" className="mt-3 text-[12px] leading-relaxed text-parchment/60">
                {t(lang, "env.crowd.left")}{" "}
                <button type="button" data-envelopes-adding onClick={() => void env.setAdding(false).then((ok) => setNote(ok ? null : t(lang, "env.crowd.stuck")))} className={link}>
                  {t(lang, "env.crowd.remove")}
                </button>
              </p>
            ) : null}

            {env.count.on && !env.count.left ? (
              <p data-envelopes-counting={env.count.adding ? "adding" : "asked"} className="mt-3 text-[12px] leading-relaxed text-parchment/60">
                {t(lang, env.count.adding ? "env.crowd.on" : "env.crowd.offer")}{" "}
                <button
                  type="button"
                  data-envelopes-adding
                  onClick={() => void env.setAdding(!env.count.adding).then((ok) => setNote(ok ? null : t(lang, "env.crowd.stuck")))}
                  className={link}
                >
                  {t(lang, env.count.adding ? "env.crowd.stop" : "env.crowd.add")}
                </button>
              </p>
            ) : null}

            {book.twin ? (
              <p data-twin-on className="mt-3 text-[12px] leading-relaxed text-parchment/60">
                {t(lang, "env.twin.on", { time: new Date(book.twin.at).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}{" "}
                <button
                  type="button"
                  data-twin-remove
                  onClick={() => {
                    apply((b) => ({ ...b, twin: null }));
                    setNote(t(lang, "env.twin.removed"));
                  }}
                  className={link}
                >
                  {t(lang, "env.twin.remove")}
                </button>
                {book.twin.model ? <span className="whitespace-nowrap text-parchment/40"> · {book.twin.model}</span> : null}
              </p>
            ) : null}

            <p className="mt-3 text-[11px] leading-relaxed text-parchment/40">
              {t(lang, env.count.adding || env.count.left ? "env.kept.count" : "env.kept")}{" "}
              {book.chain.length > 0 ? (
                <>
                  <button type="button" data-envelopes-check onClick={() => void check()} className={link}>
                    {t(lang, "env.check")}
                  </button>
                  {" · "}
                  {sure ? (
                    <>
                      {t(lang, "env.forget.sure")}{" "}
                      <button
                        type="button"
                        data-envelopes-forget-yes
                        onClick={() =>
                          void env.forgetAll().then((ok) => {
                            setSure(false);
                            setFresh([]);
                            setNote(ok ? null : t(lang, "env.forget.left"));
                          })
                        }
                        className={`${link} text-danger`}
                      >
                        {t(lang, "env.forget.yes")}
                      </button>
                    </>
                  ) : (
                    <button type="button" data-envelopes-forget onClick={() => setSure(true)} className={link}>
                      {t(lang, "env.forget")}
                    </button>
                  )}
                </>
              ) : null}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The two times the page speaks of the envelopes unasked: once when a few are waiting, in a line at the
 * foot of the world, and on the way out, if some were never opened. Both are about moments already over.
 */
export function EnvelopeAsides({ env, coarse, leaving, onStay, onLeave }: { env: Envelopes; coarse: boolean; leaving: boolean; onStay: () => void; onLeave: () => void }) {
  const lang = useLang();
  const [nudge, setNudge] = useState(false);
  const said = useRef(false);
  useEffect(() => {
    if (said.current || env.open || env.ready < NUDGE_AT) return;
    said.current = true;
    setNudge(true);
    const id = setTimeout(() => setNudge(false), NUDGE_MS);
    return () => clearTimeout(id);
  }, [env.ready, env.open]);
  useEffect(() => {
    if (env.open) setNudge(false);
  }, [env.open]);

  return (
    <>
      {nudge && !leaving ? (
        <p data-envelopes-nudge className="hud-shadow hud-in pointer-events-none absolute bottom-8 left-1/2 z-20 w-[min(560px,92vw)] -translate-x-1/2 text-center text-[13px] text-parchment/80 max-sm:bottom-[11.5rem]">
          {t(lang, coarse ? "env.nudge.touch" : "env.nudge.desk")}
        </p>
      ) : null}
      {leaving ? (
        <div data-envelopes-leaving className="absolute left-1/2 top-16 z-40 w-[min(400px,92vw)] -translate-x-1/2">
          <div className="hud-pop hud-in px-5 py-4">
            <p className="font-serif text-[16px] leading-snug text-parchment">{t(lang, "env.leaving", { n: env.ready })}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                data-leaving-open
                onClick={() => {
                  onStay();
                  env.setOpen(true);
                }}
                className="rounded-full bg-parchment px-4 py-2 text-[13px] font-medium text-ink transition-opacity hover:opacity-90"
              >
                {t(lang, "env.leaving.open")}
              </button>
              <button type="button" data-leaving-go onClick={onLeave} className="rounded-full border border-parchment/20 px-4 py-2 text-[13px] text-parchment/75 transition-colors hover:border-parchment/40 hover:text-parchment">
                {t(lang, "env.leaving.go")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export { LEAVING_AT };
