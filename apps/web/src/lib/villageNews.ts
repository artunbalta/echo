/**
 * What the village is saying, handed from the component that reads it (Gatherings) to the one that
 * shows it (the HUD, under the place's name). A tiny store rather than a prop, because the two are
 * siblings over the world and neither should own the other (C68).
 */
import { useSyncExternalStore } from "react";

export interface NewsItem {
  key: string;
  text: string;
  /** When, already in the person's language: "in about 20 minutes", "now", "tomorrow". */
  when: string;
}

let news: readonly NewsItem[] = [];
const listeners = new Set<() => void>();
const EMPTY: readonly NewsItem[] = [];

const same = (a: readonly NewsItem[], b: readonly NewsItem[]) =>
  a.length === b.length && a.every((x, i) => x.key === b[i].key && x.text === b[i].text && x.when === b[i].when);

export function publishNews(items: readonly NewsItem[]): void {
  if (same(news, items)) return;
  news = items;
  for (const l of listeners) l();
}

export function useVillageNews(): readonly NewsItem[] {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => news,
    () => EMPTY,
  );
}
