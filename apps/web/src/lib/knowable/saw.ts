/**
 * What the echo saw (DECISIONS C89): a visitor's own record said back to them in a few plain
 * sentences. "You stopped for three of the four you met in trouble."
 *
 * WHY. The count of calls says how well the echo guessed; it does not say what the person did. And on
 * a site where the engine behind the eight axes is not answering, nothing else says anything about
 * them at all. These lines need nothing but the envelopes already settled in the browser.
 *
 * FACTS, NOT TRAITS. Every line is a count of things that happened, in the family's own terms: how
 * many in trouble were met and how many were stopped for. It never says what kind of person that
 * makes someone (L8: no score), never compares them with anyone, and says nothing of a family until
 * it has been met twice (the tale, which is one moment, once).
 *
 * Both languages are here rather than in the chrome's table, as the arms' words are: they are
 * sentences about the world's own moments, built from counts.
 */
import type { Lang } from "@/lib/i18n";

import { actsOf, FAMILY_NAMES, familyOf, ON, type Family, type Look } from "./calls";

/** Looks a family needs before a line is said of it. */
const ENOUGH: Record<Family, number> = { help: 2, honesty: 2, courtesy: 2, conformity: 2, order: 2, curiosity: 1 };
/**
 * Families counted only where the person chose (the registered analysis's rule for decisions,
 * `moments.py` DECIDED): walking past a purse is not a choice about honesty, and a line that counted
 * it as "not the honest thing" would say something of a person that the record does not.
 */
const CHOSEN_ONLY: ReadonlySet<Family> = new Set(["honesty"]);

const times = (k: number) => (k === 1 ? "once" : k === 2 ? "twice" : `${k} times`);
const Times = (k: number) => times(k).charAt(0).toUpperCase() + times(k).slice(1);

type Said = (k: number, n: number) => string;
/** One sentence a family, by how many of the n times the family's act was done: all, none, or some. */
const LINES: Record<Family, Record<Lang, { all: Said; none: Said; some: Said }>> = {
  help: {
    en: {
      // "Gave your time", not "stopped" or "walked past": the family's act is help at a cost, and
      // someone who pointed a pedlar the way did not walk past him, and did not give him their time.
      all: (_k, n) => (n === 2 ? "You gave your time to both of the two you met in trouble." : `You gave your time to all ${n} you met in trouble.`),
      none: (_k, n) => (n === 2 ? "You met two in trouble, and gave your time to neither." : `You met ${n} in trouble, and gave your time to none of them.`),
      some: (k, n) => `You gave your time to ${k} of the ${n} you met in trouble.`,
    },
    tr: {
      all: (_k, n) => `Zor durumda gördüğün ${n} kişinin hepsine vakit ayırdın.`,
      none: (_k, n) => `Zor durumda ${n} kişi gördün; hiçbirine vakit ayırmadın.`,
      some: (k, n) => `Zor durumda gördüğün ${n} kişiden ${k} tanesine vakit ayırdın.`,
    },
  },
  honesty: {
    en: {
      all: (_k, n) => `${Times(n)} honesty was yours to choose, and you chose it each time.`,
      none: (_k, n) => `${Times(n)} honesty was yours to choose, and you chose otherwise each time.`,
      some: (k, n) => `${Times(n)} honesty was yours to choose; you chose it ${times(k)}.`,
    },
    tr: {
      all: (_k, n) => `${n} kez dürüst olmak senin elindeydi; hepsinde dürüst olanı seçtin.`,
      none: (_k, n) => `${n} kez dürüst olmak senin elindeydi; hiçbirinde onu seçmedin.`,
      some: (k, n) => `${n} kez dürüst olmak senin elindeydi; ${k} tanesinde dürüst olanı seçtin.`,
    },
  },
  courtesy: {
    en: {
      all: (_k, n) => `${Times(n)} someone crossed your path, and you were courteous every time.`,
      none: (_k, n) => `${Times(n)} someone crossed your path, and you gave none of them a courteous answer.`,
      some: (k, n) => `${Times(n)} someone crossed your path; you were courteous ${times(k)}.`,
    },
    tr: {
      all: (_k, n) => `${n} kez biri yoluna çıktı; hepsinde nazik davrandın.`,
      none: (_k, n) => `${n} kez biri yoluna çıktı; hiçbirine nazik bir karşılık vermedin.`,
      some: (k, n) => `${n} kez biri yoluna çıktı; ${k} tanesinde nazik davrandın.`,
    },
  },
  conformity: {
    en: {
      all: (_k, n) => `${Times(n)} the village did something its own way, and each time you did as it does.`,
      none: (_k, n) => `${Times(n)} the village did something its own way, and you went along with none of them.`,
      some: (k, n) => `${Times(n)} the village did something its own way; you did as it does ${times(k)}.`,
    },
    tr: {
      all: (_k, n) => `Köy ${n} kez bir şeyi kendi usulünce yaptı; hepsinde sen de öyle yaptın.`,
      none: (_k, n) => `Köy ${n} kez bir şeyi kendi usulünce yaptı; hiçbirine uymadın.`,
      some: (k, n) => `Köy ${n} kez bir şeyi kendi usulünce yaptı; ${k} tanesinde sen de öyle yaptın.`,
    },
  },
  order: {
    en: {
      all: (_k, n) => (n === 2 ? "You put right both of the two things you found out of place." : `You put right all ${n} things you found out of place.`),
      none: (_k, n) => `You found ${n} things out of place, and left them as they were.`,
      some: (k, n) => `You put right ${k} of the ${n} things you found out of place.`,
    },
    tr: {
      all: (_k, n) => `Yerinde durmayan ${n} şeyin hepsini düzelttin.`,
      none: (_k, n) => `Yerinde durmayan ${n} şey gördün; olduğu gibi bıraktın.`,
      some: (k, n) => `Yerinde durmayan ${n} şeyden ${k} tanesini düzelttin.`,
    },
  },
  curiosity: {
    en: {
      all: (_k, n) => (n === 1 ? "A story stopped before its end, and you stayed for the end." : `${Times(n)} a story stopped before its end, and you stayed for every ending.`),
      none: (_k, n) => (n === 1 ? "A story stopped before its end, and you walked on." : `${Times(n)} a story stopped before its end, and you walked on each time.`),
      some: (k, n) => `${Times(n)} a story stopped before its end; you stayed for ${k} of the endings.`,
    },
    tr: {
      all: (_k, n) => (n === 1 ? "Bir hikâye sonuna gelmeden kesildi; sonunu dinlemek için kaldın." : `${n} kez bir hikâye sonuna gelmeden kesildi; hepsinin sonunu bekledin.`),
      none: (_k, n) => (n === 1 ? "Bir hikâye sonuna gelmeden kesildi; yürüyüp geçtin." : `${n} kez bir hikâye sonuna gelmeden kesildi; her seferinde yürüyüp geçtin.`),
      some: (k, n) => `${n} kez bir hikâye sonuna gelmeden kesildi; ${k} tanesinin sonunu bekledin.`,
    },
  },
};

