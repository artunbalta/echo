"use client";

/**
 * The finding the whole place rests on (landing §3, DECISIONS C100).
 *
 * WHAT WAS HERE. "13 of 13" and two sentences in a rounded box a shade darker than the page, under the
 * three steps: a number with a frame round it and nothing to look at. The owner's words: the evidence
 * is the important part and the page does not press it; and the thing round it is bad.
 *
 * WHAT IS HERE. A band of the page's own, edge to edge, with no box. The number, as large as the
 * screen will take, and the sentence it is the number of. Beside it the thirteen themselves: one row a
 * published twin, where it scored as it was released, the line a guess that knows nobody scores, and
 * where the same twin lands after one look at what the person had actually done. The reader sees
 * thirteen marks left of a line and thirteen right of it and does not have to be told.
 *
 * COUNTED, NEVER TYPED (L6). Every number here is read from the audit's own record
 * (`lib/knowable/data/twin2k-audit.json`), as `/bench` reads it: if the research changes, so does
 * this section, including its headline.
 *
 * THE CHART (the dataviz procedure). The job is before and after per item, so the form is a dumbbell
 * on one shared axis. Two series, so a legend, in the order they are read. Marks are 10px squares (the
 * page is in pixels) with a ring of the surface; the two reference lines are named where they stand;
 * words and numbers are in the text's colours and never in a series'. The two hues were run through
 * the validator against this band's surface (#120c19): amber #c9832f and the echo's violet #a06cd5
 * pass the lightness band, the chroma floor, the colour-blind separation and the contrast. Every row
 * answers a pointer and the keyboard with its numbers, and the same numbers are a table for a screen
 * reader and at `/bench` for everyone. The axis starts at 0.66: these are positions and not bars, and
 * from zero the thirteen would be one smear at the right.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useLang, type Lang } from "@/lib/lang";
import audit from "@/lib/knowable/data/twin2k-audit.json";
import { WRAP } from "./Section";

interface Twin {
  accuracy: number;
  crowd: number;
  retest: number;
  with_one_look: number;
  vs_crowd_ci95: number[];
  one_look_gain_ci95: number[];
}

const twins = Object.entries(audit.twins as Record<string, Twin>)
  .map(([name, v]) => ({ name: name.replace(" - ", " · ").replace(/GPT4/g, "GPT-4").replace("Flash2.5", "2.5 Flash"), ...v }))
  .sort((a, b) => b.accuracy - a.accuracy);
const total = twins.length;
/** Twins whose whole interval sits below the crowd; twins one earlier answer reliably lifted; twins it took past the person's own retest. */
const below = twins.filter((t) => t.vs_crowd_ci95[1]! < 0).length;
const lifted = twins.filter((t) => t.one_look_gain_ci95[0]! > 0).length;
const pastRetest = twins.filter((t) => t.with_one_look > t.retest).length;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
/** The two lines: each twin is scored on its own cells, so each has its own; they differ in the third decimal. */
const CROWD = median(twins.map((t) => t.crowd));
const RETEST = median(twins.map((t) => t.retest));

const LO = 0.66;
const HI = 0.84;
const TICKS = [0.68, 0.72, 0.76, 0.8, 0.84];
const at = (v: number) => `${(((v - LO) / (HI - LO)) * 100).toFixed(2)}%`;
const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const count = (n: number, lang: Lang) => n.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB");

const ALONE = "#c9832f";
const LOOKED = "#a06cd5";

interface Copy {
  of: (below: number, n: number) => string;
  claim: string;
  body: (people: string, items: number, n: number, past: number) => string;
  lift: (lifted: number, n: number) => string;
  evidence: string;
  audit: string;
  open: string;
  chart: string;
  alone: string;
  looked: string;
  crowd: string;
  retest: string;
  axis: string;
  twin: string;
  table: string;
}

