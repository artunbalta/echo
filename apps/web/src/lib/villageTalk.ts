/**
 * The server's half of talking to a villager (DECISIONS C42, C44): the village as it now is, the
 * conversation token, and the proximity check.
 *
 * A CONVERSATION BEGINS WHERE THE VILLAGER IS. `POST /api/village/talk/begin` is called the moment the
 * stranger presses E. The server works out where that villager is right now — by the same closed form
 * every browser draws them with — and refuses a stranger who is not within {@link TALK_REACH_M} of them
 * or a villager who is indoors. Only then does it sign a token for the conversation, and every line
 * after that carries it. The check is at the start and not on every line because a conversation stops
 * the villager in the stranger's view (`villagersLayer.hold`) while the closed form walks on: a minute
 * of talk is two world hours, and the schedule's villager is across the village by then.
 *
 * WHAT IT DOES NOT PROVE. The stranger's position is their own browser's word. A crafted client can
 * compute where any villager is and claim to stand there; what it cannot do is talk to someone who is
 * asleep, out at sea or gone, and it has to have built the village to try. The rate limit is still the
 * cost guard. That is written down in ⚑37's successor, not discovered.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { villageAt, worldClock, worldDayIndex, timeOfDay, WORLD_EPOCH, type LifeChange, type SettledParcel } from "@echo/planet";

import { planet } from "@/lib/planet";
import { identitySecrets } from "@/lib/subject";
import { villageStore, type VillageStore } from "@/lib/villageStore";

/** How far from where the closed form has them a stranger may stand and begin, metres. */
export const TALK_REACH_M = 25;
/** How long a conversation lasts before it has to begin again, real milliseconds. */
export const CONVERSATION_MS = 20 * 60 * 1000;

const DOMAIN = "echo-villager-conversation/v1";

const mac = (secret: string, subject: string, cell: string, person: string, startedAt: number) =>
  createHmac("sha256", secret).update(`${DOMAIN}|${subject}|${cell}|${person}|${startedAt}`).digest("base64url");

/** A token for one stranger's conversation with one villager, from now. Null without a signing key. */
export function signConversation(subject: string, cell: string, person: string, startedAt: number): string | null {
  const [secret] = identitySecrets();
  if (!secret) return null;
  return `${startedAt}.${mac(secret, subject, cell, person, startedAt)}`;
}

/** Whether a token is this stranger's, with this villager, and still fresh. Any current key verifies. */
export function verifyConversation(token: unknown, subject: string, cell: string, person: string, now: number): boolean {
  if (typeof token !== "string" || token.length > 200) return false;
  const dot = token.indexOf(".");
  const startedAt = Number(token.slice(0, dot));
  if (dot < 1 || !Number.isFinite(startedAt) || now - startedAt > CONVERSATION_MS || startedAt - now > 60_000) return false;
  const given = Buffer.from(token.slice(dot + 1));
  return identitySecrets().some((secret) => {
    const want = Buffer.from(mac(secret, subject, cell, person, startedAt));
    return want.length === given.length && timingSafeEqual(want, given);
  });
}

/** How long a villager's line may be spoken after it was said, real milliseconds (C60). */
export const LINE_MS = 10 * 60 * 1000;
const LINE_DOMAIN = "echo-villager-line/v1";
const lineMac = (secret: string, subject: string, cell: string, person: string, text: string, at: number) =>
  createHmac("sha256", secret).update(`${LINE_DOMAIN}|${subject}|${cell}|${person}|${at}|${text}`).digest("base64url");

/**
 * A token for one line a villager said to one stranger (C60): what lets the voice route speak those
 * words in that villager's voice, and no others. Without it the route would speak anything anyone
 * sent it, on this project's account.
 */
export function signLine(subject: string, cell: string, person: string, text: string, at: number): string | null {
  const [secret] = identitySecrets();
  if (!secret) return null;
  return `${at}.${lineMac(secret, subject, cell, person, text, at)}`;
}

export function verifyLine(token: unknown, subject: string, cell: string, person: string, text: string, now: number): boolean {
  if (typeof token !== "string" || token.length > 200) return false;
  const dot = token.indexOf(".");
  const at = Number(token.slice(0, dot));
  if (dot < 1 || !Number.isFinite(at) || now - at > LINE_MS || at - now > 60_000) return false;
  const given = Buffer.from(token.slice(dot + 1));
  return identitySecrets().some((secret) => {
    const want = Buffer.from(lineMac(secret, subject, cell, person, text, at));
    return want.length === given.length && timingSafeEqual(want, given);
  });
}

export interface LoadedVillage {
  village: SettledParcel;
  changes: LifeChange[];
  /** False when the store exists and could not be read: nothing may be written against this world. */
  readable: boolean;
  store: VillageStore | null;
  day: number;
  hour: number;
}

/**
 * The village on a cell as it now is: the seed's, with every change made to it. Null if there is no
 * village. When the changes cannot be read the seed's village is returned with `readable: false`, so
 * the villager can still answer and nothing is decided against a world the server did not see.
 */
export async function loadVillage(cell: string, now = Date.now()): Promise<LoadedVillage | null> {
  const { field, calibration, commons, world } = planet();
  const clock = worldClock(WORLD_EPOCH);
  const day = worldDayIndex(clock, now);
  const hour = timeOfDay(clock, now);
  const store = villageStore();
  const read = store ? await store.changesFor(cell) : [];
  const changes = read ?? [];
  const village = villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day, changes });
  if (!village) return null;
  return { village, changes, readable: read !== null, store, day, hour };
}
