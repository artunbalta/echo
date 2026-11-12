/**
 * Erasing the envelopes, in one place (DECISIONS C94, second reading).
 *
 * WHY ONE PLACE. Three pages can erase a person (the mirror, the old `/account`, the demo's end) and
 * each had its own list of keys. Two readings of this code in one night each found one of them leaving
 * the envelopes behind: first the mirror and the demo (the page wrote them back), then `/account`,
 * which cleared five keys, none of them these, and said "not even your echo". A list kept in three
 * places is a list that is wrong in one of them (L5).
 *
 * WHAT IT DOES, in the order that leaves nothing nobody can reach:
 *
 *   1. what this browser added to the village's count (C91) is removed by its id, and only then is the
 *      id let go. If the count cannot be reached the id is KEPT, and this says so (`left`): an id
 *      cleared first would leave rows that nobody could ever ask to have removed. The envelopes'
 *      panel then offers "remove mine" for as long as the id is there.
 *   2. the page's keeper is told (`FORGET_EVENT`), so the record goes from memory and nothing more is
 *      kept on this page; and the keys go from the browser, whether or not a keeper was listening.
 *
 * The envelopes were only ever in the browser, so none of this waits on the server's own erasure.
 *
 * A DEMO'S END passes `count: false`. A demo runs on someone else's machine and adds nothing to the
 * count (`useEnvelopes`' `countable`), so the only rows under this browser's id are the machine's
 * owner's, and a guest erasing themselves must not take those with them.
 */
import { BOOK_KEY } from "./envelopes";
import { FORGET_EVENT } from "./keeper";

/** This browser's yes to adding to the count, and the id it adds under (`components/world/Envelopes.tsx`). */
export const ADDING_KEY = "echo.calls.crowd";
export const VISITOR_KEY = "echo.calls.visitor";

/** What became of this browser's rows in the count: it had none, they were removed, or they are still there. */
export type CountErased = "none" | "removed" | "left";

/** Take this browser's rows out of the count. The id is let go only once they are gone. */
export async function eraseFromCount(): Promise<CountErased> {
  let visitor: string | null = null;
  try {
    visitor = localStorage.getItem(VISITOR_KEY);
    localStorage.removeItem(ADDING_KEY);
  } catch {
    // a private window: no id was kept, so nothing was added
  }
  if (!visitor) return "none";
  const gone = await fetch("/api/calls", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ visitor }) })
    .then((r) => r.ok)
    .catch(() => false);
  if (!gone) return "left";
  try {
    localStorage.removeItem(VISITOR_KEY);
  } catch {
    // nothing was kept to remove
  }
  return "removed";
}

/** Erase everything the envelopes keep: the count's rows first, then the record here and on the page. */
export async function eraseEnvelopes(opts: { count?: boolean } = {}): Promise<CountErased> {
  const count = opts.count === false ? "none" : await eraseFromCount();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FORGET_EVENT));
  try {
    localStorage.removeItem(BOOK_KEY);
  } catch {
    // nothing was kept to remove
  }
  return count;
}
