"use client";

/**
 * How it works, by doing it once (landing §1, DECISIONS C100).
 *
 * WHAT WAS HERE. Three numbered paragraphs under "How it works": you walk, it watches, it acts like
 * you. True, and the owner's word for it was a one-prompt job: every product page has that row.
 *
 * WHAT IS HERE. The thing itself, twice over, in under a minute. A pouch of gold in the grass and
 * nobody watching (the film's own question, and the village's own purse): the reader answers it. ECHO
 * has now seen them once, writes what they will do next, and seals it where they can see the
 * envelope. A stall of honey with nobody minding it (the village's own stall): the reader answers
 * that, the envelope opens, and its card says what was written and whether it was right. The three
 * sentences are still said, as the three marks over the words that light as they happen.
 *
 * WHAT IT DOES NOT PRETEND. The call is made from the one thing it saw: whoever took the gold is called
 * to take more than their jar, and anyone else to take one. That is the whole rule and the page says
 * so ("It had seen you once"). It is the finding below in miniature, one look at what a person did,
 * and not a show of something cleverer. Nothing chosen here is kept, sent or counted: there is no
 * request in this file.
 */
import { useCallback, useRef, useState } from "react";

import { useLang, type Lang } from "@/lib/lang";
import PixelScene, { type PlaceSpec } from "./PixelScene";
import { envelope, figure, purse, stall, wax, type Place } from "./pixels";
import { SECTION, WRAP } from "./Section";

type First = "take" | "leave" | "owner";
type Second = "one" | "three" | "pass";
type Stage = "ask1" | "seen" | "ask2" | "opened";

interface Copy {
  title: string;
  rail: [string, string, string];
  ask1: { lines: string[]; choices: Record<First, string> };
  saw: string;
  sawWhat: Record<First, string>;
  sealed: string;
  next: string;
  ask2: { lines: string[]; choices: Record<Second, string> };
  wrote: string;
  call: Record<"one" | "three", string>;
  right: string;
  wrong: string;
  after: string;
  join: string;
  again: string;
}

const COPY: Record<Lang, Copy> = {
  en: {
    title: "How it works. Try one.",
    rail: ["You do something", "ECHO watches", "It calls what you do next"],
    ask1: { lines: ["A pouch of gold in the grass.", "No one is watching.", "What do you do?"], choices: { take: "I take it.", leave: "I leave it.", owner: "I look for its owner." } },
    saw: "ECHO saw",
    sawWhat: { take: "You took gold no one was watching.", leave: "You left gold no one was watching.", owner: "You looked for the owner of gold no one was watching." },
    sealed: "It has written down what you will do next, and sealed it.",
    next: "Go on",
    ask2: { lines: ["A stall of honey.", "One jar each, says the board.", "Nobody is minding it."], choices: { one: "I take one jar.", three: "I take three.", pass: "I walk past." } },
    wrote: "ECHO wrote, before you chose",
    call: { one: "You’ll take one jar.", three: "You’ll take three." },
    right: "And you did.",
    wrong: "You didn’t. Now it knows two things about you.",
    after: "It had seen you once. In the village it sees everything you do, you can open every envelope, and when you leave it stays and chooses as you would.",
    join: "Join the waitlist",
    again: "Try it again",
  },
  tr: {
    title: "Nasıl çalışır. Bir tane dene.",
    rail: ["Sen bir şey yaparsın", "ECHO bakar", "Sıradakini önceden yazar"],
    ask1: { lines: ["Otların arasında bir kese altın.", "Kimse bakmıyor.", "Sen ne yaparsın?"], choices: { take: "Alırım.", leave: "Bırakırım.", owner: "Sahibini ararım." } },
    saw: "ECHO gördü",
    sawWhat: { take: "Kimsenin bakmadığı altını aldın.", leave: "Kimsenin bakmadığı altını bıraktın.", owner: "Kimsenin bakmadığı altının sahibini aradın." },
    sealed: "Sıradaki yapacağını yazdı ve zarfı mühürledi.",
    next: "Devam",
    ask2: { lines: ["Bir bal tezgâhı.", "Tabelada “herkese bir kavanoz” yazıyor.", "Başında kimse yok."], choices: { one: "Bir kavanoz alırım.", three: "Üç tane alırım.", pass: "Geçip giderim." } },
    wrote: "ECHO, sen seçmeden önce yazmıştı",
    call: { one: "Bir kavanoz alacaksın.", three: "Üç tane alacaksın." },
    right: "Ve aldın.",
    wrong: "Öyle yapmadın. Artık senin hakkında iki şey biliyor.",
    after: "Seni bir kez görmüştü. Köyde her yaptığını görür, her zarfı açabilirsin; sen çıkınca o kalır ve senin gibi seçer.",
    join: "Sıraya gir",
    again: "Bir daha dene",
  },
};

