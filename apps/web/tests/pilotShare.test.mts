/**
 * The debrief's share card (C83): its words carry the tally and the way to start a circle, never a choice,
 * a guess or a name; and only a circle's debrief offers it, never the study's.
 *
 * Run:  node --import tsx --test apps/web/tests/pilotShare.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { shareText } from "../src/lib/shareCard";

test("C83: the card says how many each came closest on, and how to start a circle, in both languages", () => {
  const en = shareText("en", { echo: 4, friends: 2, said: 1 }, 6, "https://echo.test/pilot");
  assert.equal(en.title, "Who knew me best?");
  assert.deepEqual(en.lines.map((l) => l.text), ["My echo: closest on 4 of 6", "My friends: closest on 2 of 6", "My own words: closest on 1 of 6"]);
  assert.match(en.footer, /https:\/\/echo\.test\/pilot$/);
  assert.ok(en.plain.startsWith("Who knew me best? My echo: closest on 4 of 6 · "));
  const tr = shareText("tr", { echo: 3, friends: 3, said: 0 }, 5, "https://echo.test/pilot");
  assert.deepEqual(tr.lines.map((l) => l.text), ["Yankım: 5 durumun 3 tanesinde en yakın", "Arkadaşlarım: 5 durumun 3 tanesinde en yakın", "Kendi sözlerim: 5 durumun 0 tanesinde en yakın"]);
});

test("C83: only a circle's debrief is shareable, and the card is drawn from the tally alone", () => {
  const route = readFileSync(new URL("../src/app/api/pilot/route.ts", import.meta.url), "utf8");
  assert.match(route, /shareable: !inStudy\(person\)/);
  const reveal = readFileSync(new URL("../src/components/pilot/PilotReveal.tsx", import.meta.url), "utf8");
  assert.match(reveal, /debrief\.shareable && met > 0/);
  assert.match(reveal, /shareText\(lang, debrief\.tally!, met,/);
  const card = readFileSync(new URL("../src/lib/shareCard.ts", import.meta.url), "utf8");
  for (const leak of ["rows", "said:", "did", "nickname", "guess"]) assert.ok(!card.includes(`text.${leak}`), leak);
});
