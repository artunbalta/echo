/**
 * `/bench` (DECISIONS C90): what the twin audit found on the one public panel with released twins,
 * for someone who builds or buys such twins.
 *
 * The finding first, then the picture (every twin on one axis, the crowd at zero), then how the
 * measure works, what one earlier answer does, the same laws on three other datasets, the door to
 * `/audit`, and the limits said plainly: whose twins these are, what is a model and what is
 * measured, who said it before us, and that ECHO has a stake.
 *
 * NO NUMBER HERE IS TYPED. Each comes from `lib/knowable/data/twin2k-audit.json` (a byte-for-byte copy
 * of the research record's audit) or `headline.json` (a keyed extract of its facts), and
 * `tests/knowable.test.mts` fails if either drifts. A count in a sentence is counted from the file.
 *
 * A server component: the page is static, and reads without script.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { BenchShell, Section } from "@/components/bench/BenchShell";
import StepBeacon from "@/components/StepBeacon";
import { Leaderboard, type ReferenceRow } from "@/components/bench/Leaderboard";
import { LooksCurve, type LooksPanel } from "@/components/bench/LooksCurve";
import { Strip } from "@/components/bench/Strip";
import { AUDIT_LIMITS } from "@/lib/knowable/api";
import type { AuditResult } from "@/lib/knowable/audit";
import auditJson from "@/lib/knowable/data/twin2k-audit.json";
import headline from "@/lib/knowable/data/headline.json";
import { count, fixed, pct, ranked, signed } from "@/lib/knowable/format";

const audit = auditJson as unknown as AuditResult;
const facts = headline.facts as Record<string, number>;
const f = (key: string): number => {
  const v = facts[key];
  if (typeof v !== "number") throw new Error(`headline.json has no ${key}`);
  return v;
};

const twins = ranked(audit);
const total = twins.length;
const below = twins.filter(([, v]) => v.vs_crowd_ci95[1] < 0).length;
const lifted = twins.filter(([, v]) => v.one_look_gain_ci95[0] > 0).length;
/** With one look, how many beat the person's own retest on the very cells they answered. */
const pastRetest = twins.filter(([, v]) => v.with_one_look > v.retest).length;
const all = (n: number) => (n === total ? `all ${total}` : `${n} of ${total}`);
const All = (n: number) => (n === total ? `All ${total}` : `${n} of ${total}`);
const span = (pick: (v: (typeof twins)[number][1]) => number) => {
  const all = twins.map(([, v]) => pick(v));
  return { lo: Math.min(...all), hi: Math.max(...all) };
};
const alone = span((v) => v.knows);
const look = span((v) => v.knows_with_one_look);
const gap = span((v) => v.vs_crowd);
const lookAccuracy = span((v) => v.with_one_look);
const everyR = span((v) => v.r);

const SITE = "https://echovirtualworld.com";
const DATASET = "https://huggingface.co/datasets/LLM-Digital-Twin/Twin-2K-500";
const PAPER = "https://doi.org/10.1287/mksc.2025.0262";
const REPO = "https://github.com/artunbalta/echo";
const MAIL = "mailto:artun.balta@outlook.com?subject=Twin%20audit";

const description = `We audited the ${total} AI twins released with Twin-2K-500 on ${count(audit.people)} people. ${All(below)} know less about an individual than the crowd's median answer, a guess that knows nobody. One earlier answer per person lifts ${all(pastRetest)} above the person's own retest.`;

export const metadata: Metadata = {
  title: "What AI twins know about a person · echo",
  description,
  alternates: { canonical: "/bench" },
  openGraph: { title: "Every published AI twin we audited knows less about a person than a guess that knows nobody", description, type: "article", url: "/bench" },
  twitter: { card: "summary_large_image", title: "What AI twins know about a person", description },
};

const references: ReferenceRow[] = [
  { label: "An echo after three looks", note: "the model's forecast", share: f("t1.know.looks3"), accuracy: f("t1.model.looks3") },
  { label: "The person's own retest", note: "their earlier answer as the guess", share: f("t1.know.again"), accuracy: f("t1.again.acc"), r: f("t1.again.r") },
  { label: "The crowd", note: "everyone else's median answer", share: 0, accuracy: f("t1.base.acc"), r: twins[0]![1].r_crowd },
];

