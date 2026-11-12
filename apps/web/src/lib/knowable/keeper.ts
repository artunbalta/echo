/**
 * Who keeps a visitor's envelopes while a page is open (DECISIONS C89, corrected after review).
 *
 * WHY THIS IS NOT INSIDE THE HOOK ANY MORE. The page's hook kept the record in memory and wrote the
 * whole of it to the browser after every change. So removing the key from storage erased nothing: the
 * next moment to begin wrote it all back. "Erase everything" in the mirror and in the demo did exactly
 * that, with the world still running behind them. A reviewer copied the hook's few lines into a
 * harness and watched six envelopes come back after an erase. Nothing tested it, because nothing could
 * reach it: it lived in an effect.
 *
 * So the keeping is here, where a test can hold it:
 *
 *   - changes run one after another, each on what the one before left;
 *   - `forget()` empties the record in memory AND in the browser, after whatever was already running;
 *   - `forget({ stop: true })` also ends the keeping for this page: whatever begins afterwards is not
 *     sealed, not kept, and not written. That is what an erasure means while the page is still open.
 *
 * It names a moment by the layer it came from as well as the page (`tag`): a raft crossing builds a new
 * world whose layer numbers its moments from zero again, and without that an outcome in the second
 * village settled an envelope sealed in the first.
 */
import { BOOK_KEY, emptyBook, loadBook, saveBook, type Book } from "./envelopes";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface Keeper {
  /** The record as it stands. */
  book(): Book;
  /** One change, after every change before it. Nothing happens once the keeping has stopped. */
  apply(step: (b: Book) => Book | Promise<Book>): Promise<void>;
  /** Empty the record here and in the browser; with `stop`, keep nothing more on this page. */
  forget(opts?: { stop?: boolean }): Promise<void>;
  stopped(): boolean;
}

const browserStore = (): Store | null => (typeof localStorage === "undefined" ? null : localStorage);

export function keeper(onChange: (b: Book) => void, storage: Store | null = browserStore()): Keeper {
  let book = loadBook(storage);
  let stopped = false;
  let queue: Promise<void> = Promise.resolve();
  const after = (work: () => void | Promise<void>): Promise<void> => {
    queue = queue.then(work).catch(() => {
      // A seal that could not be made is a call never made: nothing is counted for that moment.
    });
    return queue;
  };
  return {
    book: () => book,
    stopped: () => stopped,
    apply: (step) =>
      after(async () => {
        if (stopped) return;
        const next = await step(book);
        // An erasure that asked for the keeping to end may have arrived while the step was working.
        if (stopped || next === book) return;
        book = next;
        saveBook(book, storage);
        onChange(book);
      }),
    forget: (opts = {}) => {
      // Stopping is at once, so a change already waiting its turn does nothing; the emptying takes its
      // turn, so a change already under way cannot write after it.
      if (opts.stop) stopped = true;
      return after(() => {
        book = emptyBook();
        try {
          storage?.removeItem(BOOK_KEY);
        } catch {
          // nothing was kept to remove
        }
        onChange(book);
      });
    },
  };
}

/**
 * One number a layer, for as long as the layer lives. Watching stopped and begun again hooks the same
 * layer a second time: counted again, a moment still going on would end under a name no envelope had.
 */
export function numberer(): (layer: object) => number {
  const given = new WeakMap<object, number>();
  let n = 0;
  return (layer) => {
    const had = given.get(layer);
    if (had !== undefined) return had;
    given.set(layer, ++n);
    return n;
  };
}

/** A moment's name for the record: the page, the layer it came from, and the layer's own name for it. */
export const refOf = (page: string, layer: number, ref: string): string => `${page}.${layer}:${ref}`;

/** What an erasure elsewhere on the page says, so the keeper hears it (the mirror, the demo's end). */
export const FORGET_EVENT = "echo:envelopes-forget";
