/**
 * Whether this page may say what it drew, and how much detail it may say it in (SOC-1.A).
 *
 * DECISIONS C23 ends on the admission that the frame has never been measured on a phone, and names
 * this as the cheapest step toward a row in that file. What stood in the way was not the instrument
 * — `RenderInfo` has carried fps, calls and triangles since the host was written — but the gate: two
 * separate `process.env.NODE_ENV !== "production"` checks in `WorldCanvas.tsx`, which `next build`
 * turns into `false`, so the one build a person actually holds in their hand is the one build that
 * reports nothing.
 *
 * A QUERY PARAMETER AND NOT A SESSION FLAG, for the reasons `lib/stationSet.ts` already wrote down
 * one level over: a flag in sessionStorage is unlinkable, unshareable and unreachable by a browser
 * test, and it makes one URL mean two things depending on what happened earlier in the tab. A
 * measurement you cannot send to someone else is not evidence.
 *
 * IT IS READ OFF `window.location.search` AND NOT WITH `useSearchParams`, deliberately. The hook
 * opts its whole subtree out of static rendering and wants a Suspense boundary above it; this
 * question is only ever asked inside an effect that already runs in the browser only, so the
 * platform's own parser answers it with no hydration surface at all.
 *
 * WHAT IT COSTS WHEN IT IS OFF: one `URLSearchParams` parse, once, when a world mounts. Nothing per
 * frame, nothing per object, nothing in the render loop — `PlanetWorld.instrument` is never
 * installed at "off".
 *
 * Run:  cd apps/web && node --import tsx --test tests/renderDebug.test.mts
 */

/** The parameter, named for what it turns on rather than for a mood: ?debug=render, never ?dev=1. */
export const RENDER_DEBUG_PARAM = "debug";

/**
 * The levels, cheapest first.
 *
 *   "off"    — nothing is sampled and nothing is written.
 *   "frame"  — the whole frame, both passes, once a second. One counter reset per frame; it does
 *              not touch a single object.
 *   "layers" — the same, plus what each layer cost. This walks the scene once a frame and brackets
 *              every object's draws, so it is NOT free and it is not the default: an fps read at
 *              this level is an fps read with an instrument attached to it, and a row recorded from
 *              it must say so.
 */
export type RenderDebugLevel = "off" | "frame" | "layers";

/** The href the measurement procedure drives, written once so a test and a person share it. */
export const RENDER_DEBUG_QUERY = `${RENDER_DEBUG_PARAM}=render`;
export const RENDER_LAYERS_QUERY = `${RENDER_DEBUG_PARAM}=layers`;

/**
 * The branch, taken apart from the two things it depends on, so a test tests THIS and not a copy of
 * its shape. `stationSetFor` is the house pattern and this follows it exactly.
 *
 * Development is unchanged: it reports without being asked, as it has since the host was written.
 * Production reports only when the URL asks, and asking for "layers" implies the frame.
 */
export function renderDebugFor(nodeEnv: string | undefined, search: string): RenderDebugLevel {
  const asked = new URLSearchParams(search).getAll(RENDER_DEBUG_PARAM);
  if (asked.includes("layers")) return "layers";
  if (asked.includes("render")) return "frame";
  return nodeEnv !== "production" ? "frame" : "off";
}

/** The same question, of the page this code is running in. "off" on the server, always. */
export function renderDebugEnabled(): RenderDebugLevel {
  return renderDebugFor(process.env.NODE_ENV, typeof window === "undefined" ? "" : window.location.search);
}

/**
 * Whether the readout PANEL is drawn (C68), which is a narrower question than whether the frame is
 * measured. Development measures without being asked, and the `data-world-*` attributes the browser
 * tests read go on being written; but a table of triangle counts over the world is for whoever asked
 * for it with `?debug=render` or `?debug=layers`, in any build, and for nobody else.
 */
export function renderReadoutFor(search: string): boolean {
  return new URLSearchParams(search).getAll(RENDER_DEBUG_PARAM).some((v) => v === "render" || v === "layers");
}
