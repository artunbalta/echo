/**
 * One look, in one glance (DECISIONS C90): every twin placed twice on the leaderboard's own axis, once
 * alone and once given one earlier answer per person, with the yardsticks under them.
 *
 * The leaderboard says this row by row. The strip says it as a movement: a spread of twins below the
 * crowd, and the same twins gathered in one place above the person's own retest.
 *
 * Dots that would sit on top of each other step aside, up and down, so that thirteen twins landing
 * within a few points of each other are still seen to be thirteen. The range is also written beside
 * each lane's name.
 */
import { Axis } from "@/components/bench/Leaderboard";
import { pct, scaleFor } from "@/lib/knowable/format";

export interface StripLane {
  label: string;
  shares: number[];
  colour: "alone" | "look" | "ref";
}

/** Closer than this along the axis (in % of it), two dots would overlap at most widths. */
const CROWDED = 2.4;
const STEP = [0, -9, 9];

export function Strip({ lanes }: { lanes: StripLane[] }) {
  const scale = scaleFor(lanes.flatMap((l) => l.shares));
  return (
    <figure className="kn-surface m-0 rounded-xl border border-parchment/10 bg-ink-deep/55 px-4 pb-1 pt-4 sm:px-5">
      <div className="space-y-3">
        {lanes.map((lane) => {
          const sorted = [...lane.shares].sort((a, b) => a - b);
          let slot = 0;
          const placed = sorted.map((s, i) => {
            slot = i > 0 && scale.at(s) - scale.at(sorted[i - 1]!) < CROWDED ? (slot + 1) % STEP.length : 0;
            return { s, dy: STEP[slot]! };
          });
          return (
            <div key={lane.label}>
              <p className="text-[12.5px] leading-snug text-parchment/70">{lane.label}</p>
              <div className="relative mt-1 h-9" role="img" aria-label={`${lane.label}: ${sorted.map((s) => pct(s)).join(", ")}`}>
                <div className="absolute inset-y-0 left-[6px] right-[6px]">
                  {scale.ticks.map((t) => (
                    <span key={t} className="kn-mark absolute inset-y-[-6px] w-px" style={{ left: `${scale.at(t)}%`, background: t === 0 ? "var(--kn-zero)" : "var(--kn-grid)" }} />
                  ))}
                  {placed.map(({ s, dy }, i) => (
                    <span
                      key={i}
                      title={pct(s)}
                      className="kn-mark absolute top-1/2 h-[10px] w-[10px] rounded-full"
                      style={{ left: `${scale.at(s)}%`, transform: `translate(-50%, calc(-50% + ${dy}px))`, background: `var(--kn-${lane.colour})`, boxShadow: "0 0 0 2px var(--kn-ring)" }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Axis scale={scale} className="mt-1 h-7" />
    </figure>
  );
}
