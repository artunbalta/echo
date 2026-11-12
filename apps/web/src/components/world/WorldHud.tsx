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
 * SAID IN WORDS (C96). People shown the village could not tell what any of this was: a pill of eight
 * dots, three round icons, a menu of seven lines of one weight, and two lines of keys that left after
 * nine seconds. So the buttons carry their names, the menu is in two groups under two small headings
 * (the echo's things, the place's things) with the rarely wanted at its foot, and the keys are a
 * small card with the one sentence that says what there is to do here, closed by the person and
 * opened again from the menu. What was a line is still a line; nothing was removed.
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
import { openPanel, usePanel, useWaiting } from "@/lib/panels";
import { useVillageNews } from "@/lib/villageNews";

const NAME_STEPS_BACK_MS = 6000;
const CONTROLS_SHOWN_MS = 20_000;
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
  /** Under the meter: the envelopes waiting to be opened (C89), or nothing. */
  under?: ReactNode;
  /** The way back to the planet was pressed: the page may stop it (C89: envelopes never opened). */
  onBack?: (e: React.MouseEvent) => void;
  inspecting: boolean;
  onToggleInspector: () => void;
  /**
   * A pilot visit (C75): nothing that shows how the echo reads you while you play (the mirror, the
   * inspector), and no meetings. What you see of yourself afterwards cannot shape what you did before.
   */
  study?: boolean;
}

