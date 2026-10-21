"use client";

/**
 * Everything the page draws over the world when nothing is happening (DECISIONS C68).
 *
 * It replaces five things that each had a corner and a card: the place card bottom left (name, cell,
 * report link, two lines of keys), the meter's banner top centre, the village news card top left,
 * the sound pill and the way back top right, and the frame readout. Walking into a village showed
 * all of them at once, over the top half of a phone. Now:
 *
 * - **top left**, on the world and not in a box: the place's name, which steps back after a few
 *   seconds; the meter's small mark under it; the village's news under that, a line or two;
 * - **top right**, three buttons: the map, the menu, and the way back to the planet;
 * - **the menu**: sound, the mirror, the inspector, the controls, a report, the language, and the
 *   cell's code at the foot for whoever needs to quote it;
 * - **the controls**: said once, on a first visit, at the bottom, and again whenever asked.
 *
 * Nothing that was reachable before is unreachable now: every key still works, and every thing a key
 * did has a line in the menu, for the thumb that has no keys.
 *
 * NO BUTTON TAKES FOCUS. Space is jump and WASD walks, so a focused button would eat both; each one
 * cancels its mousedown, as the inspector and the meter do.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import Minimap from "@/components/world/Minimap";
import { useSound } from "@/components/world/SoundToggle";
import type { ConsentState } from "@/game/world/measure";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import { LANG_NAME, LANGS, setLang, t, useLang } from "@/lib/i18n";
import { useVillageNews } from "@/lib/villageNews";

const NAME_STEPS_BACK_MS = 6000;
const CONTROLS_SHOWN_MS = 9000;
const SEEN_KEY = "echo.controls.seen";
const MAP_KEY = "echo.map";

const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // kept for this page only
  }
};
const kept = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const noFocus = (e: React.MouseEvent) => e.preventDefault();

export interface WorldHudProps {
  world: () => PlanetWorld | null;
  /** The village's name, or null for land with none. */
  name: string | null;
  /** Whether this is land the stranger owns (C59). */
  owned: boolean;
  /** Land reached by raft with no village on it. */
  shore: boolean;
  cell: string;
  coarse: boolean;
  consent: ConsentState;
  /** The recognition meter, drawn under the name. */
  meter: ReactNode;
  inspecting: boolean;
  onToggleInspector: () => void;
}