const COPY: Record<Lang, Copy> = {
  en: {
    of: (below, n) => `${below} of ${n}`,
    claim: "published AI twins knew a person worse than a guess that knows nobody.",
    body: (people, items, n, past) =>
      `We scored every twin released with Twin-2K-500 against the ${people} people it was built from, on ${items} questions they answered twice. ${past === n ? `All ${n}` : `${past} of ${n}`} passed the person’s own second answer once they were shown one thing: what that person had done before.`,
    lift: (lifted, n) => (lifted === n ? `One look lifted all ${n}.` : `One look lifted ${lifted} of ${n}.`),
    evidence: "Read the evidence",
    audit: "Audit your own twins",
    open: "Three more public datasets say the same: with money at stake, across behaviour, and in two million people. The paper is under review; the code and the analysis plans are public.",
    chart: "Each row is one published twin",
    alone: "As released: built from what the person said",
    looked: "After one look at what the person did",
    crowd: "a guess that knows nobody",
    retest: "the person, asked again",
    axis: "How well it predicts one person’s answers (1 is every answer right)",
    twin: "Twin",
    table: "The same numbers as a table",
  },
  tr: {
    of: (below, n) => `${n}’te ${below}`,
    claim: "yayımlanmış yapay zekâ ikizi, bir insanı kimseyi tanımayan bir tahminden daha kötü bildi.",
    body: (people, items, n, past) =>
      `Twin-2K-500 ile yayımlanan her ikizi, kurulduğu ${people} kişiye karşı, o kişilerin iki kez yanıtladığı ${items} soruda ölçtük. Tek bir şey gösterilince ${past === n ? `${n} ikizin hepsi` : `${n} ikizin ${past} tanesi`} kişinin kendi ikinci yanıtını geçti: o kişinin daha önce ne yaptığı.`,
    lift: (lifted, n) => (lifted === n ? `Tek bir bakış ${n} ikizin hepsini yukarı taşıdı.` : `Tek bir bakış ${n} ikizin ${lifted} tanesini yukarı taşıdı.`),
    evidence: "Kanıtı oku",
    audit: "Kendi ikizlerini denetle",
    open: "Herkese açık üç veri kümesi daha aynısını söylüyor: işin içinde para varken, davranışta ve iki milyon insanda. Makale hakem değerlendirmesinde; kod ve analiz planları açık.",
    chart: "Her satır yayımlanmış bir ikiz",
    alone: "Yayımlandığı hâliyle: kişinin söylediklerinden kurulmuş",
    looked: "Kişinin yaptığına bir kez baktıktan sonra",
    crowd: "kimseyi tanımayan bir tahmin",
    retest: "kişinin kendisi, yeniden sorulunca",
    axis: "Bir kişinin yanıtlarını ne kadar iyi bildiği (1: her yanıt doğru)",
    twin: "İkiz",
    table: "Aynı sayılar, tablo olarak",
  },
};

