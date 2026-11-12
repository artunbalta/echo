/**
 * What the friend's page says, written out once (DECISIONS C89).
 *
 *   node --import tsx apps/web/scripts/moment-catalogue.mjs
 *
 * One file, `src/lib/knowable/data/moments.json`: for every moment a call can be made at, its name,
 * the arms of its experiment and the ways it can end, in English and Turkish; the `guess.*` strings
 * of `lib/i18n.ts`; and how many moments a link may carry.
 *
 * WHY A COPY AND NOT AN IMPORT. `/guess` is the page a friend opens from a link, often on a phone. To
 * name five moments and their endings it imported the whole planet (terrain, society, navigation) for
 * `MOMENTS` and `verbsOf`, and the table of every string in the app for `t`: 290 kB of first load
 * against the 103 kB every page shares. So the page reads this copy (`lib/knowable/guessPage.ts`), and
 * `tests/guessPage.test.mts` fails when it has drifted from the planet, `say.ts`, `armWords.ts` or the
 * strings: no word on the page is typed twice, and none can go stale unnoticed.
 *
 * WHY NOT `say.ts` ITSELF. It reaches the strings through the `@/` alias, which tsx resolves only from
 * `apps/web`; this has to run from anywhere. So the words are put together here from the same parts,
 * and the test holds every one of them to what `say.ts` says.
 *
 * A first letter is capitalised in the language of the words, not of whoever runs this: "iki ağır
 * testi" begins "İki" in Turkish, and the file must come out the same on every machine.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { MOMENT_KINDS, MOMENTS, verbOf } from "@echo/planet";

import { LANGS, nameText, t, verbLabel } from "../src/lib/i18n.ts";
import { armWords } from "../src/lib/knowable/armWords.ts";
import { ON, outcomesOf } from "../src/lib/knowable/calls.ts";
import { GUESS_MAX, GUESS_MIN } from "../src/lib/knowable/guessLink.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FILE = resolve(HERE, "../src/lib/knowable/data/moments.json");

/** The page's own strings, by their keys in `lib/i18n.ts`. */
export const KEYS = [
  "guess.title", "guess.someone", "guess.lead", "guess.bad", "guess.begin", "guess.of", "guess.q", "guess.result",
  "guess.you", "guess.echo", "guess.did", "guess.won", "guess.lost", "guess.tie",
  "guess.yours", "guess.yours.lead", "guess.send", "guess.sent", "guess.score",
];

const capital = (lang, s) => s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);
const both = (words) => Object.fromEntries(LANGS.map((lang) => [lang, words(lang)]));

/** A string as the table holds it, `{name}` and all: `t` leaves alone what it is given nothing for. */
function string(lang, key) {
  try {
    return t(lang, key);
  } catch {
    throw new Error(`lib/i18n.ts has no ${key}`);
  }
}

/** One way a moment can end, as `say.ts` words it: its verb's label; walking on and the tale told have their own. */
function ending(kind, id) {
  if (id === ON) return { id, ...both((lang) => capital(lang, string(lang, "env.on"))) };
  if (id === "told") return { id, ...both((lang) => capital(lang, string(lang, "env.told"))) };
  const verb = verbOf(kind, id);
  if (!verb) throw new Error(`${kind} has no verb ${id}`);
  return { id, ...both((lang) => verbLabel(lang, verb.label)) };
}

/** moments.json, from the planet and the app's words as they stand. */
export function catalogueOf() {
  const moments = {};
  for (const kind of MOMENT_KINDS) {
    const def = MOMENTS[kind];
    // Never begun by itself (the mother waiting for the loaf), so never called, so never in a link.
    if (def.followUp) continue;
    moments[kind] = {
      name: both((lang) => capital(lang, nameText(lang, def.name))),
      // Every arm, so that a link's arm can be checked; null where an arm adds nothing to the name.
      arms: Object.fromEntries((def.arms ?? []).map((arm) => [arm.id, armWords("en", kind, arm.id) === null ? null : both((lang) => armWords(lang, kind, arm.id))])),
      outcomes: outcomesOf(kind).map((id) => ending(kind, id)),
    };
  }
  return {
    // Short: the page carries this line too.
    source: "apps/web/scripts/moment-catalogue.mjs",
    items: { min: GUESS_MIN, max: GUESS_MAX },
    moments,
    strings: Object.fromEntries(LANGS.map((lang) => [lang, Object.fromEntries(KEYS.map((key) => [key, string(lang, key)]))])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const catalogue = catalogueOf();
  writeFileSync(FILE, JSON.stringify(catalogue, null, 1) + "\n");
  console.log(`moments.json: ${Object.keys(catalogue.moments).length} moments, ${KEYS.length} strings`);
}