export default function WorldHud({ world, name, owned, shore, cell, coarse, consent, meter, inspecting, onToggleInspector }: WorldHudProps) {
  const lang = useLang();
  const news = useVillageNews();
  const { muted, toggle: toggleSound } = useSound(world);

  // The name steps back once it has been read, and comes forward again when the place changes.
  const title = owned ? t(lang, "hud.yourLand") : (name ?? t(lang, shore ? "hud.anotherShore" : "hud.openLand"));
  const [named, setNamed] = useState(true);
  useEffect(() => {
    setNamed(true);
    const id = setTimeout(() => setNamed(false), NAME_STEPS_BACK_MS);
    return () => clearTimeout(id);
  }, [title]);

  // The map: folded until asked for, so arriving is the world and not a panel; the person's choice
  // is kept for the next time.
  const [mapOpen, setMapOpen] = useState(false);
  useEffect(() => {
    setMapOpen(kept(MAP_KEY) === "open");
  }, []);
  const toggleMap = () => {
    keep(MAP_KEY, mapOpen ? "closed" : "open");
    setMapOpen(!mapOpen);
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  // The controls, said once: on the first visit, after the consent question is answered (the card
  // stands where they would), and whenever the menu asks.
  const [controls, setControls] = useState(false);
  useEffect(() => {
    if (consent === "unset" || kept(SEEN_KEY)) return;
    keep(SEEN_KEY, "1");
    setControls(true);
  }, [consent]);
  useEffect(() => {
    if (!controls) return;
    const id = setTimeout(() => setControls(false), CONTROLS_SHOWN_MS);
    return () => clearTimeout(id);
  }, [controls]);

  const item = "flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[13px] text-parchment/85 hover:bg-parchment/[0.06] hover:text-parchment";
  const keycap = "rounded border border-parchment/15 px-1.5 text-[10px] leading-[1.35rem] text-parchment/45";

  return (
    <>
      {/* ── top left: where you are ─────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-4 top-3 z-20 flex max-w-[min(380px,58vw)] flex-col gap-1">
        <h1
          data-place-name
          className={`hud-shadow font-serif text-[22px] leading-tight text-parchment transition-opacity duration-[1500ms] max-sm:text-lg ${named ? "opacity-100" : "opacity-60"}`}
        >
          {title}
        </h1>
        {meter}
        {news.length > 0 ? (
          <ul data-village-news className="mt-1 space-y-1">
            {news.map((n, i) => (
              <li key={n.key} data-news-item={n.key} className={`hud-shadow hud-in text-[12px] leading-snug text-parchment/75 ${i > 0 ? "max-sm:hidden" : ""}`}>
                {n.text}
                <span className="ml-1 text-parchment/45">· {n.when}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ── top right: the map, the menu, the way back ──────────────────────────── */}
      <div ref={menuRef} className="absolute right-4 top-3 z-30 flex items-center gap-2 max-sm:right-3">
        <button type="button" data-hud-map aria-label={t(lang, "hud.map")} title={t(lang, "hud.map")} aria-pressed={mapOpen} onMouseDown={noFocus} onClick={toggleMap} className="hud-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
            <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5z" />
            <path d="M5.5 2v10.5M10.5 3.5V14" />
          </svg>
        </button>
        <button type="button" data-hud-menu aria-label={t(lang, "hud.menu")} title={t(lang, "hud.menu")} aria-expanded={menuOpen} onMouseDown={noFocus} onClick={() => setMenuOpen((o) => !o)} className="hud-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
          </svg>
        </button>
        <Link href="/" aria-label={t(lang, "hud.backLong")} onMouseDown={noFocus} className="hud-btn gap-1.5 px-3.5 text-[12px]" style={{ display: "inline-flex" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.5 2.5 4 6l3.5 3.5" />
          </svg>
          {t(lang, "hud.back")}
        </Link>

        {menuOpen ? (
          <div role="menu" data-hud-menu-open className="hud-pop hud-in absolute right-0 top-[calc(100%+8px)] w-[min(272px,86vw)] overflow-hidden py-1.5">
            <button type="button" role="menuitem" data-sound-toggle={muted ? "off" : "on"} aria-pressed={!muted} onMouseDown={noFocus} onClick={toggleSound} className={item}>
              <span>{t(lang, "menu.sound")}</span>
              <span className="flex items-center gap-2 text-parchment/50">
                {t(lang, muted ? "menu.off" : "menu.on")}
                {coarse ? null : <span className={keycap}>M</span>}
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-hud-mirror
              onMouseDown={noFocus}
              onClick={() => {
                setMenuOpen(false);
                window.dispatchEvent(new Event("echo:mirror"));
              }}
              className={item}
            >
              <span>{t(lang, "menu.mirror")}</span>
              {coarse ? null : <span className={keycap}>Y</span>}
            </button>
            <button
              type="button"
              role="menuitem"
              data-touch-inspector
              aria-pressed={inspecting}
              onMouseDown={noFocus}
              onClick={() => {
                setMenuOpen(false);
                onToggleInspector();
              }}
              className={item}
            >
              <span>{t(lang, "menu.inspector")}</span>
              {coarse ? null : <span className={keycap}>`</span>}
            </button>
            <button
              type="button"
              role="menuitem"
              data-hud-controls
              onMouseDown={noFocus}
              onClick={() => {
                setMenuOpen(false);
                setControls(true);
              }}
              className={item}
            >
              <span>{t(lang, "menu.controls")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-report-open
              onMouseDown={noFocus}
              onClick={() => {
                setMenuOpen(false);
                window.dispatchEvent(new Event("echo:report"));
              }}
              className={item}
            >
              <span>{t(lang, "menu.report")}</span>
            </button>
            <div className="mx-3.5 my-1.5 border-t border-parchment/10" />
            <div className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-[13px] text-parchment/85">
              <span>{t(lang, "menu.language")}</span>
              <span className="flex overflow-hidden rounded-full border border-parchment/15 text-[11px]">
                {LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    data-lang={l}
                    aria-pressed={lang === l}
                    title={LANG_NAME[l]}
                    onMouseDown={noFocus}
                    onClick={() => setLang(l)}
                    className={`px-2.5 py-1 uppercase tracking-wide ${lang === l ? "bg-parchment text-ink" : "text-parchment/60 hover:text-parchment"}`}
                  >
                    {l}
                  </button>
                ))}
              </span>
            </div>
            <p data-here={cell} className="select-text px-3.5 pb-1 pt-1.5 font-mono text-[10px] tracking-wider text-parchment/30">
              {cell}
            </p>
          </div>
        ) : null}
      </div>

      <Minimap world={world} open={mapOpen} />

      {/* ── the controls, said once ─────────────────────────────────────────────── */}
      {controls ? (
        <div
          data-hud-controls-hint
          className={`hud-shadow hud-in pointer-events-none absolute left-1/2 z-20 w-[min(560px,92vw)] -translate-x-1/2 text-center text-parchment/80 ${coarse ? "top-[38%] text-[13px]" : "bottom-8 text-[13px]"}`}
        >
          {coarse ? (
            <p>{t(lang, "controls.touch")}</p>
          ) : (
            <>
              <p>{t(lang, "controls.desk")}</p>
              <p className="mt-1 text-[12px] text-parchment/55">{t(lang, "controls.desk2")}</p>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
