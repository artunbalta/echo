"use client";

/**
 * What happens when you walk in (landing §1, DECISIONS C89), and why it is worth five minutes.
 *
 * WHY THIS SECTION EXISTS. The landing said "a world that learns you" and then asked for an email. It
 * never said what learning you means, or that the world is open now. This says it in three steps, in
 * the order they happen to a visitor: the echo seals a guess before each thing you meet; you open
 * them; a friend tries to do better. Then the one finding the whole place rests on, with the door to
 * the evidence (`/bench`).
 *
 * The count of twins is read from the audit's own record, never typed (L6): if the research changes,
 * so does the sentence.
 */
import Link from "next/link";

import { useLang, type Lang } from "@/lib/lang";
import audit from "@/lib/knowable/data/twin2k-audit.json";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { step } from "@/lib/steps";

const twins = Object.values(audit.twins as Record<string, { vs_crowd_ci95: number[]; one_look_gain_ci95: number[] }>);
/** Twins whose whole interval sits below the crowd, and twins one earlier answer reliably lifted. */
const below = twins.filter((t) => t.vs_crowd_ci95[1]! < 0).length;
const lifted = twins.filter((t) => t.one_look_gain_ci95[0]! > 0).length;

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** The three pictures: sealed, opened, and two side by side. */
const ART = [
  (
    <svg viewBox="0 0 64 44" className="h-11 w-16" aria-hidden="true" {...stroke}>
      <rect x="6" y="6" width="52" height="32" rx="3" />
      <path d="M7 8l25 18L57 8" />
      <circle cx="32" cy="27" r="5" fill="#a06cd5" stroke="none" />
    </svg>
  ),
  (
    <svg viewBox="0 0 64 44" className="h-11 w-16" aria-hidden="true" {...stroke}>
      <path d="M6 16v19a3 3 0 0 0 3 3h46a3 3 0 0 0 3-3V16" />
      <path d="M6 16L32 2l26 14" />
      <path d="M14 22V10h36v12" />
      <path d="M20 15h24M20 20h14" strokeWidth="1.1" opacity=".55" />
      <path d="M7 17l25 14 25-14" />
    </svg>
  ),
  (
    <svg viewBox="0 0 64 44" className="h-11 w-16" aria-hidden="true" {...stroke}>
      <rect x="4" y="12" width="26" height="18" rx="2.5" />
      <path d="M5 14l12 9 12-9" />
      <rect x="34" y="12" width="26" height="18" rx="2.5" />
      <path d="M35 14l12 9 12-9" />
      <circle cx="17" cy="24" r="3" fill="#a06cd5" stroke="none" />
      <circle cx="47" cy="24" r="3" fill="#f4e9d0" stroke="none" opacity=".7" />
    </svg>
  ),
];

/** The section's words, in both languages; a browser set to Turkish reads Turkish. */
const COPY: Record<Lang, { eyebrow: string; h2: [string, string]; steps: { title: string; body: string }[]; walkIn: string; quote: (below: number, n: number, lifted: boolean) => string; caption: string; evidence: string }> = {
  en: {
    eyebrow: "Who knows you best",
    h2: ["You, a friend, or something that", "watched you walk?"],
    steps: [
      { title: "It seals a guess", body: "Things happen in the village: a purse in the grass, a stranger asking the way, children who want you to lie for them. Before each one, your echo writes down what you will do, and seals it." },
      { title: "You open them", body: "When you like, you open the envelopes: what it said, what you did. The first time it meets something, it can only guess. The second time, it has seen you." },
      { title: "A friend tries", body: "Send a friend the same moments. They guess what you did, and see who knows you better: someone who has known you for years, or something that watched you for a walk." },
    ],
    walkIn: "Walk in",
    quote: (below, n, lifted) => `On the field\u2019s own benchmark, ${below} of ${n} published AI twins knew less about a person than a guess that knows nobody.${lifted ? " One look at what the person had done lifted every one of them." : ""}`,
    caption: "What people say about themselves is not where the knowledge is. What they do is.",
    evidence: "See the evidence",
  },
  tr: {
    eyebrow: "Seni en iyi kim tanıyor",
    h2: ["Sen mi, bir arkadaşın mı, yoksa", "yürüyüşünü izleyen bir şey mi?"],
    steps: [
      { title: "Bir tahmin mühürler", body: "Köyde bir şeyler olur: otların arasında bir kese, yol soran bir yabancı, kendileri için yalan söylemeni isteyen çocuklar. Her birinden önce yankın ne yapacağını yazar ve mühürler." },
      { title: "Sen açarsın", body: "İstediğin zaman zarfları açarsın: o ne dedi, sen ne yaptın. Bir şeyle ilk karşılaştığında ancak tahmin edebilir. İkincisinde seni görmüştür." },
      { title: "Bir arkadaşın dener", body: "Aynı anları bir arkadaşına gönder. Ne yaptığını tahmin eder; seni kimin daha iyi tanıdığını görürsünüz: yıllardır tanıyan biri mi, yoksa bir yürüyüş boyunca izleyen bir şey mi." },
    ],
    walkIn: "İçeri gir",
    quote: (below, n, lifted) => `Alanın kendi ölçütünde, yayımlanmış ${n} yapay zekâ ikizinin ${below} tanesi bir insan hakkında, kimseyi tanımayan bir tahminden daha az şey biliyordu.${lifted ? " O kişinin daha önce ne yaptığına bir kez bakmak, hepsini yukarı taşıdı." : ""}`,
    caption: "Bilgi, insanların kendileri hakkında söylediklerinde değil. Yaptıklarında.",
    evidence: "Kanıtı gör",
  },
};

export default function HowItGoes() {
  const copy = COPY[useLang()];
  return (
    <section id="how" className="border-t border-parchment/10 bg-ink px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <p className="text-center font-pixel text-xs uppercase tracking-[0.25em] text-parchment/35">{copy.eyebrow}</p>
        <h2 className="mx-auto mt-5 max-w-2xl text-center font-serif text-[clamp(1.9rem,3.4vw,2.9rem)] leading-[1.08] tracking-[-.02em] text-parchment">
          {copy.h2[0]} <span className="italic text-echo-soft">{copy.h2[1]}</span>
        </h2>

        <ol className="mt-12 grid gap-10 sm:mt-14 sm:grid-cols-3 sm:gap-8">
          {copy.steps.map((s, i) => (
            <li key={s.title} className="text-parchment/80">
              <div className="flex items-center gap-4 text-parchment/70">
                {ART[i]}
                <span className="font-pixel text-xs text-parchment/30">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-serif text-xl text-parchment">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-parchment/60">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex justify-center sm:mt-14">
          <Link href={OPEN_VILLAGE_PATH} onClick={() => step("walk_in")} className="rounded-full bg-parchment px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-white">
            {copy.walkIn} <span aria-hidden>›</span>
          </Link>
        </div>

        <figure className="mx-auto mt-16 max-w-3xl border-l-2 border-echo/60 pl-6 sm:mt-20">
          <blockquote className="font-serif text-[clamp(1.25rem,2.1vw,1.6rem)] leading-snug text-parchment">{copy.quote(below, twins.length, lifted === twins.length)}</blockquote>
          <figcaption className="mt-4 text-sm text-parchment/50">
            {copy.caption}{" "}
            <Link href="/bench" className="text-echo-soft underline decoration-echo-soft/40 underline-offset-4 hover:decoration-echo-soft">
              {copy.evidence}
            </Link>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