export default function Evidence() {
  const lang = useLang();
  const copy = COPY[lang];
  const plot = useRef<HTMLDivElement>(null);
  // The marks start where the twins were and go to where one look put them, once, when the chart is seen.
  const [shown, setShown] = useState(false);
  const [on, setOn] = useState<number | null>(null);
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(true);
    const seen = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        setShown(true);
        seen.disconnect();
      },
      { threshold: 0.35 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  return (
    <section id="evidence" className="scroll-mt-[60px] bg-ink-deep py-20 sm:py-28">
      <div className={`${WRAP} grid items-start gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`}>
        <div>
          <h2>
            <span data-finding className="font-display block text-[clamp(5rem,15vw,10rem)] leading-[0.8] text-parchment">
              {copy.of(below, total)}
            </span>
            <span className="font-display mt-6 block max-w-[20ch] text-[clamp(1.75rem,3.1vw,2.4rem)] leading-[1.02] text-parchment">{copy.claim}</span>
          </h2>
          <p className="font-display mt-8 text-[clamp(1.5rem,2.4vw,1.9rem)] leading-[1.02] text-echo-soft">{copy.lift(lifted, total)}</p>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-parchment/70">{copy.body(count(audit.people, lang), audit.items, total, pastRetest)}</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/bench" className="btn btn-primary">
              {copy.evidence}
            </Link>
            <Link href="/audit" className="text-link text-[15px]">
              {copy.audit}
            </Link>
          </div>
          <p className="mt-6 max-w-md text-[13.5px] leading-relaxed text-parchment/50">{copy.open}</p>
        </div>

        <figure className="min-w-0">
          <figcaption className="text-[15px] font-medium text-parchment">{copy.chart}</figcaption>
          <ul className="mt-3 flex flex-col gap-x-6 gap-y-1.5 text-[13.5px] text-parchment/75 sm:flex-row sm:flex-wrap">
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0" style={{ background: ALONE }} />
              {copy.alone}
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0" style={{ background: LOOKED }} />
              {copy.looked}
            </li>
          </ul>

          <div ref={plot} data-shown={shown} className="twin-plot mt-6" onPointerLeave={() => setOn(null)}>
            <div className="twin-body">
            {/* The two lines, named where they stand, over every row there is. */}
            <div aria-hidden className="twin-refs">
              <span className="twin-ref" style={{ left: at(CROWD) }}>
                <b className="twin-ref-name twin-ref-left">
                  {copy.crowd} · {f2(CROWD)}
                </b>
              </span>
              <span className="twin-ref" style={{ left: at(RETEST) }}>
                <b className="twin-ref-name">
                  {copy.retest} · {f2(RETEST)}
                </b>
              </span>
            </div>
            <ol className="twin-rows">
              {twins.map((t, i) => (
                <li key={t.name} className="twin-row" data-on={on === i} tabIndex={0} onPointerEnter={() => setOn(i)} onFocus={() => setOn(i)} onBlur={() => setOn(null)} aria-label={`${t.name}: ${f3(t.accuracy)}, ${copy.looked.toLowerCase()} ${f3(t.with_one_look)}`}>
                  <span className="twin-name">{t.name}</span>
                  <span className="twin-track">
                    <i className="twin-line" style={{ left: at(t.accuracy), width: shown ? `calc(${at(t.with_one_look)} - ${at(t.accuracy)})` : 0, transitionDelay: `${i * 45}ms` }} />
                    <i className="twin-mark" style={{ left: at(t.accuracy), background: ALONE }} />
                    <i className="twin-mark" style={{ left: at(shown ? t.with_one_look : t.accuracy), background: LOOKED, transitionDelay: `${i * 45}ms` }} />
                    {on === i ? (
                      <span role="tooltip" className="twin-tip" style={{ left: at((t.accuracy + t.with_one_look) / 2) }}>
                        <b>{t.name}</b>
                        <span>
                          <i style={{ background: ALONE }} />
                          <strong>{f3(t.accuracy)}</strong> {copy.alone}
                        </span>
                        <span>
                          <i style={{ background: LOOKED }} />
                          <strong>{f3(t.with_one_look)}</strong> {copy.looked}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
            </div>
            <div aria-hidden className="twin-axis">
              <span className="twin-name" />
              <span className="twin-track">
                {TICKS.map((v) => (
                  <b key={v} style={{ left: at(v) }}>
                    {f2(v)}
                  </b>
                ))}
              </span>
            </div>
            <p className="mt-9 text-[12.5px] text-parchment/50">{copy.axis}</p>
          </div>

          {/* In a box of its own: a table takes the width of what is in it, whatever it is told. */}
          <div className="sr-only">
          <table>
            <caption>{copy.table}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.twin}</th>
                <th scope="col">{copy.alone}</th>
                <th scope="col">{copy.crowd}</th>
                <th scope="col">{copy.looked}</th>
                <th scope="col">{copy.retest}</th>
              </tr>
            </thead>
            <tbody>
              {twins.map((t) => (
                <tr key={t.name}>
                  <th scope="row">{t.name}</th>
                  <td>{f3(t.accuracy)}</td>
                  <td>{f3(t.crowd)}</td>
                  <td>{f3(t.with_one_look)}</td>
                  <td>{f3(t.retest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </figure>
      </div>
    </section>
  );
}
