/**
 * A SYNTHETIC panel for the audit's demo and its template files (DECISIONS C90). Nobody's data.
 *
 * WHY SYNTHETIC. The research's panels are other people's (Twin-2K-500 and the rest, under their own
 * licences, kept out of the repository). A visitor still needs to see the tool run, and the exact
 * files it reads. So the demo is drawn from the audit's own model of an answer (./ceiling.ts): a
 * steady level per person and item with reliability ρ, noise on each occasion, cut into an ordered
 * scale. Every name it makes says "synthetic", and so does every place it is shown.
 *
 * THREE TWINS, built to behave as the measured ones did, so the demo shows the real shape:
 * - a persona twin: it does carry a little of the person (r about 0.1 with their answers), but it
 *   spreads its guesses nearly as wide as people's own answers, far wider than so little knowledge
 *   can justify, and leans high. So it scores under the crowd;
 * - a crowd copier: the most common earlier answer, for everyone. It knows nobody;
 * - the retest: the person's own earlier answer.
 *
 * Seeded: the same options give the same files, so a template downloaded twice is one template.
 *
 * Pure.
 */
import type { Items, Table } from "./audit";
import { rng } from "./stats";

export interface SynthOptions {
  people?: number;
  items?: number;
  groups?: number;
  seed?: number;
}

export interface SynthPanel {
  /** Always true. Carried with the data so that nothing downstream can forget it. */
  synthetic: true;
  items: Items;
  earlier: Table;
  truth: Table;
  twins: Record<string, Table>;
}

export const SYNTH_TWINS = {
  persona: "Persona twin (synthetic)",
  crowd: "Crowd copier (synthetic)",
  retest: "Retest (synthetic)",
} as const;

/** Every synthetic person's id begins so, which is how a template file dropped back in is still known for what it is. */
const ID = "syn-";

/** True when every person is one of this file's making: the panel is the demo's, however it arrived. */
export function isSynthetic(ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => id.startsWith(ID));
}

const KINDS = ["sharing", "risk", "patience", "trust", "fairness", "effort", "honesty", "caution", "candour", "thrift", "resolve", "curiosity"];

export function synthPanel(opts: SynthOptions = {}): SynthPanel {
  const n = Math.max(40, Math.floor(opts.people ?? 600));
  const m = Math.max(2, Math.floor(opts.items ?? 24));
  const g = Math.min(m, Math.max(1, Math.floor(opts.groups ?? 6)));
  const r = rng(opts.seed ?? 2058);

  const groupName = (k: number) => (k < KINDS.length ? KINDS[k]! : `${KINDS[k % KINDS.length]} ${Math.floor(k / KINDS.length) + 1}`);
  const spec = Array.from({ length: m }, (_, j) => {
    const group = j % g;
    const levels = group % 2 === 0 ? 5 : 7;
    const rho = 0.4 + 0.45 * r.next();
    // the cut-points between neighbouring answers: evenly spaced, the whole scale nudged off centre
    const width = (levels === 5 ? 0.75 : 0.55) * (0.85 + 0.3 * r.next());
    const shift = 0.6 * (r.next() - 0.5);
    const cut = Array.from({ length: levels - 1 }, (_, k) => (k - (levels - 2) / 2) * width + shift);
    return { item: `${groupName(group).replace(" ", "_")}_${Math.floor(j / g) + 1}`, group, levels, rho, cut };
  });
  const answer = (latent: number, cut: number[]) => {
    let k = 0;
    while (k < cut.length && latent > cut[k]!) k++;
    return k + 1;
  };

  const ids = Array.from({ length: n }, (_, i) => `${ID}${String(i + 1).padStart(4, "0")}`);
  const earlier: (number | null)[][] = [];
  const truth: (number | null)[][] = [];
  const persona: (number | null)[][] = [];
  const personaIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const kind = Array.from({ length: g }, () => r.normal()); // a person's way with a whole kind of question
    const e: (number | null)[] = [];
    const t: (number | null)[] = [];
    const p: (number | null)[] = [];
    for (const s of spec) {
      const own = Math.sqrt(0.3) * kind[s.group]! + Math.sqrt(0.7) * r.normal(); // unit variance
      const steady = Math.sqrt(s.rho) * own;
      const day = () => Math.sqrt(1 - s.rho) * r.normal();
      e.push(r.next() < 0.015 ? null : answer(steady + day(), s.cut));
      t.push(r.next() < 0.015 ? null : answer(steady + day(), s.cut));
      // the persona twin: 0.15 of the person and the rest its own noise, spread nearly as wide as people's
      // answers (×0.85) where so little knowledge should stay near the median, and leaning high (+0.25)
      p.push(answer(0.85 * (0.15 * own + Math.sqrt(1 - 0.15 * 0.15) * r.normal()) + 0.25, s.cut));
    }
    earlier.push(e);
    truth.push(t);
    if (r.next() >= 0.03) {
      // a twin is seldom built for everyone: this one is silent for about 3 in 100
      persona.push(p);
      personaIds.push(ids[i]!);
    }
  }

  const columns = spec.map((s) => s.item);
  const mode = spec.map((s, j) => {
    const counts = new Array<number>(s.levels + 1).fill(0);
    for (const row of earlier) if (row[j] != null) counts[row[j]!]++;
    return counts.indexOf(Math.max(...counts));
  });
  const earlierTable: Table = { ids, columns, values: earlier };
  return {
    synthetic: true,
    items: spec.map((s) => ({ item: s.item, group: groupName(s.group), lo: 1, hi: s.levels })),
    earlier: earlierTable,
    truth: { ids, columns, values: truth },
    twins: {
      [SYNTH_TWINS.persona]: { ids: personaIds, columns, values: persona },
      [SYNTH_TWINS.crowd]: { ids, columns, values: ids.map(() => [...mode]) },
      [SYNTH_TWINS.retest]: { ids, columns, values: earlier.map((row) => [...row]) },
    },
  };
}
