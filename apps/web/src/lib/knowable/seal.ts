/**
 * Sealing a call (DECISIONS C89): the echo's guess is fixed, with its time, before the moment can be
 * seen, in a chain where each seal carries the one before it.
 *
 * WHY. A prediction shown after the fact is worth what the reader's trust is worth. The research was
 * held to plans committed before each analysis; a call about a person should be held to the same
 * thing. So each call is hashed with the hash before it (SHA-256 over a fixed spelling of its fields):
 * changing one afterwards, dropping one, or slipping one in breaks every seal after it, and
 * `brokenAt` says where.
 *
 * WHAT IT IS NOT. The chain lives in the visitor's own browser, so it shows that the record is whole,
 * not when it was written: someone with the page's storage open could rebuild all of it. A time nobody
 * could have made up needs a witness outside the browser, which is the server's to give when it has a
 * key (`known-gaps`: not built here).
 *
 * Pure but for `crypto.subtle`, which browsers (on https and localhost) and Node both have.
 */
import type { MomentKind } from "@echo/planet";

import type { Call } from "./calls";

/** What a seal fixes: which moment, the call, and when. */
export interface SealBody {
  /** Its place in the chain, from 0. */
  n: number;
  /** The moment, as the layer names it (`moment:<id>`). */
  ref: string;
  kind: MomentKind;
  /** The arm of its experiment that was met, or null. */
  arm: string | null;
  /** The echo's call: the outcome, how sure, and what chance would score. */
  call: string;
  p: number;
  chance: number;
  /** Whether it expected the family's act, and what the person's own words said (null: no call). */
  act: boolean | null;
  words: boolean | null;
  /** What most people did there, by the village's count as it stood (C91); null where it said nothing. */
  crowd: string | null;
  /** What a twin built from the person's own paragraph said for this moment and arm (C93); null with no twin, or no call. */
  twin: string | null;
  /** The earlier looks behind the call. */
  looks: Call["looks"];
  /** When it was sealed, ISO. */
  at: string;
}

export interface Sealed extends SealBody {
  /** The seal before it, or `GENESIS`. */
  prev: string;
  hash: string;
}

export const GENESIS = "0".repeat(64);

/** A seal's fields in one fixed spelling: the same call always hashes the same. */
export function spelling(prev: string, b: SealBody): string {
  return JSON.stringify([prev, b.n, b.ref, b.kind, b.arm, b.call, Number(b.p.toFixed(6)), Number(b.chance.toFixed(6)), b.act, b.words, b.crowd, b.twin, b.looks.same, b.looks.family, b.looks.anywhere, b.at]);
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Seal a call onto the chain's end. */
export async function seal(prev: string, body: SealBody): Promise<Sealed> {
  return { ...body, prev, hash: await sha256(spelling(prev, body)) };
}

/**
 * Where a chain stops being whole: the index of the first seal that does not follow, or null if all do.
 * A chain whose oldest seals were let go is checked from the first it kept.
 */
export async function brokenAt(chain: readonly Sealed[]): Promise<number | null> {
  const first = chain[0];
  if (!first) return null;
  if (first.n === 0 && first.prev !== GENESIS) return 0;
  let prev = first.prev;
  for (let i = 0; i < chain.length; i++) {
    const s = chain[i]!;
    if (s.n !== first.n + i || s.prev !== prev || s.hash !== (await sha256(spelling(prev, s)))) return i;
    prev = s.hash;
  }
  return null;
}
