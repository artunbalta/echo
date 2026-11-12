/**
 * The link a friend guesses from (DECISIONS C89): a handful of the moments someone met, what their echo
 * called, and what they did, carried in the address's fragment and nowhere else.
 *
 * WHY THE FRAGMENT. The part of an address after `#` is never sent to a server, so the choices a person
 * decides to show a friend go from their browser to the friend's and are read there. Nothing is stored,
 * and there is nothing to erase but the message they sent it in.
 *
 * The friend is the human baseline the research needs (C76: friends guess what friends would do), and
 * the way a second person arrives. Here it needs no account and no server.
 *
 * This is the village's half: choosing what goes and writing it. Reading it is the friend's page's,
 * in `guessPage.ts` (`decodeGuess`), which must not import this file: it brings the planet with it.
 */
import type { MomentKind } from "@echo/planet";

import { familyOf } from "./calls";
import type { Envelope } from "./envelopes";

export interface GuessItem {
  /** The moment, the arm met, the echo's call, and what was done. */
  k: MomentKind;
  a: string | null;
  c: string;
  d: string;
}

export interface GuessLink {
  v: 1;
  /** The name they chose to go by, or empty. */
  n: string;
  items: GuessItem[];
}

export const GUESS_MAX = 8;
export const GUESS_MIN = 3;

/**
 * Which opened envelopes go to a friend: one per kind of moment, the latest of each, those that read
 * something (a family's) before those that do not, eight at most.
 */
export function pickForFriend(opened: readonly Envelope[], max: number = GUESS_MAX): GuessItem[] {
  const latest = new Map<MomentKind, Envelope>();
  for (const e of opened) if (e.did !== null) latest.set(e.kind, e);
  return [...latest.values()]
    .sort((x, y) => Number(familyOf(y.kind) !== null) - Number(familyOf(x.kind) !== null) || y.n - x.n)
    .slice(0, max)
    .map((e) => ({ k: e.kind, a: e.arm, c: e.call, d: e.did! }));
}

const toB64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function encodeGuess(link: GuessLink): string {
  return toB64Url(new TextEncoder().encode(JSON.stringify(link)));
}
