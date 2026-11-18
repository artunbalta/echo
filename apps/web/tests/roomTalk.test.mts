/**
 * Who is who in a village room (DECISIONS C107): someone who came in is told to the talk panel as a
 * villager is, the nearer of the two is the one `T` talks to, their plate is a visitor's in the village's own
 * tongue, and the door says who you are here in both languages.
 *
 * Run:  node --import tsx --test apps/web/tests/roomTalk.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { roomLookOf } from "@echo/shared";
import { visitorName } from "@echo/planet";

import { nearestToTalk } from "../src/game/world/othersLayer";
import { visitorLine, type NearVillager } from "../src/game/world/villagersLayer";
import { t } from "../src/lib/i18n";

/** A world with a villager and someone who came in, each at a distance. */
function ctxWith(villager: NearVillager | null, person: NearVillager | null) {
  const layers: Record<string, unknown> = {
    villagers: { nearest: () => villager },
    others: { nearest: () => person },
  };
  return { layer: (name: string) => layers[name] } as never;
}
const v = (d: number): NearVillager => ({ id: "p17", name: "Brannoc Velt", occupation: "potter", age: 51, distanceM: d });
const o = (d: number): NearVillager => ({ id: "AbC123xyz", name: "Maren Holtscree", occupation: "weaver", age: 34, distanceM: d, room: true });

test("whoever is nearer is the one T talks to, villager or someone who came in, told the same way", () => {
  assert.equal(nearestToTalk(ctxWith(v(4), o(2)))?.id, "AbC123xyz");
  assert.equal(nearestToTalk(ctxWith(v(2), o(4)))?.id, "p17");
  assert.equal(nearestToTalk(ctxWith(null, o(5)))?.room, true);
  assert.equal(nearestToTalk(ctxWith(v(5), null))?.room, undefined);
  assert.equal(nearestToTalk(ctxWith(null, null)), null);
  assert.equal(nearestToTalk(null), null);
  // Everything the panel shows of either comes from the same four fields.
  assert.deepEqual(Object.keys(o(1)).filter((k) => k !== "room").sort(), Object.keys(v(1)).sort());
});

test("a body's name is drawn from its look in this copy, in the village's tongue; another copy, another name", () => {
  const here = roomLookOf("subject-a", "ABCDE");
  const there = roomLookOf("subject-a", "FGHJK");
  assert.deepEqual(visitorName("upland", here.seed), visitorName("upland", here.seed), "every page names the same body alike");
  assert.notDeepEqual(visitorName("upland", here.seed), visitorName("upland", there.seed), "in the next copy, somebody else");
});

test("the plate of someone who came in says what a real visitor's says, word for word", () => {
  assert.equal(visitorLine("Brannoc Velt"), "Here for the day from another village, visiting Brannoc Velt.");
});

test("the door says who you are here, and that some may be someone's echo, in both languages", () => {
  for (const lang of ["en", "tr"] as const) {
    const you = t(lang, "room.you", { name: "Maren Holtscree", age: 34, trade: "weaver" });
    for (const part of ["Maren Holtscree", "34", "weaver"]) assert.ok(you.includes(part), `${part} in "${you}"`);
    assert.ok(/echo/.test(t(lang, "room.notice")), "the door says some may be someone's echo");
    for (const k of ["watch.said", "watch.noAnswer", "watch.someone", "watch.you"] as const) assert.ok(t(lang, k) && t(lang, k) !== k, k);
  }
});
