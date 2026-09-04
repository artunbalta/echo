/**
 * Which set of stations a URL asks for, and whether this cell is allowed to have it (task A3).
 *
 * The demo's cave mouth and campfire are the only human structures anywhere on the planet, and the
 * brief says they stay the only ones. So what builds them is a query parameter read on the server,
 * naming the SET it turns on, honoured on exactly one cell:
 *
 *   /parcel/847b949ffffffff?stations=slice
 *
 * WHY A PARAMETER RATHER THAN A PROPERTY OF THE CELL. The obvious trigger is "an unclaimed cell
 * gets the demo", and it is wrong for a reason that only shows up on the first day: at launch the
 * whole planet is unclaimed, so that rule puts a cave and a campfire on all 284,004 parcels and
 * breaks the one rule the world is built on.
 *
 * WHY NOT A SESSION FLAG either, which was the other candidate. A flag in sessionStorage makes the
 * demo unlinkable, unshareable, unscreenshottable and unreachable by a browser test, and it makes
 * one URL render two different worlds depending on what happened earlier in the tab. That last one
 * is the same failure as a test measuring a configuration that ships nowhere.
 *
 * WHY ONLY THE DEMO CELL: DECISIONS.md C15. Nobody puts a campfire on somebody else's land by
 * editing the address bar, and the deferred question of what an ordinary parcel offers a person
 * stays deferred rather than being answered by default here.
 *
 * A refusal is RETURNED, not thrown and not dropped. The world ignores it, because a parcel that
 * grew furniture from a rejected parameter would be worse than one that grew none; but a person
 * who typed it sees a page identical to the one they would have got without it, so the server says
 * out loud that the parameter arrived and why it changed nothing.
 */

import { DEMO_CELL } from "@echo/planet";

/**
 * The query parameter. It is named for the set it turns on rather than for a mood, so the day a
 * second set of furniture exists it needs a second VALUE and not a second parameter, and so the
 * URL says what it does: ?stations=slice, never ?demo=1.
 */
export const STATIONS_PARAM = "stations";

/** Every set there is. One, today: the vertical slice's cave mouth and campfire. */
export const STATION_SETS = ["slice"] as const;

export type StationSet = (typeof STATION_SETS)[number];

export interface StationSetRequest {
  /** What to build, or null for an ordinary parcel, which gets no furniture of any kind. */
  set: StationSet | null;
  /**
   * Why an ask was refused, phrased for a server log. Null when nothing was asked for, and null
   * when the ask was granted: a caller can log this whenever it is not null and say nothing else.
   */
  refused: string | null;
}

/**
 * The demo's address, written once.
 *
 * /demo redirects here and the browser specs drive it, so if this string and the page's own
 * reading of it ever disagree, `stationSet.test.mts` fails on the URL the app really sends rather
 * than on a copy of its shape.
 */
export const SLICE_HREF = `/parcel/${DEMO_CELL}?${STATIONS_PARAM}=slice`;

/**
 * A URL is a stranger's text, and this ends up in a log file. Anything outside a word, a dot, a
 * colon or a dash becomes a question mark, and 32 characters is more than any real value needs, so
 * nothing pasted into the address bar can forge a second log line or fill a disk.
 */
const forLog = (value: string) => value.replace(/[^\w.:-]/g, "?").slice(0, 32);

const isStationSet = (value: string): value is StationSet => (STATION_SETS as readonly string[]).includes(value);

export function stationSetFor(cell: string, asked: string | string[] | undefined): StationSetRequest {
  // Next hands back an array when a parameter is repeated. The first one wins, because that is
  // what URLSearchParams.get does with the same query string, and two answers to this question
  // should not depend on which side of the wire is asking.
  const value = (Array.isArray(asked) ? asked[0] : asked)?.trim();

  // Absent, or present and empty: nothing was asked for. An ordinary parcel, silently.
  if (!value) return { set: null, refused: null };

  if (!isStationSet(value)) {
    return {
      set: null,
      refused: `?${STATIONS_PARAM}=${forLog(value)} names no set of stations, so none was built. The only one is "${STATION_SETS.join('", "')}".`,
    };
  }

  // Case-folded because an H3 index is hex and this route does not normalise what it was given,
  // so 847B949FFFFFFFF names the same ground and would otherwise be told it is not the demo cell.
  if (cell.toLowerCase() !== DEMO_CELL) {
    return {
      set: null,
      refused: `?${STATIONS_PARAM}=${value} was ignored on ${forLog(cell)}. The demo's cave and campfire stand on ${DEMO_CELL} and on no other parcel: DECISIONS.md C15.`,
    };
  }

  return { set: value, refused: null };
}
