/**
 * How far people come (DECISIONS C92): the steps of the way in, and the one line that counts a page
 * reaching one.
 *
 * WHY. Nothing measured landing → walking in → being watched → opening the envelopes → a friend's
 * link. The only funnel in the code was the old /play's, kept in localStorage and sent nowhere. Without
 * these numbers the first question anyone asks ("how many who arrive open an envelope, and how many of
 * those bring a friend?") has no answer.
 *
 * WHAT IS COUNTED. A number per day per step, and nothing else: no id, nothing kept in the browser,
 * nothing that says who. A page counts each step once (the set below lives as long as the page), so
 * the numbers are page loads that got that far. A reload counts again; that is the price of keeping
 * nothing.
 *
 * It fails silently by design: a count that could break the page it counts is worse than no count.
 */

export const STEPS = [
  "landing", // the landing was opened
  "walk_in", // "Walk in" was pressed
  "arrived", // the open world was built and shown
  "watched", // said yes to the echo watching
  "declined", // said no
  "met", // a first moment was seen and settled
  "opened", // envelopes were opened with at least one inside
  "worded", // the six lines were given
  "linked", // a friend's link was made
  "guess_opened", // a friend's link was opened
  "guessed", // the friend answered them all
  "guess_walk_in", // the friend chose to walk in
  "bench", // the evidence was opened
  // The audit tool was opened. Running it is deliberately NOT a step: its promise is that nothing
  // leaves the page once a panel is in it, and a count sent then would be a request, however empty.
  "audit",
] as const;

export type Step = (typeof STEPS)[number];

export const isStep = (x: unknown): x is Step => typeof x === "string" && (STEPS as readonly string[]).includes(x);

const counted = new Set<Step>();

/** Count this page as having reached a step. Once a page; never throws; nothing is kept. */
export function step(name: Step): void {
  if (typeof window === "undefined" || counted.has(name)) return;
  counted.add(name);
  try {
    void fetch("/api/steps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: name }), keepalive: true }).catch(() => undefined);
  } catch {
    // not counted
  }
}
