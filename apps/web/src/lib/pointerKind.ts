"use client";

/**
 * "Is this a finger?", in one place (DECISIONS C23).
 *
 * `(pointer: coarse)` was written out by hand three times before this module existed — in the
 * landing to skip Lenis's spring scrolling, in the legacy /play client, and it was about to be
 * written a fourth and fifth time for the parcel's touch controls. A predicate spelled out at five
 * call sites is a predicate that will one day mean five things, which is the failure
 * game/world/parcelWorld.ts's header is written about, one level down.
 *
 * TWO SHAPES, BECAUSE THERE ARE HONESTLY TWO USES. Some callers ask once, inside an effect, and
 * never care again (whether to start a smooth-scroll loop). Others have to re-render when the
 * answer changes, because a phone in a desktop-class browser window, a tablet with a keyboard
 * attached, and a laptop with a touchscreen all move between the two states while the page is open.
 * `useReducedMotion` in components/planet/motion.ts is the house shape for the second, and this
 * follows it exactly: false on the server, read in an effect, subscribed for changes.
 *
 * COARSE, NOT NARROW. This answers what the person is pointing with, not how wide their screen is,
 * and the two questions have different right answers. Whether the world can be driven at all is a
 * question about fingers — a tablet is coarse and wide, a small window is narrow and fine — so it
 * asks this. Whether a HUD panel fits beside another one is a question about width, and that is
 * answered where it belongs, in a CSS media query, with no JavaScript involved at all.
 */

import { useEffect, useState } from "react";

const QUERY = "(pointer: coarse)";

/** One answer, now. For code inside an effect that will not re-run. */
export function coarsePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/** The same answer, kept current. False through the server render, so hydration cannot mismatch. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    setCoarse(query.matches);
    const listener = (event: MediaQueryListEvent) => setCoarse(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return coarse;
}