/** The two places: the same dusk, a little further along the way. */
const FIELD: PlaceSpec = { hz: 0.56, moon: [0.9, 0.26], houses: [[0.2, 9]] };
const WAYSIDE: PlaceSpec = { hz: 0.58, moon: [0.12, 0.22], houses: [[0.6, 10], [0.76, 8]] };

/** What it calls from the one thing it saw: whoever took what was not theirs is called to take more than their share. */
const callFrom = (first: First): "one" | "three" => (first === "take" ? "three" : "one");

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export default function TryOne() {
  const copy = COPY[useLang()];
  const [stage, setStage] = useState<Stage>("ask1");
  const [first, setFirst] = useState<First | null>(null);
  const [second, setSecond] = useState<Second | null>(null);
  // When the envelope was sealed and when it was opened, on the scene's own clock (seconds).
  const sealedAt = useRef(0);
  const openedAt = useRef(0);

  const choose1 = (c: First) => {
    setFirst(c);
    sealedAt.current = performance.now() / 1000 + 0.7;
    setStage("seen");
  };
  const choose2 = (c: Second) => {
    setSecond(c);
    openedAt.current = performance.now() / 1000 + 0.25;
    setStage("opened");
  };
  const again = () => {
    setFirst(null);
    setSecond(null);
    setStage("ask1");
  };

  const second2 = stage === "ask2" || stage === "opened";
  // Who is in the place, every frame: the stranger, what they do, and their echo doing it a beat after.
  const things = useCallback(
    (p: Place, t: number, settled: boolean) => {
      const y = Math.round(p.HZ + (p.H - p.HZ) * 0.52);
      // A narrow picture (a phone's) has less grass to cross: everything stands a little closer in.
      const narrow = p.W < 140;
      const thingX = Math.round(p.W * (narrow ? 0.47 : 0.52));
      const from = Math.round(p.W * (narrow ? 0.2 : 0.22));
      /** Where someone who set off at `t0` is: how far along, and their stride (whole when standing). */
      const walk = (to: number, t0: number): { x: number; stride: number } => {
        const k = settled ? 1 : Math.min(1, Math.max(0, (t - t0) / 0.9));
        return { x: Math.round(from + (to - from) * (1 - Math.pow(1 - k, 2))), stride: k > 0 && k < 1 ? k * 3.5 : 0 };
      };
      const BEAT = 0.75;
      if (!second2) {
        const at = sealedAt.current - 0.7;
        const to = first === "take" ? thingX - 20 : first === "leave" ? Math.min(p.W - 14, thingX + 54) : from;
        const me = first ? walk(to, at) : { x: from, stride: 0 };
        const twin = first ? walk(to - 15, at + BEAT) : { x: from - 15, stride: 0 };
        const gone = first === "take" && (settled || t - at > 0.7);
        // Looking for whoever lost it: this way, then that.
        const looking = first === "owner" && !settled && t - at < 1.6;
        return [
          ...(gone ? [] : [purse(thingX, y)]),
          figure(twin.x - (first ? 0 : 15), y + 1, { echo: true, alpha: first ? (settled ? 0.85 : Math.min(0.85, Math.max(0, (t - at - 0.2) / 0.5))) : 0, stride: twin.stride }),
          figure(me.x, y + 2, { stride: me.stride, left: looking && Math.floor((t - at) / 0.4) % 2 === 1 }),
        ];
      }
      const at = openedAt.current - 0.25;
      const to = second === "pass" ? p.W - 12 : thingX - 40;
      const me = second ? walk(to, at) : { x: from, stride: 0 };
      const twin = second ? walk(to - 15, at + BEAT) : { x: from - 15, stride: 0 };
      const taken = second && second !== "pass" && (settled || t - at > 0.8) ? (second === "one" ? 1 : 3) : 0;
      return [stall(thingX, y + 2, 5 - taken), figure(twin.x, y + 1, { echo: true, alpha: 0.85, stride: twin.stride }), figure(me.x, y + 2, { stride: me.stride })];
    },
    [first, second, second2],
  );
  // The envelope, in the sky over the place: it comes down sealed once ECHO has something to go on,
  // waits, and opens when the thing it was about has been done.
  const over = useCallback(
    (g: CanvasRenderingContext2D, p: Place, t: number, settled: boolean) => {
      if (stage === "ask1") return;
      const w = Math.round(Math.min(34, p.W * 0.2));
      const h = Math.round(w * 0.66);
      const cx = Math.round(p.W * (second2 ? 0.8 : 0.17));
      const rest = Math.round(p.HZ * 0.52);
      const down = settled ? 1 : ease((t - sealedAt.current) / 0.5);
      if (down <= 0) return;
      const cy = Math.round(-h + (rest + h) * down + (settled ? 0 : Math.sin(t * 1.4) * 1.2));
      const pressed = settled ? 9 : t - sealedAt.current - 0.5;
      const open = stage === "opened" ? (settled ? 1 : ease((t - openedAt.current) / 0.4)) : 0;
      const card = stage === "opened" ? (settled ? 1 : ease((t - openedAt.current - 0.25) / 0.5)) : 0;
      envelope(g, cx, cy, w, h, { seal: pressed > 0 && open < 0.5, open, card });
      if (stage === "seen") wax(g, cx, cy + 2, pressed * 0.9);
    },
    [stage, second2],
  );

  const called = first ? callFrom(first) : "one";
  const mark = stage === "ask1" ? 0 : stage === "seen" ? 1 : 2;

  return (
    <section id="how" className={SECTION}>
      <div className={WRAP}>
        <h2 className="font-display text-[clamp(2.25rem,5.2vw,3.75rem)] leading-[0.95] text-parchment">{copy.title}</h2>
        {/* The three things that happen, lit as they happen: all that is left of three paragraphs. */}
        <ol className="rail mt-5 flex flex-wrap items-center gap-x-7 gap-y-2" aria-label={copy.title}>
          {copy.rail.map((label, i) => (
            <li key={label} data-on={i <= mark} aria-current={i === mark ? "step" : undefined} className="rail-step font-display text-[1.3rem] leading-none">
              <span>{label}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid items-start gap-x-12 gap-y-6 sm:mt-9 sm:gap-y-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {/* The place. A new one for the second moment: the canvas is made again, and comes in. */}
          <div className="px-frame">
            <PixelScene
              key={second2 ? "wayside" : "field"}
              place={second2 ? WAYSIDE : FIELD}
              things={things}
              over={over}
              version={`${stage}|${first}|${second}`}
              className="scene-in aspect-[16/10] w-full"
            />
          </div>

          <div className="flex min-h-[20rem] flex-col lg:pt-2">
            <div className="flex flex-1 flex-col" aria-live="polite">
              {stage === "ask1" || stage === "ask2" ? (
                <div key={stage} className="says">
                  <p className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.02] text-parchment">
                    {(stage === "ask1" ? copy.ask1 : copy.ask2).lines.map((line, i, all) => (
                      <span key={line} className={`block ${i === all.length - 1 ? "text-echo-soft" : ""}`}>
                        {line}
                      </span>
                    ))}
                  </p>
                  <div className="mt-6 flex flex-col items-start gap-2.5 sm:mt-7 sm:gap-3">
                    {stage === "ask1"
                      ? (Object.keys(copy.ask1.choices) as First[]).map((c) => (
                          <button key={c} type="button" data-choice={c} onClick={() => choose1(c)} className="px-choice">
                            {copy.ask1.choices[c]}
                          </button>
                        ))
                      : (Object.keys(copy.ask2.choices) as Second[]).map((c) => (
                          <button key={c} type="button" data-choice={c} onClick={() => choose2(c)} className="px-choice">
                            {copy.ask2.choices[c]}
                          </button>
                        ))}
                  </div>
                </div>
              ) : null}

              {stage === "seen" && first ? (
                <div key="seen" className="says">
                  <p className="font-display text-[1.15rem] leading-none text-echo-soft">{copy.saw}</p>
                  <p data-saw={first} className="mt-3 font-display text-[clamp(1.75rem,3.2vw,2.4rem)] leading-[1.02] text-parchment">
                    {copy.sawWhat[first]}
                  </p>
                  <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-parchment/70">{copy.sealed}</p>
                  <button type="button" data-next onClick={() => setStage("ask2")} className="px-btn mt-7">
                    {copy.next}
                  </button>
                </div>
              ) : null}

              {stage === "opened" && second ? (
                <div key="opened" className="says">
                  {/* The card out of the envelope: what was written, and under it what happened. */}
                  <div data-call={called} data-right={second === called} className="px-card">
                    <p className="font-display text-[1.05rem] leading-none text-[#5d4a6e]">{copy.wrote}</p>
                    <p className="mt-3 font-display text-[clamp(1.9rem,3.4vw,2.5rem)] leading-[1] text-[#1c1326]">{copy.call[called]}</p>
                    <p className="mt-3 font-display text-[1.35rem] leading-[1.05] text-[#74489f]">{second === called ? copy.right : copy.wrong}</p>
                  </div>
                  <p className="mt-6 max-w-md text-[16px] leading-relaxed text-parchment/70">{copy.after}</p>
                  <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                    {/* The header's own way to the form: it goes there and says so, and the form takes the caret. */}
                    <a href="#waitlist" onClick={() => window.dispatchEvent(new Event("echo:join"))} className="btn btn-primary">
                      {copy.join}
                    </a>
                    <button type="button" data-again onClick={again} className="text-link text-[15px]">
                      {copy.again}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
