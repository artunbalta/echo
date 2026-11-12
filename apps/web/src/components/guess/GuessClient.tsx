"use client";

/**
 * Guessing what a friend did (DECISIONS C89). The link's fragment is read here, in the browser; each
 * moment is put as the question it was, with every way it could have ended; and only when all are
 * answered does the page say what the friend did, what their echo had sealed, and who was closer.
 *
 * Nothing is sent anywhere: the friend's score goes back, if they want it to, as a line of text they
 * send themselves.
 *
 * Every word here comes from `lib/knowable/guessPage.ts`, a small catalogue, and never from the planet
 * or the app's table of strings: either one triples what a phone has to load (see that file).
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { decodeGuess, momentWords, outcomesOf, outcomeWords, say, type GuessLink } from "@/lib/knowable/guessPage";
import { LANGS, setLang, useLang } from "@/lib/lang";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { step as count } from "@/lib/steps";

export default function GuessClient() {
  const lang = useLang();
  // undefined: not read yet; null: a link that does not open.
  const [link, setLink] = useState<GuessLink | null | undefined>(undefined);
  const [step, setStep] = useState(-1);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const read = decodeGuess(window.location.hash);
    setLink(read);
    // How far people come (C92): a friend's link was opened.
    if (read) count("guess_opened");
  }, []);
  useEffect(() => {
    if (link && step >= link.items.length) count("guessed");
  }, [link, step]);

  if (link === undefined) return null;
  const name = link?.n || say(lang, "guess.someone");
  const shell = "mx-auto flex min-h-full w-[min(520px,100%)] flex-col px-6 pb-16 pt-14";
  const primary = "rounded-full bg-parchment px-5 py-2.5 text-[14px] font-medium text-ink transition-opacity hover:opacity-90";

  const langs = (
    <div className="mb-10 flex items-center justify-between">
      <Link href="/" className="font-pixel text-[15px] tracking-wide text-parchment/70 hover:text-parchment">
        echo
      </Link>
      <span className="flex overflow-hidden rounded-full border border-parchment/15 text-[11px]">
        {LANGS.map((l) => (
          <button key={l} type="button" data-lang={l} aria-pressed={lang === l} onClick={() => setLang(l)} className={`px-2.5 py-1 uppercase tracking-wide ${lang === l ? "bg-parchment text-ink" : "text-parchment/60 hover:text-parchment"}`}>
            {l}
          </button>
        ))}
      </span>
    </div>
  );

  if (link === null)
    return (
      <div className={shell}>
        {langs}
        <p data-guess-bad className="font-serif text-[20px] leading-snug text-parchment">
          {say(lang, "guess.bad")}
        </p>
        <Link href={OPEN_VILLAGE_PATH} className={`${primary} mt-8 w-fit`}>
          {say(lang, "guess.yours")}
        </Link>
      </div>
    );

  const n = link.items.length;

  if (step < 0)
    return (
      <div className={shell}>
        {langs}
        <h1 className="font-serif text-[34px] leading-[1.1] text-parchment">{say(lang, "guess.title", { name })}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-parchment/70">{say(lang, "guess.lead", { name })}</p>
        <button type="button" data-guess-begin onClick={() => setStep(0)} className={`${primary} mt-8 w-fit`}>
          {say(lang, "guess.begin")}
        </button>
      </div>
    );

  if (step < n) {
    const it = link.items[step]!;
    const words = momentWords(lang, it.k, it.a);
    return (
      <div className={shell}>
        {langs}
        <p className="text-[12px] tabular-nums text-parchment/45">{say(lang, "guess.of", { i: step + 1, n })}</p>
        <div key={step} className="hud-in">
          <h2 className="mt-3 font-serif text-[26px] leading-[1.15] text-parchment">{words.name}</h2>
          {words.arm ? <p className="mt-1.5 text-[15px] text-parchment/60">{words.arm}</p> : null}
          <p className="mt-7 text-[13px] text-parchment/50">{say(lang, "guess.q", { name })}</p>
          <div className="mt-3 flex flex-col gap-2">
            {outcomesOf(it.k).map((o) => (
              <button
                key={o}
                type="button"
                data-guess-option={o}
                onClick={() => {
                  setGuesses((g) => [...g, o]);
                  setStep(step + 1);
                }}
                className="rounded-xl border border-parchment/15 px-4 py-3 text-left text-[15px] text-parchment/90 transition-colors hover:border-parchment/45 hover:bg-parchment/[0.05]"
              >
                {outcomeWords(lang, it.k, o)}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const you = link.items.filter((it, i) => guesses[i] === it.d).length;
  const echo = link.items.filter((it) => it.c === it.d).length;
  const verdict = you > echo ? "guess.won" : you < echo ? "guess.lost" : "guess.tie";
  const send = async () => {
    const text = say(lang, "guess.score", { you, echo, n });
    try {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share && window.matchMedia("(pointer: coarse)").matches) await nav.share({ text });
      else await navigator.clipboard.writeText(text);
      setSent(true);
    } catch {
      // The sheet was closed: nothing was sent, and nothing is said.
    }
  };

  return (
    <div className={shell}>
      {langs}
      <h1 data-guess-result className="font-serif text-[28px] leading-[1.15] text-parchment">
        {say(lang, "guess.result", { name, you, echo, n })}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-parchment/70">{say(lang, verdict, { name })}</p>

      <ul className="mt-7 divide-y divide-parchment/10 border-y border-parchment/10">
        {link.items.map((it, i) => {
          const words = momentWords(lang, it.k, it.a);
          const mark = (hit: boolean) => <span aria-hidden="true" className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${hit ? "bg-echo" : "border border-parchment/35"}`} />;
          return (
            <li key={i} className="hud-in py-4" style={{ animationDelay: `${i * 110}ms` }}>
              <p className="font-serif text-[16px] leading-snug text-parchment">
                {words.name}
                {words.arm ? <span className="text-parchment/50"> · {words.arm}</span> : null}
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px] leading-snug">
                <dt className="text-parchment/45">{say(lang, "guess.did", { name })}</dt>
                <dd className="text-parchment">{outcomeWords(lang, it.k, it.d)}</dd>
                <dt className="text-parchment/45">{say(lang, "guess.you")}</dt>
                <dd className="text-parchment/80">
                  {mark(guesses[i] === it.d)}
                  {outcomeWords(lang, it.k, guesses[i]!)}
                </dd>
                <dt className="text-parchment/45">{say(lang, "guess.echo")}</dt>
                <dd className="text-parchment/80">
                  {mark(it.c === it.d)}
                  {outcomeWords(lang, it.k, it.c)}
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href={OPEN_VILLAGE_PATH} data-guess-yours onClick={() => count("guess_walk_in")} className={primary}>
          {say(lang, "guess.yours")}
        </Link>
        <button type="button" data-guess-send onClick={() => void send()} className="rounded-full border border-parchment/20 px-5 py-2.5 text-[14px] text-parchment/80 transition-colors hover:border-parchment/45 hover:text-parchment">
          {sent ? say(lang, "guess.sent") : say(lang, "guess.send", { name })}
        </button>
      </div>
      <p className="mt-3 text-[12px] text-parchment/45">{say(lang, "guess.yours.lead")}</p>
    </div>
  );
}