const TOOK_PART: Record<Lang, Said> = {
  en: (k, n) => `Of ${n} things that happened near you, you took part in ${k}.`,
  tr: (k, n) => `Yakınında olan ${n} şeyden ${k} tanesine katıldın.`,
};

/**
 * A family's count: how many of its moments were met (for honesty, how many were chosen at), and at
 * how many its act was done.
 */
export function familyCounts(looks: readonly Look[]): Record<Family, { met: number; did: number }> {
  const out = Object.fromEntries(FAMILY_NAMES.map((f) => [f, { met: 0, did: 0 }])) as Record<Family, { met: number; did: number }>;
  for (const l of looks) {
    const f = familyOf(l.kind);
    if (!f || (CHOSEN_ONLY.has(f) && l.outcome === ON)) continue;
    out[f].met++;
    if (actsOf(l.kind).includes(l.outcome)) out[f].did++;
  }
  return out;
}

/**
 * What the record says, in at most `max` sentences: first how much of what happened they took part
 * in (once five things have), then the families met most. Nothing where there is too little to say.
 */
export function sawLines(lang: Lang, looks: readonly Look[], max: number = 3): string[] {
  const lines: string[] = [];
  if (looks.length >= 5) lines.push(TOOK_PART[lang](looks.filter((l) => l.outcome !== ON).length, looks.length));
  const counts = familyCounts(looks);
  const said = FAMILY_NAMES.filter((f) => counts[f].met >= ENOUGH[f]).sort((a, b) => counts[b].met - counts[a].met);
  for (const f of said) {
    const { met, did } = counts[f];
    const line = LINES[f][lang];
    lines.push(did === met ? line.all(did, met) : did === 0 ? line.none(did, met) : line.some(did, met));
  }
  return lines.slice(0, max);
}
