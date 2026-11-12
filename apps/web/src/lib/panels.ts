/**
 * Which of the world's panels is open (DECISIONS C96): one at a time.
 *
 * WHY. The envelopes, the mirror, the friends' panel and the report each kept an `open` of their own.
 * So two could be open at once, one over the other (the mirror under the inspector, as a screenshot
 * showed), each with its own way of closing, and nothing on one of them led to another. Now there is
 * one answer to "what is open", every panel asks it, and opening one is closing the rest. The four
 * that are about the echo share a row of tabs (`components/world/Panel.tsx`), which is only this
 * asked for again with another name.
 *
 * It also carries how many envelopes are waiting, so the tab can say so without the tab knowing the
 * envelopes.
 */
import { useSyncExternalStore } from "react";

/** The echo's four, in the order their tabs stand, and the report, which is not about the echo. */
export const ECHO_TABS = ["guesses", "portrait", "friends", "privacy"] as const;
export type PanelName = (typeof ECHO_TABS)[number] | "report";

let current: PanelName | null = null;
let waiting = 0;
const subs = new Set<() => void>();
const tell = () => subs.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => void subs.delete(fn);
};

export const panelNow = (): PanelName | null => current;

export function openPanel(name: PanelName): void {
  if (current === name) return;
  current = name;
  tell();
}

/** Close whatever is open; with a name, only if that is the one open. */
export function closePanel(only?: PanelName): void {
  if (current === null || (only && current !== only)) return;
  current = null;
  tell();
}

export const togglePanel = (name: PanelName): void => (current === name ? closePanel() : openPanel(name));

export function setWaiting(n: number): void {
  if (waiting === n) return;
  waiting = n;
  tell();
}

export const usePanel = (): PanelName | null => useSyncExternalStore(subscribe, panelNow, () => null);
export const useWaiting = (): number => useSyncExternalStore(subscribe, () => waiting, () => 0);
