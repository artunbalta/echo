/**
 * How fast a person becomes knowable, drawn (DECISIONS C90): the Moral Machine's looks curve, one small
 * panel per kind of dilemma.
 *
 * The line is the theory's forecast, nρ² / (nρ + 1 − ρ), from ρ fitted on pairs of visits, and it
 * passes through the forecast points the record holds (`echoThrough`: the record forecasts fold by
 * fold). The dots are what was then measured on held-out visits, with their 95% intervals. The
 * claim on the page is that every dot's interval holds its forecast, so the picture shows exactly
 * that and nothing else.
 *
 * SMALL MULTIPLES, EACH ON ITS OWN SCALE. One contrast (humans over pets) is some ten times steadier
 * than the others; on a shared axis the other five would be a flat line at the bottom. The caption
 * says the scales differ, and each panel prints its own.
 *
 * Marks and words are placed in HTML by percentage, and only the curve is an SVG stretched to the
 * plot. A whole-SVG panel scales its type with its width: unreadable at phone size, shouting at desk
 * size. This way a dot is ten pixels and a label eleven at every width.
 *
 * Every point is also in the table under the figure. Server-rendered, no script.
 */
import { echoThrough } from "@/lib/knowable/theory";
import { count, fixed } from "@/lib/knowable/format";

export interface LooksPanel {
  key: string;
  label: string;
  rho: number;
  people: number;
  points: { n: number; pred: number; obs: number; lo: number; hi: number }[];
}

/** The largest of 1, 2, 5 × 10ᵏ that is not above x: a tick a reader can hold. */
function roundBelow(x: number): number {
  const unit = 10 ** Math.floor(Math.log10(x));
  return ([5, 2, 1].find((m) => m * unit <= x) ?? 1) * unit;
}

const plain = (x: number) => String(Number(x.toPrecision(2)));

function Panel({ panel }: { panel: LooksPanel }) {
  const most = Math.max(...panel.points.map((p) => p.n));
  const peak = Math.max(...panel.points.map((p) => Math.max(p.hi, p.pred)));
  const top = peak * 1.12;
  const floor = Math.min(0, ...panel.points.map((p) => p.lo)) * 1.12;
  const x = (n: number) => (100 * n) / (most + 0.35);
  const y = (v: number) => 100 - (100 * (v - floor)) / (top - floor);
  const tick = roundBelow(peak);
  const curve = Array.from({ length: 40 }, (_, i) => (i / 39) * (most + 0.2))
    .map((n) => `${x(n).toFixed(2)},${y(echoThrough(panel.rho, panel.points, n)).toFixed(2)}`)
    .join(" ");
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-2 min-h-[2.4em] text-[12.5px] leading-tight">
        <span className="block text-parchment/90">{panel.label}</span>
        <span className="block tabular-nums text-parchment/50">
          ρ {fixed(panel.rho, 2)} · {count(panel.people)} browsers
        </span>
      </figcaption>
      <div className="grid grid-cols-[2.4rem_minmax(0,1fr)]" role="img" aria-label={`${panel.label}: forecast and measured skill after ${panel.points.map((p) => p.n).join(", ")} visits`}>
        <div className="relative h-28 text-[11px] tabular-nums text-parchment/55">
          {[0, tick].map((v) => (
            <span key={v} className="absolute right-2 -translate-y-1/2" style={{ top: `${y(v)}%` }}>
              {plain(v)}
            </span>
          ))}
        </div>
        <div className="relative h-28">
          {[0, tick].map((v) => (
            <span key={v} className="kn-mark absolute inset-x-0 h-px" style={{ top: `${y(v)}%`, background: v === 0 ? "var(--kn-ref)" : "var(--kn-grid)" }} />
          ))}
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={curve} fill="none" stroke="var(--kn-zero)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {panel.points.map((p) => (
            <span key={p.n}>
              <span className="kn-mark absolute w-0.5 -translate-x-1/2 rounded-full" style={{ left: `${x(p.n)}%`, top: `${y(p.hi)}%`, height: `${y(p.lo) - y(p.hi)}%`, background: "var(--kn-look)" }} />
              <span
                className="kn-mark absolute h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${x(p.n)}%`, top: `${y(p.obs)}%`, background: "var(--kn-look)", boxShadow: "0 0 0 2px var(--kn-ring)" }}
              />
              {/* a hit area a pointer can find */}
              <span
                className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${x(p.n)}%`, top: `${y(p.obs)}%` }}
                title={`${panel.label}, ${p.n} ${p.n === 1 ? "visit" : "visits"}: measured ${fixed(p.obs, 4)} [${fixed(p.lo, 4)}, ${fixed(p.hi, 4)}], forecast ${fixed(p.pred, 4)}`}
              />
            </span>
          ))}
        </div>
        <span />
        <div className="relative h-5 text-[11px] tabular-nums text-parchment/55">
          {panel.points.map((p) => (
            <span key={p.n} className="absolute top-1 -translate-x-1/2" style={{ left: `${x(p.n)}%` }}>
              {p.n}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

export function LooksCurve({ panels }: { panels: LooksPanel[] }) {
  return (
    <div>
      <ul className="mb-5 flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px] text-parchment/65">
        <li className="inline-flex items-center gap-2">
          <span className="kn-mark h-0.5 w-5 rounded-full" style={{ background: "var(--kn-zero)" }} />
          forecast, from pairs of visits alone
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="kn-mark h-[10px] w-[10px] rounded-full" style={{ background: "var(--kn-look)" }} />
          measured on held-out visits, with its 95% interval
        </li>
      </ul>
      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 xl:grid-cols-6">
        {panels.map((p) => (
          <Panel key={p.key} panel={p} />
        ))}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-parchment/50">
        Across: visits already seen. Up: skill, the share of the variance in the next visit&rsquo;s choice that is predicted. Each panel has its own vertical scale.
      </p>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-parchment/60 hover:text-parchment">The same points as a table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] max-w-3xl border-collapse text-left tabular-nums">
            <thead>
              <tr className="border-b border-parchment/15 text-[11.5px] text-parchment/50">
                <th className="py-1.5 pr-3 font-medium">Contrast</th>
                <th className="py-1.5 pr-3 text-right font-medium">Visits</th>
                <th className="py-1.5 pr-3 text-right font-medium">Forecast</th>
                <th className="py-1.5 pr-3 text-right font-medium">Measured</th>
                <th className="py-1.5 text-right font-medium">95% interval</th>
              </tr>
            </thead>
            <tbody>
              {panels.flatMap((panel) =>
                panel.points.map((p) => (
                  <tr key={`${panel.key}${p.n}`} className="border-b border-parchment/[0.07] text-parchment/80">
                    <td className="py-1.5 pr-3">{p.n === 1 ? panel.label : ""}</td>
                    <td className="py-1.5 pr-3 text-right">{p.n}</td>
                    <td className="py-1.5 pr-3 text-right">{fixed(p.pred, 4)}</td>
                    <td className="py-1.5 pr-3 text-right">{fixed(p.obs, 4)}</td>
                    <td className="py-1.5 text-right">
                      {fixed(p.lo, 4)} to {fixed(p.hi, 4)}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
