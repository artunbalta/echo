"use client";

/**
 * The one frame of every panel opened over the world (DECISIONS C96).
 *
 * The envelopes, the mirror, the friends' panel and the report had four frames: four widths, four
 * places on the screen, three ways to close (a cross, the word "×", "Esc · close"). Here they have
 * one: the same place, the same surface, one cross. The four that are about the echo carry the same
 * row of tabs, so they read as one place with four pages, and each page leads to the others.
 *
 * It is a frame and nothing else: what is open is `lib/panels.ts`'s to say, and what is inside is each
 * panel's own, with its own hooks for the tests.
 */
import type { ReactNode } from "react";

import { t, useLang, type Key } from "@/lib/i18n";
import { closePanel, ECHO_TABS, openPanel, useWaiting, type PanelName } from "@/lib/panels";

const noFocus = (e: React.MouseEvent) => e.preventDefault();

const TAB_KEY: Record<(typeof ECHO_TABS)[number], Key> = {
  guesses: "hub.guesses",
  portrait: "hub.portrait",
  friends: "hub.friends",
  privacy: "hub.privacy",
};

export interface EchoPanelProps {
  /** Which panel this is. One of the echo's four gets the tabs; the report gets its title. */
  tab: PanelName;
  /** What it is, for a screen reader, and the title where there are no tabs. */
  label: string;
  /** The mirror's two columns need the room; everything else reads better narrow. */
  wide?: boolean;
  /** The panel's own hooks (`data-envelopes-panel`, `data-mirror`), set on the frame. */
  attrs?: Record<string, string | undefined>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  children: ReactNode;
}

export default function EchoPanel({ tab, label, wide = false, attrs, onKeyDown, children }: EchoPanelProps) {
  const lang = useLang();
  const waiting = useWaiting();
  const tabs = tab !== "report";
  return (
    <section
      {...attrs}
      data-panel={tab}
      aria-label={label}
      onKeyDown={onKeyDown}
      // On a phone it opens under the place's name and the echo's mark, not over them.
      className={`absolute left-1/2 top-14 z-[45] flex max-h-[calc(100%-4.5rem)] -translate-x-1/2 flex-col max-sm:top-[5.5rem] max-sm:max-h-[calc(100%-6.25rem)] ${wide ? "w-[min(880px,94vw)]" : "w-[min(600px,94vw)]"}`}
    >
      <div className="hud-pop hud-in flex min-h-0 flex-col text-parchment">
        <div className="flex items-center gap-2 border-b border-parchment/10 py-2 pl-2.5 pr-2">
          {tabs ? (
            <div role="tablist" aria-label={t(lang, "hub.title")} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
              {ECHO_TABS.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  data-echo-tab={name}
                  aria-selected={tab === name}
                  onMouseDown={noFocus}
                  onClick={() => openPanel(name)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors max-sm:px-2 max-sm:text-[12px] ${tab === name ? "bg-parchment font-medium text-ink" : "text-parchment/70 hover:bg-parchment/[0.07] hover:text-parchment"}`}
                >
                  {t(lang, TAB_KEY[name])}
                  {name === "guesses" && waiting > 0 ? (
                    <span className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] tabular-nums ${tab === name ? "bg-ink text-parchment" : "bg-echo text-ink-deep"}`}>{waiting}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="min-w-0 flex-1 px-2.5 font-serif text-[18px] leading-tight">{label}</h2>
          )}
          <button type="button" data-panel-close data-envelopes-close={tab === "guesses" ? "" : undefined} aria-label={t(lang, "env.close")} title={t(lang, "env.close")} onMouseDown={noFocus} onClick={() => closePanel()} className="hud-btn h-8 min-w-8 shrink-0">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </section>
  );
}
