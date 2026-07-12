"use client";

/**
 * The dusk reading (BUILD-PLAN §0.E) — the payoff screen. At dusk the echo reads the player
 * back to themselves: 4–7 statements, each bound to a real posterior axis and a real choice,
 * plus 1–2 Barnum controls (visually indistinguishable — the §0.F false-positive guard).
 *
 * Presentational only. Reuses the mirror's visual language (RecognitionMeter / EchoPanel): the
 * ink/parchment/echo palette, the `.panel` chrome, the eight-axis constellation, and the rising
 * tide for recognition. Owns the per-line "this is me / not me" + overall 1–5 capture and hands
 * the verdict up via onSubmit — the validation instrument that produces Phase 0's one number.
 */
import { useState } from "react";

export interface ReadingStatement {
  text: string;
  axis: string | null;
  choiceRef: string | null;
  control: boolean;
}
export interface DuskReadingData {
  statements: ReadingStatement[];
  recognition: number;
  mocked?: boolean;
}

export default function DuskReading({
  reading,
  onSubmit,
  onNextDay,
}: {
  reading: DuskReadingData;
  onSubmit: (verdict: { ratings: Record<number, boolean>; overall: number }) => void;
  /** P1 day loop: offered after the verdict — sleep, and wake into the next morning. */
  onNextDay?: () => void;
}) {
  const [ratings, setRatings] = useState<Record<number, boolean>>({});
  const [overall, setOverall] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const pct = Math.round(reading.recognition * 100);
  const lit = Math.round(reading.recognition * 8); // axes resolved, of 8 — same vocabulary as the meter
  const rated = Object.keys(ratings).length;

  const submit = () => {
    if (overall === null || submitted) return;
    setSubmitted(true);
    onSubmit({ ratings, overall });
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm">
      <div className="panel max-h-[92dvh] w-[min(94vw,560px)] overflow-y-auto rounded-2xl p-6 font-mono text-parchment">
        {/* header + recognition, in the mirror's own language */}
        <p className="text-[11px] uppercase tracking-[0.22em] text-echo/80">dusk · the echo of your day</p>
        <div className="mb-1 mt-2 flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full transition-all duration-700 ${i < lit ? "bg-echo star-lit" : "bg-parchment/15"}`} />
          ))}
        </div>
        <div className="relative mb-1 h-1 w-full overflow-hidden rounded-full bg-ink/80">
          <div className="recognition-tide absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        <p className="mb-5 text-[10px] text-parchment/45">
          it knows you {pct}%{reading.mocked ? " · running on demo values" : ""}
        </p>

        {/* the statements — each bound to a real axis + choice */}
        <ol className="space-y-3.5">
          {reading.statements.map((s, i) => (
            <li key={i} className="border-l-2 border-echo/30 pl-3">
              <p className="text-sm leading-snug text-parchment/90">{s.text}</p>
              <div className="mt-1.5 flex items-center gap-2">
                {s.axis && !s.control && (
                  <span className="rounded bg-echo/20 px-1.5 py-0.5 text-[10px] text-echo">{s.axis}</span>
                )}
                {!submitted ? (
                  <div className="flex gap-1.5 text-[11px]">
                    <button
                      onClick={() => setRatings((r) => ({ ...r, [i]: true }))}
                      className={"rounded px-2 py-0.5 transition " + (ratings[i] === true ? "bg-echo text-ink" : "border border-parchment/15 text-parchment/55 hover:text-parchment")}
                    >
                      this is me
                    </button>
                    <button
                      onClick={() => setRatings((r) => ({ ...r, [i]: false }))}
                      className={"rounded px-2 py-0.5 transition " + (ratings[i] === false ? "bg-parchment/80 text-ink" : "border border-parchment/15 text-parchment/55 hover:text-parchment")}
                    >
                      not me
                    </button>
                  </div>
                ) : (
                  ratings[i] !== undefined && (
                    <span className={"text-[11px] " + (ratings[i] ? "text-echo" : "text-parchment/40")}>{ratings[i] ? "this is me" : "not me"}</span>
                  )
                )}
              </div>
            </li>
          ))}
        </ol>

        {!submitted ? (
          <div className="mt-6">
            <p className="mb-2 text-xs text-parchment/55">how well did it know you, overall?</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setOverall(n)}
                  className={"h-9 w-9 rounded-full text-sm transition " + (overall === n ? "bg-echo text-ink" : "border border-parchment/15 text-parchment/70 hover:bg-parchment/5")}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={submit}
              disabled={overall === null}
              className="mt-5 w-full rounded-xl bg-echo py-2.5 text-sm font-medium text-ink transition enabled:hover:brightness-110 disabled:opacity-40"
            >
              {rated < reading.statements.length ? "done (rate what you can)" : "done"}
            </button>
          </div>
        ) : (
          <div className="mt-6 text-center">
            <p className="text-sm text-parchment/55">the echo remains. thank you.</p>
            {onNextDay && (
              <button
                onClick={onNextDay}
                className="mt-4 w-full rounded-xl border border-echo/40 py-2.5 text-sm text-echo transition hover:bg-echo/10"
              >
                sleep — meet the morning
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
