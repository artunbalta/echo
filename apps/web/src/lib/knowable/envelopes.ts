/**
 * The visitor's envelopes (DECISIONS C89): every call the echo sealed about them, what became of each
 * moment, and which they have opened. One record, kept in their own browser and nowhere else.
 *
 * An envelope is a seal (`seal.ts`) plus what happened: `did` is set once the moment is over and was
 * seen (the layer's rule, C88: near and in view for a second); a moment never seen leaves its envelope
 * sealed for good, and it is never shown. The record is also the echo's whole memory here: its next
 * call is made from the envelopes already settled (`callFor`), so nothing is counted that was not
 * first sealed.
 *
 * Nothing in this file touches the server. Erasing is `forget()`: the key is removed, and with it the
 * calls, the outcomes, the person's own words, and the twin a model made of them (C93: its guesses
 * only; the paragraph it was made from was never here to erase).
 */
import type { MomentKind } from "@echo/planet";

import { callFor, outcomeClass, wordsCall, type Look, type Opened, type Words } from "./calls";
import { crowdCall, priorOf, type CountRow, type Crowd } from "./crowd";
import { GENESIS, seal, type Sealed } from "./seal";
import { readTwin, twinCall, type Twin } from "./twin";

export interface Envelope extends Sealed {
  /** What became of the moment, as `outcomesOf` names it; null until it is over, or if it was never seen. */
  did: string | null;
  /** Whether the visitor has opened it. */
  open: boolean;
  /** Whether it has been added to the village's count (C91); only ever by someone who said yes to that. */
  sent?: boolean;
}

export interface Book {
  v: 1;
  chain: Envelope[];
  /** What the person said of themselves before walking, or null. */
  words: Words | null;
  /** The twin a model built from a paragraph they wrote (C93): its calls, never the paragraph. Null until they ask for one. */
  twin: Twin | null;
}

export const BOOK_KEY = "echo.calls";
/** The chain kept: older envelopes fall off the front, and the chain is checked from the first kept. */
const KEEP = 400;

export const emptyBook = (): Book => ({ v: 1, chain: [], words: null, twin: null });

/** Every moment settled so far, oldest first: what the next call is made from. */
export function looksOf(book: Book): Look[] {
  return book.chain.filter((e) => e.did !== null).map((e) => ({ kind: e.kind, outcome: e.did! }));
}

/**
 * Seal the echo's call for a moment that has just begun. A moment already sealed is left as it is.
 * `crowd` is the village's count where there is one (C91): the call starts from it, and what most
 * people did there is sealed beside the call, as the count stood. So is what the person's own words
 * said, and what a twin built from their paragraph said (C93), as each stood: neither moves the call.
 */
export async function sealMoment(book: Book, m: { ref: string; kind: MomentKind; arm: string | null }, at: string, crowd: Crowd | null = null): Promise<Book> {
  if (book.chain.some((e) => e.ref === m.ref)) return book;
  // A kind that names no outcome a call could be held to (the errand's far end) gets no envelope.
  if (outcomeClass(m.kind, "none") === null) return book;
  // The moment about to be met is read by its arm; the ones before it by their kind alone.
  const call = callFor(looksOf(book), m.kind, (k) => priorOf(crowd, k, k === m.kind ? m.arm : null));
  const last = book.chain[book.chain.length - 1];
  const sealed = await seal(last?.hash ?? GENESIS, {
    n: last ? last.n + 1 : 0,
    ref: m.ref,
    kind: m.kind,
    arm: m.arm,
    call: call.outcome,
    p: call.p,
    chance: call.chance,
    act: call.act,
    words: book.words ? wordsCall(book.words, m.kind) : null,
    crowd: crowdCall(crowd, m.kind, m.arm),
    twin: twinCall(book.twin, m.kind, m.arm),
    looks: call.looks,
    at,
  });
  return { ...book, chain: [...book.chain, { ...sealed, did: null, open: false }].slice(-KEEP) };
}

/** A seen moment is over: its envelope learns what was done. One with no envelope, or no outcome to hold a call to, changes nothing. */
export function settle(book: Book, row: { ref: string; kind: MomentKind; outcome: string }): Book {
  const did = outcomeClass(row.kind, row.outcome);
  if (did === null || !book.chain.some((e) => e.ref === row.ref && e.did === null)) return book;
  return { ...book, chain: book.chain.map((e) => (e.ref === row.ref && e.did === null ? { ...e, did } : e)) };
}

/** Settled and not yet opened: what is waiting for the visitor. */
export const waiting = (book: Book): Envelope[] => book.chain.filter((e) => e.did !== null && !e.open);
/** Everything opened, oldest first. */
export const opened = (book: Book): Envelope[] => book.chain.filter((e) => e.did !== null && e.open);

/** Open every envelope that is waiting. */
export function openAll(book: Book): Book {
  return { ...book, chain: book.chain.map((e) => (e.did !== null && !e.open ? { ...e, open: true } : e)) };
}

/** An envelope as the count reads it. */
export const asOpened = (e: Envelope): Opened => ({ kind: e.kind, call: e.call, chance: e.chance, act: e.act, words: e.words, crowd: e.crowd ?? null, twin: e.twin ?? null, did: e.did! });

/** Settled envelopes not yet added to the village's count, as the rows it takes (C91). */
export function unsent(book: Book, cell: string): CountRow[] {
  return book.chain
    .filter((e) => e.did !== null && !e.sent)
    .map((e) => ({ seal: e.hash, cell, kind: e.kind, arm: e.arm, call: e.call, did: e.did!, same: e.looks.same, family: e.looks.family, at: e.at }));
}

/** Those rows were taken. */
export function markSent(book: Book, seals: readonly string[]): Book {
  const taken = new Set(seals);
  return { ...book, chain: book.chain.map((e) => (taken.has(e.hash) && !e.sent ? { ...e, sent: true } : e)) };
}

// ── kept in the browser ────────────────────────────────────────────────────────

export function loadBook(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): Book {
  try {
    const raw = storage?.getItem(BOOK_KEY);
    const book = raw ? (JSON.parse(raw) as Book) : null;
    // A record kept before there were twins has none; one that is not a twin's calls is not kept as one.
    return book && book.v === 1 && Array.isArray(book.chain) ? { ...book, twin: readTwin(book.twin) } : emptyBook();
  } catch {
    return emptyBook();
  }
}

export function saveBook(book: Book, storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(BOOK_KEY, JSON.stringify(book));
  } catch {
    // a private window, or a full one: kept for this page only
  }
}

/** Erase the envelopes, the words and the twin: everything this file ever kept. */
export function forget(storage: Pick<Storage, "removeItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.removeItem(BOOK_KEY);
  } catch {
    // nothing was kept to remove
  }
}
