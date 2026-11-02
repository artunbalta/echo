/**
 * What a villager knows of one stranger beyond what they remember being told (C45, C57, C59, C71): what
 * the stranger has done in the village, seen or heard of; how they came ashore; a house of their own on
 * this land; and having seen them on the green talking with another stranger they seemed to know (their
 * echoes, meeting, C71), with what was said aloud. Said to the villager's model as part of the hour's note.
 *
 * Shared by the talk route and the echo's outings (C64), so a villager meeting the stranger's echo
 * knows exactly what they would know meeting the stranger. Server-only.
 */
import "server-only";

import { deedWords, knownDeeds, knownLandings, landingWords, type Deed, type Person, type SettledParcel } from "@echo/planet";

import { seenTalkingLine } from "@/lib/meetingWords";
import type { VillageStore } from "@/lib/villageStore";

export async function strangerNotes(
  store: VillageStore | null,
  subject: string,
  cell: string,
  village: SettledParcel,
  me: Person,
  day: number,
  /** Names the villager may say; the places the stranger came from are added to it. */
  names: Set<string>,
): Promise<{ deeds: Deed[]; doings: string; came: string; homeLine: string; seenTalking: string }> {
  const s = village.settlement;
  // What this villager knows of what the stranger has DONE here (C45): seen, found, or heard from family.
  const deeds = store ? ((await store.deedsFor(subject, cell)) ?? []) : [];
  const seen = knownDeeds(s, me, deeds, day, village.plan).slice(-8);
  const doings = seen.length
    ? `What you know of this stranger's doings in ${s.name}:\n- ${seen.map((k) => deedWords(s, me, k, day)).join("\n- ")}\nLet it colour how you speak to them, as it would anyone's.`
    : "";
  // How they came (C57): in out of the sea on a raft, seen or heard of, and from which direction.
  const landings = store ? ((await store.landingsIn(subject, cell)) ?? []) : [];
  const ashore = knownLandings(me, landings, day).slice(-3);
  for (const k of ashore) if (k.landing.fromName) names.add(k.landing.fromName);
  const came = ashore.length ? `How this stranger came to ${s.name}, as far as you know:\n- ${ashore.map((k) => landingWords(s, k, day)).join("\n- ")}` : "";
  // A stranger's own house on this land (C59): how far it has got, where, and whether it is this one's.
  const house = store ? ((await store.homeIn(cell)) ?? null) : null;
  let homeLine = "";
  if (house) {
    const mine = (await store!.homeOf(subject))?.cell === cell;
    const what = ["has marked out a house", "has laid the foundation stones of a house", "has the walls of a house up", "has the roof on a house", "has built a house"][Math.max(0, Math.min(4, house.stage))];
    const dx = house.x - village.plan.centre.x;
    const dy = house.y - village.plan.centre.y;
    const dir = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"][((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
    const where = `${Math.round(Math.hypot(dx, dy) / 10) * 10} metres ${dir} of the green`;
    homeLine = mine
      ? `This stranger ${what} of their own on this land, ${where}: the land is theirs, by the registry's say.`
      : `A stranger ${what} of their own on this land, ${where} — not the one in front of you.`;
  }
  // Seen on the green with another stranger (C71): only by those who were there, only what was said aloud.
  const meetings = store ? ((await store.meetingsOf(subject, 20)) ?? []) : [];
  const seenTalking = seenTalkingLine(meetings, subject, cell, me.id, day);
  return { deeds, doings, came, homeLine, seenTalking };
}
