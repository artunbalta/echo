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
 * IT IS THE SAME METER, NOT A LOOKALIKE. The chrome is `.panel`, `.recognition-tide`, `.star-lit`
 * and `.recognition-rise` from globals.css, the four rules written for this component the first
 * time it shipped (components/RecognitionMeter.tsx, the /play world's copy), and the colours are
 * the theme's own `echo` / `ink` / `parchment`. Nothing new was added to either.
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

import { PERSONA_AXIS_KEYS } from "@echo/shared";

import { LOG_SIZE, type ConsentState, type MeasureLogEntry, type Posterior } from "@/game/world/measure";
import {
  axisTitle,
  headline,
  namedTitle,
  PRIOR_VAR,
  recognitionReading,
  type MeasuredReading,
} from "@/components/world/recognitionReading";

export interface RecognitionMeterProps {
  posterior: Posterior | null;
  log: readonly MeasureLogEntry[];
  consent: ConsentState;
}

/** The rise the glow fires on. Copied from the /play meter so both tick at the same movement. */
const RISE_EPS = 0.002;
const RISE_MS = 1400;

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour12: false });
const pctOf = (v: number) => Math.round(v * 100);

export default function RecognitionMeter({ posterior, log, consent }: RecognitionMeterProps) {
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

  const line = headline(reading);
  const badge = reading.kind === "off" ? "off" : reading.kind === "offline" ? "demo" : null;

  return (
    <div
      // 340px is what the widest headline needs on one line: "98% sure · names nothing of you yet ·
      // 25+ windows" is 49 monospace characters at 10px, which measured 300px inside 24px of
      // padding. At 280 it wrapped, and a glance element that reflows as the number grows is a
      // glance element people stop trusting.
      // The hook a browser test uses to find this on the SHIPPED page, and the reason it exists:
      // deleting the one line in ParcelCanvas.tsx that mounts this component left typecheck at
      // exit 0, all 140 node tests green including all 15 of this component's own, and every
      // browser spec green. The meter could be removed from the world with nothing going red,
      // because its tests import it directly and never render the page. The minimap does not have
      // that hole, and the difference is exactly this attribute.
      data-recognition={reading.kind}
      // On a narrow screen it stops being a centred banner: at 86vw it covered 141 of the 145
      // pixels of the "Back to the planet" link, so the only way off a parcel could not be tapped.
      // It takes the top-left column instead and leaves the right-hand corner to the link and the
      // minimap. A width question, answered in CSS.
      className="pointer-events-auto absolute left-1/2 top-3 z-20 w-[min(340px,86vw)] -translate-x-1/2 select-none font-mono max-sm:left-3 max-sm:w-[58vw] max-sm:translate-x-0"
      aria-label={`Your echo knows you: ${line}`}
      onMouseEnter={coarse ? undefined : () => setExpanded(true)}
      onMouseLeave={coarse ? undefined : () => setExpanded(false)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className={`panel rounded-lg px-3 py-2 ${rising ? "recognition-rise" : ""}`}>
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-parchment/55">
          <span>your echo knows you</span>
          {badge && <span className="text-parchment/35">{badge}</span>}
        </div>

        {measured ? (
          <>
            {/* The eight axes. Lit = the service would name it; see namedAxes. */}
            <div className="mb-1.5 flex items-center gap-1.5" title={namedTitle(measured.named)}>
              {PERSONA_AXIS_KEYS.map((key, i) => (
                <span
                  key={key}
                  title={axisTitle(i)}
                  className={`h-1.5 w-1.5 rounded-full transition-all duration-700 ${
                    i < measured.named.length ? "bg-echo star-lit" : "bg-parchment/15"
                  }`}
                />
              ))}
            </div>
            {/* The tide: certainty, and nothing else. */}
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-ink/80">
              <div
                className="recognition-tide absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out"
                style={{ width: `${pctOf(measured.certainty01)}%` }}
              />
            </div>
          </>
        ) : (
          // No number stands behind this state, so there is no track to leave empty either: an empty
          // track is a bar at zero, and zero is a measurement. A dashed rule is not.
          <div className="h-1 w-full border-t border-dashed border-parchment/20" />
        )}

        <p className="mt-1.5 text-[10px] leading-snug text-parchment/45">{line}</p>
      </div>

      {expanded && (
        <div className="panel mt-1.5 rounded-lg px-3 py-2 text-[10px] leading-snug text-parchment/70">
          {measured ? <MeasuredDetail r={measured} /> : <PlainDetail line={line} />}
          <p className="mt-1.5 text-parchment/35">{coarse ? "the ` button opens the inspector" : "` opens the inspector"}</p>
          {/* The mirror (C61): what this number is made of, act by act. */}
          <p
            data-open-mirror
            className="mt-1 cursor-pointer text-echo/80 hover:text-echo"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new Event("echo:mirror"));
            }}
          >
            {coarse ? "tap to look in the mirror" : "Y · look in the mirror"}
          </p>
        </div>
      )}
    </div>
  );
}

/** Every row is a quantity something counted, with the units it was counted in. */
function MeasuredDetail({ r }: { r: MeasuredReading }) {
  return (
    <>
      <div className="mb-1.5 text-parchment/45">what the number is</div>

      <Row label="certain of you">
        <span>{pctOf(r.certainty01)}%</span>
        <span className="text-parchment/40">
          {" "}
          · 1 - {r.meanVar.toFixed(3)} / {PRIOR_VAR} mean variance
        </span>
      </Row>

      <Row label="names of you">
        <span>
          {r.named.length} of {PERSONA_AXIS_KEYS.length}
        </span>
        <span className="text-parchment/40"> · {r.named.length ? r.named.join(", ") : "nothing decisive enough to say"}</span>
      </Row>

      <Row label="windows landed">
        <span>
          {r.windows}
          {r.windowsAtLeast ? "+" : ""}
        </span>
        <span className="text-parchment/40">
          {" "}
          · {r.windowsAtLeast ? `the log keeps ${LOG_SIZE}, so this is a floor` : "walking sends one about every 1.5 s"}
        </span>
      </Row>

      <Row label="events held">
        <span>
          {r.eventsHeld} of {LOG_SIZE}
        </span>
      </Row>

      <Row label="posterior">
        <span>v{r.version ?? "?"}</span>
        <span className="text-parchment/40">
          {" "}
          · {r.source} · {clock(r.at)}
        </span>
      </Row>

      {/* The sentence the two rows above need, and the reason the tide is not the headline alone. */}
      <p className="mt-1.5 text-parchment/40">
        One locomotion window informs all eight axes at once, so the certainty climbs in seconds
        while the names do not. It is how sure the echo is, not how much of you it can say.
      </p>
    </>
  );
}

function PlainDetail({ line }: { line: string }) {
  return (
    <>
      <div className="mb-1.5 text-parchment/45">no number stands behind this yet</div>
      <p className="text-parchment/55">{line}</p>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-parchment/55">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