const CONTRASTS: [string, string][] = [
  ["species", "humans over pets"],
  ["age", "young over old"],
  ["util", "more lives"],
  ["gender", "men over women"],
  ["fitness", "fit over large"],
  ["status", "high status over low"],
];
const looksPanels: LooksPanel[] = CONTRASTS.map(([key, label]) => {
  const points = [];
  for (let n = 1; facts[`t4.x3.${key}.pred${n}`] !== undefined; n++) {
    points.push({ n, pred: f(`t4.x3.${key}.pred${n}`), obs: f(`t4.x3.${key}.obs${n}`), lo: f(`t4.x3.${key}.lo${n}`), hi: f(`t4.x3.${key}.hi${n}`) });
  }
  return { key, label, rho: f(`t4.x3.${key}.rho`), people: f(`t4.x3.${key}.people`), points };
});
const looksSeen = Math.max(...looksPanels.flatMap((p) => p.points.map((pt) => pt.n)));

const CURL = `# what to send
curl ${SITE}/api/v1/audit

# audit a twin from four CSV files
jq -n --rawfile items items.csv --rawfile truth truth.csv \\
      --rawfile earlier earlier.csv --rawfile twin twin.csv \\
      '{items: $items, truth: $truth, earlier: $earlier,
        twins: {"Our twin": $twin}}' \\
  | curl -s -X POST ${SITE}/api/v1/audit \\
      -H 'content-type: application/json' --data-binary @-`;

function Stat({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-parchment/15 pt-4">
      <p className="text-[2rem] font-semibold leading-none tracking-[-.02em] text-parchment sm:text-[2.35rem]">{value}</p>
      <p className="mt-2.5 text-[13.5px] leading-snug text-parchment/65">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="kn-surface rounded-xl border border-parchment/10 bg-ink-deep/55 p-5">
      <p className="text-[12px] tabular-nums text-echo-soft">{n}</p>
      <h3 className="mt-1 font-serif text-[1.2rem] leading-snug text-parchment">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-parchment/70">{children}</p>
    </li>
  );
}

function Elsewhere({ name, value, what, children }: { name: string; value: string; what: string; children: React.ReactNode }) {
  return (
    <div className="kn-surface flex flex-col rounded-xl border border-parchment/10 bg-ink-deep/55 p-5">
      <p className="text-[11px] uppercase tracking-[.18em] text-echo-soft">{name}</p>
      <p className="mt-3 text-[1.9rem] font-semibold leading-none tracking-[-.02em] text-parchment">{value}</p>
      <p className="mt-2 text-[13.5px] leading-snug text-parchment/85">{what}</p>
      <p className="mt-3 text-[13.5px] leading-relaxed text-parchment/60">{children}</p>
    </div>
  );
}

const btn = "inline-flex items-center gap-1.5 rounded-full px-6 py-3 text-sm font-medium transition-colors";