export default function WorldHud({ world, name, owned, shore, cell, coarse, consent, meter, under = null, onBack, inspecting, onToggleInspector, study = false }: WorldHudProps) {
  const lang = useLang();
  const waiting = useWaiting();
  const panelOpen = usePanel() !== null;
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

  const item = "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-parchment/85 hover:bg-parchment/[0.06] hover:text-parchment";
  const keycap = "rounded border border-parchment/15 px-1.5 text-[10px] leading-[1.35rem] text-parchment/45";
  const group = "px-3.5 pb-1 pt-2.5 text-[10px] uppercase tracking-[0.16em] text-parchment/40";
  const labelled = "hud-btn gap-1.5 px-3 text-[12px] max-sm:px-0";
  const ask = (event: string) => () => {
    setMenuOpen(false);
    window.dispatchEvent(new Event(event));
  };

  return (
    <>
      {/* ── top left: where you are, and your echo ──────────────────────────────── */}
      <div className="pointer-events-none absolute left-4 top-3 z-20 flex max-w-[min(380px,58vw)] flex-col gap-1.5">
        <h1
          data-place-name
          className={`hud-shadow font-serif text-[22px] leading-tight text-parchment transition-opacity duration-[1500ms] max-sm:text-lg ${named ? "opacity-100" : "opacity-60"}`}
        >
          {title}
        </h1>
        {/* One row, and each thing in it says what it is: the echo's mark, and what it has waiting. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {meter}
          {under}
        </div>
        {news.length > 0 ? (
          <ul data-village-news className="mt-0.5 space-y-1">
            {news.map((n, i) => (
              <li key={n.key} data-news-item={n.key} className={`hud-shadow hud-in text-[12px] leading-snug text-parchment/75 ${i > 0 ? "max-sm:hidden" : ""}`}>
                {n.text}
                <span className="ml-1 text-parchment/45">· {n.when}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ── top right: the map, the menu, the way out ───────────────────────────── */}
      <div ref={menuRef} className="absolute right-4 top-3 z-30 flex items-center gap-2 max-sm:right-3">
        <button type="button" data-hud-map aria-label={t(lang, "hud.map")} title={t(lang, "hud.map")} aria-pressed={mapOpen} onMouseDown={noFocus} onClick={toggleMap} className={labelled}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
            <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5z" />
            <path d="M5.5 2v10.5M10.5 3.5V14" />
          </svg>
          <span className="max-sm:hidden">{t(lang, "hud.map")}</span>
        </button>
        <button type="button" data-hud-menu aria-label={t(lang, "hud.menu")} title={t(lang, "hud.menu")} aria-expanded={menuOpen} onMouseDown={noFocus} onClick={() => setMenuOpen((o) => !o)} className={`${labelled} relative`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
          </svg>
          <span className="max-sm:hidden">{t(lang, "hud.menu")}</span>
        </button>
        <Link href="/" data-hud-back aria-label={t(lang, "hud.backLong")} title={t(lang, "hud.backLong")} onMouseDown={noFocus} onClick={onBack} className="hud-btn gap-1.5 px-3 text-[12px]" style={{ display: "inline-flex" }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 1.5H2.5v10H5M8.5 4l2.5 2.5L8.5 9M11 6.5H5" />
          </svg>
          {t(lang, "hud.back")}
        </Link>

        {menuOpen ? (
          <div role="menu" data-hud-menu-open className="hud-pop hud-in absolute right-0 top-[calc(100%+8px)] max-h-[calc(100dvh-5rem)] w-[min(288px,86vw)] overflow-y-auto py-1.5">
            {study ? null : (
              <>
                <p className={group}>{t(lang, "menu.group.echo")}</p>
                <button type="button" role="menuitem" data-hud-envelopes onMouseDown={noFocus} onClick={ask("echo:envelopes")} className={item}>
                  <Glyph d="M1.5 3.5h13v9h-13zM1.8 3.9 8 8.6l6.2-4.7" />
                  <span className="flex-1">{t(lang, "menu.envelopes")}</span>
                  {waiting > 0 ? <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-echo px-1 text-[11px] tabular-nums text-ink-deep">{waiting}</span> : null}
                  {coarse ? null : <span className={keycap}>O</span>}
                </button>
                <button type="button" role="menuitem" data-hud-mirror onMouseDown={noFocus} onClick={ask("echo:mirror")} className={item}>
                  <Glyph d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                  <span className="flex-1">{t(lang, "menu.mirror")}</span>
                  {coarse ? null : <span className={keycap}>Y</span>}
                </button>
                <button type="button" role="menuitem" data-hud-meet onMouseDown={noFocus} onClick={ask("echo:pairs")} className={item}>
                  <Glyph d="M5.5 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.400zM1.5 13c.3-2.2 1.9-3.5 4-3.5s3.700 1.3 4 3.500M10.800 7.300a2 2 0 1 0 0-4M11.500 9.600c1.600.300 2.700 1.500 3 3.400" />
                  <span className="flex-1">{t(lang, "menu.meet")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-hud-privacy
                  onMouseDown={noFocus}
                  onClick={() => {
                    setMenuOpen(false);
                    openPanel("privacy");
                  }}
                  className={item}
                >
                  <Glyph d="M8 1.500 13.500 3.500v4c0 3.300-2.300 5.900-5.500 7-3.200-1.100-5.500-3.700-5.500-7v-4z" />
                  <span className="flex-1">{t(lang, "menu.privacy")}</span>
                </button>
              </>
            )}
            <p className={group}>{t(lang, "menu.group.place")}</p>
            <button type="button" role="menuitem" data-hud-pack onMouseDown={noFocus} onClick={ask("echo:pack")} className={item}>
              <Glyph d="M4.500 5.500V4a3.500 3.500 0 0 1 7 0v1.500M2.500 5.500h11l-.8 8.500H3.300z" />
              <span className="flex-1">{t(lang, "pack.title")}</span>
              {coarse ? null : <span className={keycap}>I</span>}
            </button>
            <button type="button" role="menuitem" data-sound-toggle={muted ? "off" : "on"} aria-pressed={!muted} onMouseDown={noFocus} onClick={toggleSound} className={item}>
              <Glyph d="M2 6.200v3.600h2.600L8 12.500v-9L4.600 6.200zM10.500 5.800c.900.500 1.400 1.300 1.400 2.200s-.5 1.700-1.400 2.200M12 3.800c1.500.900 2.400 2.400 2.400 4.200s-.9 3.300-2.400 4.200" />
              <span className="flex-1">{t(lang, "menu.sound")}</span>
              <span className="text-parchment/50">{t(lang, muted ? "menu.off" : "menu.on")}</span>
              {coarse ? null : <span className={keycap}>M</span>}
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
              <Glyph d="M8 14.500a6.500 6.500 0 1 0 0-13 6.500 6.500 0 0 0 0 13zM6.200 6.300c.2-1 .9-1.600 1.900-1.600 1.100 0 1.900.7 1.900 1.700 0 1.500-1.900 1.500-1.900 3M8.100 11.600v.100" />
              <span className="flex-1">{t(lang, "menu.controls")}</span>
            </button>
            <button type="button" role="menuitem" data-report-open onMouseDown={noFocus} onClick={ask("echo:report")} className={item}>
              <Glyph d="M3 14.500v-13M3 2.500h8.500l-1.800 2.800 1.800 2.800H3" />
              <span className="flex-1">{t(lang, "menu.report")}</span>
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
            {/* The rarely wanted, said quietly: every number behind the echo, for whoever asks. */}
            {study ? null : (
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
                className="flex w-full items-center justify-between gap-3 px-3.5 py-1.5 text-left text-[12px] text-parchment/50 hover:bg-parchment/[0.06] hover:text-parchment"
              >
                <span>{t(lang, "menu.inspector")}</span>
                {coarse ? null : <span className={keycap}>`</span>}
              </button>
            )}
            <p data-here={cell} className="select-text px-3.5 pb-1 pt-1.5 font-mono text-[10px] tracking-wider text-parchment/30">
              {cell}
            </p>
          </div>
        ) : null}
      </div>

      <Minimap world={world} open={mapOpen} />

      {/* ── how to play: said once, closed by the person, opened again from the menu ── */}
      {/* At the top, under the buttons: the foot of the screen is where what is near you is named, and
          on a phone where the thumb walks. Not while a panel is open: that is where a panel opens. */}
      {controls && !panelOpen ? (
        // It takes no pointer but its one button's: the world behind it is still there to drag and walk in.
        <div data-hud-controls-hint className="hud-pop hud-in pointer-events-none absolute left-1/2 top-16 z-20 w-[min(500px,92vw)] -translate-x-1/2 px-5 py-4 max-sm:top-[5.5rem]">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-serif text-[17px] leading-tight text-parchment">{t(lang, "help.title")}</p>
            <button type="button" data-hud-controls-ok onMouseDown={noFocus} onClick={() => setControls(false)} className="pointer-events-auto rounded-full bg-parchment px-3.5 py-1 text-[12px] font-medium text-ink hover:bg-white">
              {t(lang, "help.ok")}
            </button>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-parchment/70">
            {t(lang, "help.goal")}
            {consent === "accepted" && !study ? ` ${t(lang, "help.goal.echo")}` : ""}
          </p>
          {coarse ? (
            <ul className="mt-3 space-y-1.5 text-[13px] text-parchment/85">
              <li>{t(lang, "help.touch.walk")}</li>
              <li>{t(lang, "help.touch.look")}</li>
              <li>{t(lang, "help.touch.act")}</li>
              {study ? null : <li>{t(lang, "help.touch.guesses")}</li>}
            </ul>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] text-parchment/85 max-sm:grid-cols-1">
              <Row keys={["W", "A", "S", "D"]} what={t(lang, "help.walk")} />
              <Row keys={["E"]} what={t(lang, "help.act")} />
              <Row keys={["Shift"]} what={t(lang, "help.run")} />
              <Row keys={["T"]} what={t(lang, "help.talk")} />
              <Row keys={["Space"]} what={t(lang, "help.jump")} />
              {study ? null : <Row keys={["O"]} what={t(lang, "help.guesses")} />}
              <Row keys={["I"]} what={t(lang, "help.pack")} />
              <Row keys={["M"]} what={t(lang, "help.sound")} />
              <li className="col-span-full text-parchment/55">{t(lang, "help.look")}</li>
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}

/** A menu line's small picture: one stroke, the line's own colour. */
function Glyph({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-parchment/55">
      <path d={d} />
    </svg>
  );
}

/** A key or two, and what it does. */
function Row({ keys, what }: { keys: string[]; what: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex shrink-0 gap-1">
        {keys.map((k) => (
          <kbd key={k} className="grid h-[22px] min-w-[22px] place-items-center rounded-[5px] border border-parchment/20 bg-parchment/[0.06] px-1.5 font-sans text-[11px] text-parchment/85">
            {k}
          </kbd>
        ))}
      </span>
      <span className="text-parchment/75">{what}</span>
    </li>
  );
}
