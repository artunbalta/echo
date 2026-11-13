"use client";

/**
 * What happens in the village (landing §1, DECISIONS C89, C97), and the finding it rests on.
 *
 * WHY THIS SECTION EXISTS. The head of the page says what ECHO is in one sentence and asks for a
 * name. This is the three sentences after that one, in the order they happen to a person: you walk,
 * it watches what you do, and it goes on as you when you have left. Then the one finding the whole
 * place rests on, with the door to the evidence (`/bench`).
 *
 * IN PLAIN WORDS (C97). The steps used to speak of an echo that seals a guess and of envelopes to be
 * opened: the product's own nouns, which someone who has never been inside has no way to read. They
 * say what happens instead, and each is a numeral, a title and two sentences, with no drawing over
 * it: three small line drawings of envelopes explained nothing the titles did not.
 *
 * The count of twins is read from the audit's own record, never typed (L6): if the research changes,
 * so does the sentence.
 */
import Link from "next/link";

import { useLang, type Lang } from "@/lib/lang";
import audit from "@/lib/knowable/data/twin2k-audit.json";
import { SECTION, SectionHead, WRAP } from "./Section";

const twins = Object.values(audit.twins as Record<string, { vs_crowd_ci95: number[]; one_look_gain_ci95: number[] }>);
/** Twins whose whole interval sits below the crowd, and twins one earlier answer reliably lifted. */
const below = twins.filter((t) => t.vs_crowd_ci95[1]! < 0).length;
const lifted = twins.filter((t) => t.one_look_gain_ci95[0]! > 0).length;

/** The section's words, in both languages; a browser set to Turkish reads Turkish. */
const COPY: Record<Lang, { title: string; steps: { title: string; body: string }[]; finding: { title: string; of: (below: number, n: number) => string; body: (below: number, n: number, lifted: boolean) => string; caption: string; evidence: string } }> = {
  en: {
    title: "How it works",
    steps: [
      { title: "You walk through a village", body: "Small things happen there: a pouch of gold in the grass, a stranger asking the way, children who want you to lie for them. What you do is up to you." },
      { title: "ECHO watches what you do", body: "Before each one it writes down what it thinks you will do. Afterwards you see its guess beside what you did. The more it has seen of you, the closer it gets." },
      { title: "It acts like you when you are away", body: "When you leave, your agent stays in the village and makes the choices you would make. When you come back, it tells you what it did." },
    ],
    finding: {
      title: "Why what you do, and not what you say",
      of: (below, n) => `${below} of ${n}`,
      body: (below, n, lifted) => `On the field’s own benchmark, ${below} of the ${n} published AI twins we audited knew less about a person than a guess that knows nobody.${lifted ? " One look at what the person had actually done lifted every one of them." : ""}`,
      caption: "What people say about themselves is not where the knowledge is. What they do is.",
      evidence: "See the evidence",
    },
  },
  tr: {
    title: "Nasıl çalışır",
    steps: [
      { title: "Köyde gezersin", body: "Orada küçük şeyler olur: otların arasında bir kese altın, yol soran bir yabancı, senden yalan söylemeni isteyen çocuklar. Ne yapacağın sana kalmış." },
      { title: "ECHO ne yaptığına bakar", body: "Her birinden önce ne yapacağını tahmin edip yazar. Sonra tahminiyle yaptığını yan yana görürsün. Seni gördükçe daha iyi bilir." },
      { title: "Sen yokken senin gibi davranır", body: "Sen çıkınca agent’ın köyde kalır ve senin vereceğin kararları verir. Döndüğünde ne yaptığını sana anlatır." },
    ],
    finding: {
      title: "Neden söylediğine değil, yaptığına bakıyor",
      of: (below, n) => `${n}’te ${below}`,
      body: (below, n, lifted) => `Alanın kendi ölçütünde denetlediğimiz ${n} yapay zekâ ikizinin ${below} tanesi, bir insan hakkında kimseyi tanımayan bir tahminden daha az şey biliyordu.${lifted ? " O kişinin gerçekten ne yaptığına bir kez bakmak hepsini yukarı taşıdı." : ""}`,
      caption: "Bilgi, insanların kendileri hakkında söylediklerinde değil; yaptıklarında.",
      evidence: "Kanıtı gör",
    },
  },
};

export default function HowItGoes() {
  const copy = COPY[useLang()];
  return (
    <section id="how" className={SECTION}>
      <div className={WRAP}>
        <SectionHead title={copy.title} />

        <ol className="mt-12 grid gap-x-12 gap-y-12 md:grid-cols-3 lg:gap-x-16">
          {copy.steps.map((s, i) => (
            <li key={s.title}>
              <p aria-hidden className="text-[15px] font-semibold tabular-nums text-echo-soft">
                {i + 1}
              </p>
              <h3 className="mt-3 text-[1.3rem] font-semibold leading-snug tracking-[-.015em] text-parchment">{s.title}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-parchment/70">{s.body}</p>
            </li>
          ))}
        </ol>

        {/* The finding: the number, and the sentence it is the number of. On a surface of its own, a
            shade under the page's, where a rule down its side used to mark it. */}
        <div className="mt-20 grid items-center gap-x-14 gap-y-8 rounded-3xl bg-ink-deep px-6 py-10 sm:mt-24 sm:px-12 sm:py-14 lg:grid-cols-[auto_minmax(0,1fr)]">
          <p data-finding className="text-[clamp(3.25rem,9vw,5.5rem)] font-semibold leading-none tracking-[-.04em] tabular-nums text-parchment">
            {copy.finding.of(below, twins.length)}
          </p>
          <div className="max-w-2xl">
            <h3 className="text-[1.3rem] font-semibold leading-snug tracking-[-.015em] text-parchment">{copy.finding.title}</h3>
            <p className="mt-3 text-[16.5px] leading-relaxed text-parchment/75">{copy.finding.body(below, twins.length, lifted === twins.length)}</p>
            <p className="mt-3 text-[16.5px] leading-relaxed text-parchment/75">
              {copy.finding.caption}{" "}
              <Link href="/bench" className="text-link whitespace-nowrap">
                {copy.finding.evidence}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
