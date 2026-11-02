"use client";

/**
 * The recognition meter, on a parcel: the always-glanceable "your echo knows you" signal, back on
 * the route that measures a person the whole time they are walking and until now showed them
 * nothing about it unless they knew to press a backtick.
 *
 * WHICH NUMBER, AND WHY, IS NOT HERE. It is in recognitionReading.ts next door, with the
 * measurements it was chosen on. This file is the pixels: it renders one of five states and it
 * cannot make up a sixth, because `recognitionReading` decides which one and `headline` writes the
 * sentence. A state with no number draws no fill, which is the whole reason the reading is a
 * discriminated union rather than a number and a couple of booleans.
 *
 * IT IS A MARK, NOT A CARD (C68). At a glance it is eight dots and a thin line under the place's name,
 * and no words: the words are on hover, or on a tap. It used to be a 340 px panel with a header, a
 * badge and a sentence, at the top of a screen that already had four other cards on it.
 *
 * IT IS THE SAME METER, NOT A LOOKALIKE. The tide, the lit dots and the rise are `.recognition-tide`,
 * `.star-lit` and `.recognition-rise` from globals.css, the rules written for this component the
 * first time it shipped (components/RecognitionMeter.tsx, the /play world's copy). Its popover is the
 * HUD's one surface, `.hud-pop`, so it looks like the menu beside it and not like a card of its own.
 *
 * WHAT THE TWO ROWS ARE, because they are deliberately not the same quantity. The tide is the
 * posterior's resolved uncertainty and it moves within seconds of walking. The constellation is the
 * count of axes the service would actually put a WORD to, and on this route it stays dark for a
 * long time. Both are true at once, and a person seeing a nearly full tide over an empty
 * constellation is seeing the honest state of things rather than a progress bar.
 *
 * IT TAKES NO FOCUS AND SWALLOWS NO KEYS. Space is jump in this world, so this is not a <button>: a
 * focused button would eat the spacebar, and a click that moved focus off the canvas would take WASD
 * with it. It is a div whose mousedown is cancelled, exactly as the inspector does it. Clicking
 * toggles the detail for touch, where there is no hover.
 *
 * THE HOVER HANDLERS ARE NOT ATTACHED ON A COARSE POINTER, and that is a fix rather than a tidy-up.
 * A browser synthesises mouseenter from a tap BEFORE the click it also synthesises, so on a phone
 * the first tap opened the detail through mouseenter and the click immediately shut it again: the
 * sentence above ("clicking toggles the detail for touch") was false for the one tap a person
 * actually makes. Traced on the shipped page, tap 1 left the panel at its collapsed height and tap 2
 * opened it. With no hover handlers on a finger, the click is the only thing that runs.
 */

import { useEffect, useRef, useState } from "react";

import { useCoarsePointer } from "@/lib/pointerKind";
import { t, useLang } from "@/lib/i18n";

import { PERSONA_AXIS_KEYS } from "@echo/shared";

import type { ConsentState, MeasureLogEntry, Posterior } from "@/game/world/measure";
import { axisTitle, headline, namedTitle, recognitionReading } from "@/components/world/recognitionReading";

export interface RecognitionMeterProps {
  posterior: Posterior | null;
  log: readonly MeasureLogEntry[];
  consent: ConsentState;
  /** Opens the inspector, where every number behind this one is shown. */
  onInspect?: () => void;
}

/** The rise the glow fires on. Copied from the /play meter so both tick at the same movement. */
const RISE_EPS = 0.002;
const RISE_MS = 1400;

const pctOf = (v: number) => Math.round(v * 100);

export default function RecognitionMeter({ posterior, log, consent, onInspect }: RecognitionMeterProps) {
  const lang = useLang();
  const reading = recognitionReading({ consent, posterior, log });
  const measured = reading.kind === "measured" ? reading : null;
  const certainty = measured?.certainty01 ?? 0;

  const coarse = useCoarsePointer();
  const [expanded, setExpanded] = useState(false);
  const [rising, setRising] = useState(false);
  const prev = useRef(certainty);
  useEffect(() => {
    if (certainty > prev.current + RISE_EPS) {
      setRising(true);
      prev.current = certainty;
      const t = setTimeout(() => setRising(false), RISE_MS);
      return () => clearTimeout(t);
    }
    prev.current = certainty;
  }, [certainty]);

  const line = headline(reading, lang);

  return (
    <div
      // The hook a browser test uses to find this on the SHIPPED page, and the reason it exists:
      // deleting the one line that mounts this component once left every test green, because its
      // tests import it directly and never render the page.
      data-recognition={reading.kind}
      className="pointer-events-auto relative w-fit select-none"
      aria-label={`${t(lang, "meter.label")}: ${line}`}
      onMouseEnter={coarse ? undefined : () => setExpanded(true)}
      onMouseLeave={coarse ? undefined : () => setExpanded(false)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* A small chip, because the world behind it is sometimes a bright sky and the dots are faint. */}
      <div className={`flex w-[92px] flex-col gap-1.5 rounded-full bg-ink-deep/45 px-2.5 py-[7px] backdrop-blur-md ${rising ? "recognition-rise" : ""}`}>
        {/* The eight axes. Lit = the service would name it; see namedAxes. */}
        <div className="flex items-center justify-between" title={measured ? namedTitle(measured.named) : undefined}>
          {PERSONA_AXIS_KEYS.map((key, i) => (
            <span
              key={key}
              title={axisTitle(i)}
              className={`h-[5px] w-[5px] rounded-full transition-all duration-700 ${
                measured && i < measured.named.length ? "bg-echo star-lit" : "bg-parchment/30"
              }`}
            />
          ))}
        </div>
        {measured ? (
          // The tide: certainty, and nothing else.
          <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-parchment/15">
            <div
              className="recognition-tide absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out"
              style={{ width: `${pctOf(measured.certainty01)}%` }}
            />
          </div>
        ) : (
          // No number stands behind this state, so there is no track to leave empty either: an empty
          // track is a bar at zero, and zero is a measurement. A dashed rule is not.
          <div className="h-0 w-full border-t border-dashed border-parchment/30" />
        )}
      </div>

      {expanded && (
        <div className="hud-pop absolute left-0 top-full z-30 mt-1 w-[min(280px,80vw)] px-3.5 py-3 text-[12px] leading-snug text-parchment/85">
          <p className="text-[10px] uppercase tracking-[0.14em] text-parchment/45">{t(lang, "meter.label")}</p>
          <p className="mt-1">{line}</p>
          {measured ? <p className="mt-1.5 text-[11px] text-parchment/50">{t(lang, "meter.explain")}</p> : null}
          <div className="mt-2.5 flex flex-col gap-1 text-[12px]">
            {/* The mirror (C61): what this number is made of, act by act. */}
            <button
              type="button"
              data-open-mirror
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              className="text-left text-echo-soft hover:text-parchment"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new Event("echo:mirror"));
              }}
            >
              {t(lang, "meter.mirror")}
              {coarse ? "" : <span className="ml-1.5 text-parchment/35">Y</span>}
            </button>
            {onInspect ? (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                className="text-left text-parchment/60 hover:text-parchment"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspect();
                }}
              >
                {t(lang, "meter.inspector")}
                {coarse ? "" : <span className="ml-1.5 text-parchment/35">`</span>}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