export default function Bench() {
  return (
    <BenchShell active="bench">
      <StepBeacon name="bench" />
      {/* ── the finding ── */}
      <section className="pb-12 pt-12 sm:pb-16 sm:pt-20">
        <p className="mb-5 text-[11px] uppercase tracking-[.22em] text-echo-soft">A twin audit of Twin-2K-500</p>
        <h1 className="max-w-[19ch] font-serif text-[clamp(2.15rem,5.6vw,4.1rem)] leading-[1.04] tracking-[-.025em] text-parchment">
          Every published AI twin we audited knows less about a person than a guess that knows nobody.
        </h1>
        <div className="mt-7 max-w-3xl space-y-4 text-[16px] leading-relaxed text-parchment/75 sm:text-[17px]">
          <p>
            <a className="kn-link" href={DATASET} rel="noreferrer">
              Twin-2K-500
            </a>{" "}
            (
            <a className="kn-link" href={PAPER} rel="noreferrer">
              Toubia et al., 2025
            </a>
            ) asked {count(audit.people)} people the same questions twice, and its authors released {total} AI twins of them: GPT-4.1, GPT-4.1-mini, Gemini 2.5 Flash and a fine-tuned GPT-4.1-mini, each built
            from the person&rsquo;s own earlier answers. We scored every twin against the crowd: the median answer of everyone else, which knows nobody.
          </p>
          <p>
            {All(below)} score below it. Given one earlier answer from the same person, {all(pastRetest)} rise above the person&rsquo;s own retest.
          </p>
        </div>
        <div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-3">
          <Stat value={`${below} of ${total}`}>twins are reliably less accurate than the crowd: the whole 95% interval is below zero.</Stat>
          <Stat value={`${pct(alone.lo)} to ${pct(alone.hi)}`}>of the knowable is what the twins know. The crowd is 0%, and everything knowable about a person is 100%.</Stat>
          <Stat value={`${pct(look.lo)} to ${pct(look.hi)}`}>is where the same twins land with one earlier answer per person. The person&rsquo;s own retest knows {pct(f("t1.know.again"))}.</Stat>
        </div>
        <div className="kn-noprint mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/audit" className={`${btn} bg-parchment text-ink hover:bg-white`}>
            Audit your own twins <span aria-hidden>›</span>
          </Link>
          <a href="#method" className="kn-link text-sm">
            Method and limits
          </a>
        </div>
        <p className="mt-8 max-w-3xl text-[13.5px] leading-relaxed text-parchment/55">
          This is about knowing individuals. It says nothing against a twin panel&rsquo;s accuracy on population averages, which is what most vendors report. No product was measured other than the twins the
          dataset&rsquo;s authors released.
        </p>
      </section>

      {/* ── the picture ── */}
      <Section id="twins" eyebrow="The twins" title={`${total} twins, one axis: the crowd is zero`} wide>
        <p className="max-w-3xl">
          Each row is one released twin, scored on the {count(audit.items)} items in {count(audit.groups)} tasks that people answered twice. A bar to the left of the line means the twin predicts a person worse than
          the crowd does. The dot is the same twin after it is shown one earlier answer from that person.
        </p>
        <Leaderboard result={audit} references={references} />
        <p className="max-w-3xl text-[13px] text-parchment/55">
          Accuracy is 1 − |guess − answer| / range, the dataset authors&rsquo; own metric, averaged within tasks, then over tasks, then over people, on the cells each twin answered. The crowd is scored on the
          same cells. Individual r is across people, per item, averaged the same way: the twins&rsquo; runs from {fixed(everyR.lo, 2)} to {fixed(everyR.hi, 2)}, the retest&rsquo;s is {fixed(f("t1.again.r"), 2)}.
        </p>
        <details className="max-w-4xl text-[13.5px]">
          <summary className="cursor-pointer text-parchment/65 hover:text-parchment">Task by task: the crowd, the headline twin, the retest, the echo and the ceiling</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left tabular-nums">
              <thead>
                <tr className="border-b border-parchment/15 text-[11.5px] text-parchment/50">
                  <th className="py-1.5 pr-3 font-medium">Task</th>
                  <th className="py-1.5 pr-3 text-right font-medium">ρ</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Crowd</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Headline twin (r)</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Retest (r)</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Echo, one look</th>
                  <th className="py-1.5 text-right font-medium">Ceiling</th>
                </tr>
              </thead>
              <tbody>
                {headline.tasks.map((t) => (
                  <tr key={t.task} className="border-b border-parchment/[0.07] text-parchment/80">
                    <td className="py-1.5 pr-3">{t.task}</td>
                    <td className="py-1.5 pr-3 text-right">{fixed(t.rho, 2)}</td>
                    <td className="py-1.5 pr-3 text-right">{fixed(t.crowd)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {fixed(t.twin)} <span className="text-parchment/50">({fixed(t.twin_r, 2)})</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {fixed(t.retest)} <span className="text-parchment/50">({fixed(t.retest_r, 2)})</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fixed(t.echo)}</td>
                    <td className="py-1.5 text-right">{fixed(t.ceiling)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12.5px] text-parchment/50">
            The headline twin is the dataset paper&rsquo;s own: Text Persona, GPT-4.1-mini. ρ is the share of an answer that is the person&rsquo;s steady way rather than the day.
          </p>
        </details>
      </Section>

      {/* ── the measure ── */}
      <Section id="measure" eyebrow="The measure" title="How the share of the knowable works" wide>
        <ol className="grid gap-4 md:grid-cols-3">
          <Step n={1} title="The crowd is 0%">
            For each person and item, guess the median answer of the other people. That guess knows nobody. Here it scores {fixed(f("t1.base.acc"))}, which is why accuracy alone flatters a twin: most people
            give the typical answer.
          </Step>
          <Step n={2} title="The ceiling is 100%">
            People do not answer the same way twice. From each item&rsquo;s test–retest agreement we work out the best any guess could score if it knew the person exactly, but not the day. Here that is{" "}
            {fixed(audit.ceiling.overall.ceiling)}.
          </Step>
          <Step n={3} title="A twin's place between">
            A twin halfway along knows half of what can be known about a person beyond the crowd. A twin below the crowd&rsquo;s line knows less than nobody. The person&rsquo;s own retest, one noisy answer guessing
            another, sits at {pct(f("t1.know.again"))}, not at the top.
          </Step>
        </ol>
        <p className="kn-surface overflow-x-auto rounded-xl border border-parchment/10 bg-ink-deep/55 px-5 py-4 text-center font-serif text-[1.05rem] italic text-parchment/90 sm:text-[1.2rem]">
          <span className="whitespace-nowrap">share of the knowable</span> = <span className="whitespace-nowrap">(twin&rsquo;s accuracy − crowd&rsquo;s accuracy)</span> /{" "}
          <span className="whitespace-nowrap">(ceiling − crowd&rsquo;s accuracy)</span>
        </p>
        <p className="max-w-3xl text-[13.5px] text-parchment/60">
          The form, a floor and a ceiling, follows Netzer and Sambandam (2026). The floor and the ceiling used here are our choices; both are set out under{" "}
          <a className="kn-link" href="#method">
            Method and limits
          </a>
          .
        </p>
      </Section>

      {/* ── one look ── */}
      <Section id="one-look" eyebrow="One look" title="One earlier answer does what the persona could not" wide>
        <div className="max-w-3xl space-y-4">
          <p>
            We gave each twin one thing more: the person&rsquo;s own earlier answer to the same item. A line from the twin&rsquo;s guess and that earlier answer to the later answer is fitted on other people, then
            rounded to an answer other people gave. Nobody&rsquo;s own answers enter their own prediction.
          </p>
          <p>
            {All(lifted)} twins rise: from between {pct(alone.lo)} and {pct(alone.hi)} of the knowable to between {pct(look.lo)} and {pct(look.hi)}. Alone they were {signed(gap.lo)} to {signed(gap.hi)} against the
            crowd in accuracy. With one look they score {fixed(lookAccuracy.lo)} to {fixed(lookAccuracy.hi)}, and {all(pastRetest)} pass the person&rsquo;s own retest on the same cells. Which twin the answer was read
            through hardly matters: after one look they sit within {Math.round(100 * (look.hi - look.lo))} points of each other.
          </p>
        </div>
        <div className="max-w-4xl">
          <Strip
            lanes={[
              { label: `The ${total} twins alone: ${pct(alone.lo)} to ${pct(alone.hi)}`, shares: twins.map(([, v]) => v.knows), colour: "alone" },
              { label: `The same ${total}, each given one earlier answer per person: ${pct(look.lo)} to ${pct(look.hi)}`, shares: twins.map(([, v]) => v.knows_with_one_look), colour: "look" },
              {
                label: `Yardsticks: the person's own retest (${pct(f("t1.know.again"))}) and an echo after three looks (${pct(f("t1.know.looks3"))}, the model's forecast)`,
                shares: [f("t1.know.again"), f("t1.know.looks3")],
                colour: "ref",
              },
            ]}
          />
        </div>
      </Section>

      {/* ── elsewhere ── */}
      <Section id="elsewhere" eyebrow="Not only this dataset" title="The same laws, with money at stake, across behaviour, and in two million people" wide>
        <p className="max-w-3xl">
          The theory behind the audit makes two plain claims. Copying a person&rsquo;s last answer beats the crowd only when the answer is more than half steady. Reading that one answer against the crowd, an echo,
          always does better than copying it. Three other public datasets say the same.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <Elsewhere name="Basel–Berlin Risk Study" value={`${f("t2.low.copy_negative")} of ${f("t2.low.n")}`} what="risk tasks less than half steady, where copying a person's past score loses to the crowd.">
            {f("t2.tasks")} incentivised tasks, {f("t2.n_min")} to {f("t2.n_max")} people, retested. Copying has a mean skill of {signed(f("t2.mean.copy"), 2)}. The echo, from the same single score, has{" "}
            {signed(f("t2.mean.echo"), 2)}: the best witness there, ahead of a persona ({signed(f("t2.mean.persona"), 2)}) and of self-reports ({signed(f("t2.mean.words"), 2)}).
          </Elsewhere>
          <Elsewhere name="Self-Regulation Ontology" value={signed(f("t3.deeds.mean.words"))} what={`is what people's words about themselves know of what they do, across ${f("t3.deeds.n")} behavioural measures.`}>
            Copying the last score loses to the crowd on {f("t3.deeds.low_negative")} of the {f("t3.deeds.low")} measures less than half steady. The echo beats copying on {f("t3.deeds.echo_beats")} of{" "}
            {f("t3.deeds.n")}, with a mean skill of {signed(f("t3.deeds.mean.echo"), 2)}.
          </Elsewhere>
          <Elsewhere name="Moral Machine" value={`${f("t4.x3.inside")} of ${f("t4.x3.points")}`} what="forecasts of how well a person is known after each further visit fall inside the measured 95% interval.">
            {count(f("t4.dilemmas"))} dilemmas from {count(f("t4.people"))} browsers. One visit knows more than a person&rsquo;s whole survey (age, gender, education, income, politics, religion, country) in{" "}
            {f("t4.m3.beats")} of {CONTRASTS.length} kinds of dilemma.
          </Elsewhere>
        </div>
        <div className="kn-surface rounded-xl border border-parchment/10 bg-ink-deep/55 p-5">
          <h3 className="font-serif text-[1.2rem] leading-snug text-parchment">How fast a person becomes knowable</h3>
          <p className="mb-5 mt-2 max-w-3xl text-[14px] leading-relaxed text-parchment/70">
            In the Moral Machine, a look is one visit&rsquo;s choices on one kind of dilemma. From pairs of visits alone, the theory forecasts the skill after each of the first {looksSeen} visits. Here it is against
            what was measured, on every browser seen more than {looksSeen} times ({count(f("t4.x3.people_min"))} to {count(f("t4.x3.people_max"))} per contrast). This panel was added after the analysis plan, and
            is reported as such.
          </p>
          <LooksCurve panels={looksPanels} />
        </div>
      </Section>

      {/* ── your own ── */}
      <Section id="audit" eyebrow="Your twins" title="Audit your own twins" wide>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="space-y-4">
            <p>
              Bring a panel that answered the same items twice, and your twins&rsquo; predictions for the second time. The audit returns this page&rsquo;s table for your twins: accuracy against the crowd, individual r,
              the share of the knowable, and what one earlier answer adds.
            </p>
            <p>It runs in your browser. Your panel is not uploaded, and there is nothing to sign up for.</p>
            <p className="kn-noprint pt-1">
              <Link href="/audit" className={`${btn} bg-parchment text-ink hover:bg-white`}>
                Open the twin audit <span aria-hidden>›</span>
              </Link>
            </p>
            <p className="text-[13.5px] text-parchment/55">
              We looked for a public place where anyone can score a twin panel at the individual level between a know-nobody floor and a reliability ceiling, in the browser, on their own data. We found none.
            </p>
          </div>
          <div className="min-w-0">
            <h3 className="font-serif text-[1.2rem] leading-snug text-parchment">API</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-parchment/70">
              The same audit as one stateless request. No key. Nothing is stored and no body is logged. Limits: {AUDIT_LIMITS.bytes / 1_000_000} MB, {count(AUDIT_LIMITS.people)} people, {count(AUDIT_LIMITS.items)}{" "}
              items, {count(AUDIT_LIMITS.twins)} twins.
            </p>
            <pre className="kn-surface mt-3 overflow-x-auto rounded-xl border border-parchment/10 bg-ink-deep/80 p-4 text-[12.5px] leading-relaxed text-parchment/85">
              <code>{CURL}</code>
            </pre>
          </div>
        </div>
      </Section>

      {/* ── method and limits ── */}
      <Section id="method" eyebrow="Method and limits" title="What this does and does not show">
        <ul className="space-y-4">
          <li>
            <b className="font-medium text-parchment">What was scored.</b> The {total} twins released by the dataset&rsquo;s authors, on the {count(audit.people)} people and the {count(audit.items)} items in{" "}
            {count(audit.groups)} tasks that were asked twice. A twin is scored only on the cells it answered, and the crowd on those same cells. Folds are over people: a person&rsquo;s crowd, and everything fitted for
            them, comes from other people. The ceiling is the whole panel&rsquo;s, so for a twin that answered only some of the people its share of the knowable is approximate; its difference from the crowd, which is
            like for like, is not.
          </li>
          <li>
            <b className="font-medium text-parchment">Individuals, not averages.</b> The result is about knowing individuals. It says nothing against population-level accuracy, which is what most vendors report.
          </li>
          <li>
            <b className="font-medium text-parchment">These twins, not every twin.</b> One dataset&rsquo;s released twins are not every vendor&rsquo;s product. No vendor&rsquo;s product other than the dataset authors&rsquo; released
            twins has been measured.
          </li>
          <li>
            <b className="font-medium text-parchment">The ceiling is a model; the crowd is measured.</b> The ceiling comes from an ordered latent model of each item, fitted to its answer shares and its test–retest
            agreement ({fixed(audit.ceiling.overall.ceiling)} here; 95% interval {fixed(f("t1.model.ceiling.lo"))} to {fixed(f("t1.model.ceiling.hi"))} over {f("t1.boot.draws")} bootstrap draws of people).
            Another model would move the 100% mark. It could not move a twin across the crowd&rsquo;s line, because that comparison uses no model.
          </li>
          <li>
            <b className="font-medium text-parchment">Whose idea the measure is.</b> Scoring between a floor and a ceiling is not ours to claim. Netzer and Sambandam, &ldquo;Synthetic Data in Marketing Research: How
            to Evaluate and When to Trust&rdquo; (
            <a className="kn-link" href="https://arxiv.org/abs/2609.13995" rel="noreferrer">
              arXiv:2609.13995
            </a>
            ), write that (Accuracy − Accuracy<sub>chance</sub>) / (Accuracy<sub>retest</sub> − Accuracy<sub>chance</sub>) &ldquo;anchors the results at both ends&rdquo;, and recommend the modal-answer predictor as
            the floor. Our measure follows that form, with two choices of our own. The floor is the crowd&rsquo;s out-of-fold median answer. The ceiling is not the raw retest but the best any guess could do given each
            item&rsquo;s test–retest reliability, which is why a person&rsquo;s own retest sits near the middle of the scale and not at 100%.
          </li>
          <li>
            <b className="font-medium text-parchment">Who came before.</b> Ceiling-only normalisations came first: Park et al. (
            <a className="kn-link" href="https://arxiv.org/abs/2411.10109" rel="noreferrer">
              arXiv:2411.10109
            </a>
            ) divide an agent&rsquo;s accuracy by the person&rsquo;s own replication accuracy, and Toubia et al. (
            <a className="kn-link" href="https://arxiv.org/abs/2505.17479" rel="noreferrer">
              arXiv:2505.17479
            </a>
            ) do the same for Twin-2K-500. Others have also reported that simple baselines match or beat LLM twins at the individual level: Peng, Toubia et al. (
            <a className="kn-link" href="https://arxiv.org/abs/2509.19088" rel="noreferrer">
              arXiv:2509.19088
            </a>
            ) and Chen, Zhu and Zheng (
            <a className="kn-link" href="https://arxiv.org/abs/2607.26348" rel="noreferrer">
              arXiv:2607.26348
            </a>
            ). What is here is what we measured.
          </li>
          <li>
            <b className="font-medium text-parchment">Our stake.</b> ECHO builds twins from observed behaviour, so we have a stake in this result. The code and the analysis plans are public so that anyone can rerun
            it.
          </li>
          <li>
            <b className="font-medium text-parchment">Plans, code, paper.</b> Analysis plans were committed before each analysis; what was added afterwards is said where it appears. The audit is{" "}
            <code className="text-[13px] text-parchment/90">research/deeds/audit.py</code> in the public repository{" "}
            <a className="kn-link" href={REPO} rel="noreferrer">
              github.com/artunbalta/echo
            </a>
            , with its tests. The paper is a manuscript under review. Twin-2K-500 is its authors&rsquo; work, used under its licence.
          </li>
        </ul>
      </Section>

      {/* ── send us yours ── */}
      <section className="kn-noprint border-t border-parchment/10 py-14 sm:py-20">
        <h2 className="max-w-2xl font-serif text-[1.9rem] leading-tight tracking-[-.01em] text-parchment sm:text-[2.5rem]">Send us your twins.</h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-parchment/70">
          If you build twins and have a panel that answered twice, we will run the audit with you and tell you what one look would add. If you would rather not send anything, the audit runs on your own machine.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a href={MAIL} className={`${btn} bg-echo text-ink-deep hover:bg-echo-soft`}>
            Send us your twins
          </a>
          <Link href="/audit" className="kn-link text-sm">
            Or audit them yourself
          </Link>
        </div>
      </section>
    </BenchShell>
  );
}
