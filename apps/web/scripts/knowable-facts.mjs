/**
 * The numbers `/bench` shows, taken from the research record (DECISIONS C90).
 *
 *   node apps/web/scripts/knowable-facts.mjs
 *
 * Two files under `src/lib/knowable/data/`:
 * - `twin2k-audit.json`: a byte-for-byte copy of `research/deeds/runs/twin2k-audit.json`;
 * - `headline.json`: the few values of `research/deeds/runs/facts.json` the page quotes, under the
 *   same keys, plus Twin-2K-500's task table read out of its markdown into rows.
 *
 * WHY A COPY AND NOT AN IMPORT. The web app builds on its own, without the research folder beside
 * it. So the page reads copies, and `tests/knowable.test.mts` fails when either has drifted from the
 * record: no number on the page is typed by hand, and none can go stale unnoticed.
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const RUNS = resolve(HERE, "../../../research/deeds/runs");
export const DATA = resolve(HERE, "../src/lib/knowable/data");

/** The Moral Machine's six contrasts, as facts.json abbreviates them. */
export const CONTRASTS = ["species", "age", "util", "gender", "fitness", "status"];

const KEYS = [
  // Twin-2K-500
  "t1.people", "t1.columns", "t1.tasks", "t1.cells", "t1.llm.specs", "t1.llm.below_crowd",
  "t1.base.acc", "t1.again.acc", "t1.again.r", "t1.echo.acc",
  "t1.model.base", "t1.model.ceiling", "t1.model.ceiling.lo", "t1.model.ceiling.hi", "t1.model.looks1", "t1.model.looks3", "t1.boot.draws",
  "t1.know.again", "t1.know.again.lo", "t1.know.again.hi", "t1.know.echo", "t1.know.echo.lo", "t1.know.echo.hi",
  "t1.know.looks1", "t1.know.looks3", "t1.know.looks8",
  // Basel–Berlin Risk Study
  "t2.tasks", "t2.n_min", "t2.n_max", "t2.low.n", "t2.low.copy_negative", "t2.mean.copy", "t2.mean.echo", "t2.mean.persona", "t2.mean.words",
  "t2.echo_beats_copy", "t2.copy_theory_corr",
  // Self-Regulation Ontology, the behavioural measures
  "t3.deeds.n", "t3.deeds.mean.words", "t3.deeds.mean.copy", "t3.deeds.mean.echo", "t3.deeds.low", "t3.deeds.low_negative", "t3.deeds.echo_beats",
  "t3.deeds.echo_rho2_corr",
  // Moral Machine
  "t4.dilemmas", "t4.people", "t4.survey", "t4.m2.holds", "t4.m3.beats", "t4.m3.gap", "t4.m3.gap.lo", "t4.m3.gap.hi",
  "t4.x3.points", "t4.x3.inside", "t4.x3.people_min", "t4.x3.people_max", "t4.x3.corr",
  ...CONTRASTS.flatMap((c) => [`t4.x3.${c}.people`, `t4.x3.${c}.rho`, ...[1, 2, 3].flatMap((n) => ["pred", "obs", "lo", "hi"].map((k) => `t4.x3.${c}.${k}${n}`))]),
];

const number = (cell) => Number(cell.replace("−", "-"));

/** `| task | ρ | crowd | twin (r) | retest (r) | echo | ceiling |` rows, as numbers. */
function tasksOf(markdown) {
  return markdown
    .split("\n")
    .slice(2)
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .map(([task, rho, crowd, twin, retest, echo, ceiling]) => {
      const pair = (cell) => /^(\S+) \((\S+)\)$/.exec(cell).slice(1).map(number);
      const [twinAcc, twinR] = pair(twin);
      const [retestAcc, retestR] = pair(retest);
      return { task, rho: number(rho), crowd: number(crowd), twin: twinAcc, twin_r: twinR, retest: retestAcc, retest_r: retestR, echo: number(echo), ceiling: number(ceiling) };
    });
}

/** headline.json from facts.json. A key the record no longer has is an error, not a blank on the page. */
export function headlineOf(facts) {
  const absent = [...KEYS, "t1.table.tasks"].filter((k) => !(k in facts));
  if (absent.length) throw new Error(`facts.json has no ${absent.join(", ")}`);
  return {
    source: "research/deeds/runs/facts.json",
    facts: Object.fromEntries(KEYS.map((k) => [k, facts[k]])),
    tasks: tasksOf(facts["t1.table.tasks"]),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  copyFileSync(resolve(RUNS, "twin2k-audit.json"), resolve(DATA, "twin2k-audit.json"));
  const headline = headlineOf(JSON.parse(readFileSync(resolve(RUNS, "facts.json"), "utf8")));
  writeFileSync(resolve(DATA, "headline.json"), JSON.stringify(headline, null, 1) + "\n");
  console.log(`twin2k-audit.json copied; headline.json: ${Object.keys(headline.facts).length} facts, ${headline.tasks.length} tasks`);
}
