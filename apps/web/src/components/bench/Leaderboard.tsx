/**
 * The audit's one picture (DECISIONS C90): every twin on a single axis whose zero is THE CROWD, a
 * guess that knows nobody, and whose 100% is the ceiling, everything knowable about a person.
 *
 * A bar is the twin alone. It grows from the crowd's line: to the left when the twin knows less than
 * nobody, to the right when it knows more. The dot is the same twin given one earlier answer per
 * person. The quiet rows are the yardsticks: the crowd itself, the person's own retest, and whatever
 * else the caller knows the place of.
 *
 * `/bench` draws the research record with it, `/audit` a visitor's own result: one component, so the
 * two can never be read differently. No hooks, so it renders on the server and in the tool alike.
 *
 * WIDE AND NARROW ARE ONE LIST. From 1280 px each row is a table row, the numbers in columns either
 * side of the plot. Below that the same cells fold: the name, then the plot between its two shares,
 * then the other numbers as a line of labelled figures. Nothing is hidden on a phone.
 *
 * Colour says which series a mark is, never how good it is, and text never wears it: the numbers
 * are parchment, and sit beside the mark they belong to. Every value drawn is also written.
 */
import type { AuditResult } from "@/lib/knowable/audit";
import { count, fixed, pct, ranked, scaleFor, signed, type Scale } from "@/lib/knowable/format";

export interface ReferenceRow {
  label: string;
  /** A few words under the label: what it is, or that it is a model's forecast. */
  note?: string;
  /** Its share of the knowable. */
  share: number;
  accuracy?: number;
  r?: number;
}

const GRID = "xl:grid-cols-[minmax(0,1.15fr)_3.75rem_10.25rem_3.75rem_3.25rem_minmax(0,1.4fr)_3.25rem_7.25rem]";
const ROW = `kn-row grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] items-center gap-x-3 px-4 py-3.5 sm:px-5 xl:gap-x-4 xl:py-0 ${GRID}`;
const NUM = "tabular-nums text-parchment/85";
/** The plot is inset so a dot at either end of the axis is not cut by its cell. */
const INSET = "absolute inset-y-0 left-[6px] right-[6px]";

/** Wide, the plot fills its row top to bottom, so the crowd's line runs unbroken down the whole list. */
const PLOT = "relative h-9 min-w-0 xl:col-start-6 xl:row-start-1 xl:h-auto xl:min-h-[2.75rem] xl:self-stretch";

function Plot({ scale, alone, look, reference, title }: { scale: Scale; alone?: number; look?: number; reference?: number; title: string }) {
  const zero = scale.at(0);
  const bar = (share: number, colour: string) => {
    const at = scale.at(share);
    return (
      <span
        className="kn-mark absolute top-1/2 h-3 -translate-y-1/2"
        style={{ left: `${Math.min(at, zero)}%`, width: `${Math.abs(at - zero)}%`, background: colour, borderRadius: at < zero ? "4px 0 0 4px" : "0 4px 4px 0" }}
      />
    );
  };
  const dot = (share: number, colour: string) => (
    <span
      className="kn-mark absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ left: `${scale.at(share)}%`, background: colour, boxShadow: "0 0 0 2px var(--kn-ring)" }}
    />
  );
  const drawn = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  return (
    <div className={PLOT} role="img" aria-label={title} title={title}>
      <div className={INSET}>
        {scale.ticks.map((t) => (
          <span key={t} className="kn-mark absolute inset-y-0 w-px" style={{ left: `${scale.at(t)}%`, background: t === 0 ? "var(--kn-zero)" : "var(--kn-grid)" }} />
        ))}
        {drawn(reference) ? (reference === 0 ? dot(0, "var(--kn-ref)") : bar(reference, "var(--kn-ref)")) : null}
        {drawn(alone) ? bar(alone, "var(--kn-alone)") : null}
        {drawn(look) ? dot(look, "var(--kn-look)") : null}
      </div>
    </div>
  );
}

/**
 * The axis's words. The two ends are set inside the plot, so neither runs into the column beside it;
 * on a phone only the ends and the crowd are named, the rest being lines.
 */
export function Axis({ scale, className = "h-8" }: { scale: Scale; className?: string }) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <div className={INSET}>
        {scale.ticks.map((t) => {
          const at = scale.at(t);
          const end = at < 1 || at > 99;
          return (
            <span
              key={t}
              className={`absolute bottom-1.5 whitespace-nowrap text-[11px] tabular-nums ${at < 1 ? "" : at > 99 ? "-translate-x-full" : "-translate-x-1/2"} ${
                t === 0 ? "font-medium text-parchment" : end ? "text-parchment/50" : "hidden text-parchment/50 sm:inline"
              }`}
              style={{ left: `${at}%` }}
            >
              {t === 0 ? "the crowd" : pct(t)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** "JSON Persona - GPT4.1" is a recipe and a model; a visitor's own twin is just its name. */
function named(name: string): { spec: string; model: string | null } {
  const cut = name.lastIndexOf(" - ");
  return cut > 0 ? { spec: name.slice(0, cut), model: name.slice(cut + 3) } : { spec: name, model: null };
}

function Legend() {
  const item = "inline-flex items-center gap-2";
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px] text-parchment/65">
      <li className={item}>
        <span className="kn-mark h-3 w-5 rounded-l-[4px]" style={{ background: "var(--kn-alone)" }} />
        the twin alone
      </li>
      <li className={item}>
        <span className="kn-mark h-[10px] w-[10px] rounded-full" style={{ background: "var(--kn-look)" }} />
        the same twin, given one earlier answer per person
      </li>
      <li className={item}>
        <span className="kn-mark h-3 w-5 rounded-r-[4px]" style={{ background: "var(--kn-ref)" }} />
        a yardstick
      </li>
    </ul>
  );
}

export function Leaderboard({ result, references = [] }: { result: AuditResult; references?: ReferenceRow[] }) {
  const twins = ranked(result);
  const scale = scaleFor([...twins.flatMap(([, v]) => [v.knows, v.knows_with_one_look]), ...references.map((r) => r.share)]);
  type Line = { kind: "twin"; name: string; share: number } | { kind: "reference"; ref: ReferenceRow; share: number };
  const lines: Line[] = [
    ...twins.map(([name, v]): Line => ({ kind: "twin", name, share: Number.isFinite(v.knows) ? v.knows : -Infinity })),
    ...references.map((ref): Line => ({ kind: "reference", ref, share: ref.share })),
  ].sort((a, b) => b.share - a.share);
  const label = "text-parchment/45 xl:hidden";
  const head = "whitespace-nowrap text-[11.5px] font-medium text-parchment/50";

  return (
    <figure className="m-0">
      <Legend />
      <div className="kn-surface mt-4 overflow-hidden rounded-xl border border-parchment/10 bg-ink-deep/55" role="list" aria-label="Twins, by their share of the knowable">
        {/* the columns' names (wide), or just the axis (narrow) */}
        <div className={`grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] items-end gap-x-3 border-b border-parchment/10 px-4 sm:px-5 xl:gap-x-4 ${GRID}`} aria-hidden>
          <span className={`${head} hidden pb-2 xl:block`}>Twin</span>
          <span className={`${head} hidden pb-2 text-right xl:block`}>Accuracy</span>
          <span className={`${head} hidden pb-2 text-right xl:block`}>vs the crowd [95% CI]</span>
          <span className={`${head} hidden !whitespace-normal pb-2 text-right leading-tight xl:block`}>Individual r</span>
          <span className={`${head} pb-2 text-right`}>Alone</span>
          <div className="min-w-0">
            <p className={`${head} hidden pt-3 text-center xl:block`}>Share of the knowable</p>
            <Axis scale={scale} />
          </div>
          <span className={`${head} pb-2`}>One look</span>
          <span className={`${head} hidden pb-2 text-right xl:block`}>Accuracy, one look</span>
        </div>

        {lines.map((line, i) => {
          const edge = i < lines.length - 1 ? "border-b border-parchment/[0.07]" : "";
          if (line.kind === "reference") {
            const { ref } = line;
            return (
              <div key={`ref:${ref.label}`} role="listitem" className={`${ROW} ${edge} bg-parchment/[0.025]`}>
                <div className="col-span-3 min-w-0 pb-1 xl:col-span-1 xl:col-start-1 xl:row-start-1 xl:py-2.5">
                  <p className="font-serif text-[15px] italic leading-snug text-parchment/90">{ref.label}</p>
                  {ref.note ? <p className="text-[12px] leading-snug text-parchment/50">{ref.note}</p> : null}
                </div>
                <span className={`${NUM} text-right text-[14px] font-semibold xl:col-start-5 xl:row-start-1`}>{pct(ref.share)}</span>
                <Plot scale={scale} reference={ref.share} title={`${ref.label}: ${pct(ref.share)} of the knowable`} />
                <span className="xl:col-start-7 xl:row-start-1" />
                <div className="col-span-3 flex flex-wrap gap-x-4 gap-y-0.5 pt-1 text-[12.5px] xl:contents">
                  <span className={`${NUM} xl:col-start-2 xl:row-start-1 xl:text-right xl:text-[13.5px]`}>
                    {ref.accuracy === undefined ? null : (
                      <>
                        <span className={label}>accuracy </span>
                        {fixed(ref.accuracy)}
                      </>
                    )}
                  </span>
                  <span className={`${NUM} xl:col-start-4 xl:row-start-1 xl:text-right xl:text-[13.5px]`}>
                    {ref.r === undefined ? null : (
                      <>
                        <span className={label}>individual r </span>
                        {fixed(ref.r)}
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          }
          const v = result.twins[line.name]!;
          const { spec, model } = named(line.name);
          const partial = v.people < result.people;
          const title = `${line.name}: ${pct(v.knows)} of the knowable alone, ${pct(v.knows_with_one_look)} given one earlier answer`;
          return (
            <div key={line.name} role="listitem" className={`${ROW} ${edge} transition-colors hover:bg-parchment/[0.04]`}>
              <div className="col-span-3 min-w-0 pb-1 xl:col-span-1 xl:col-start-1 xl:row-start-1 xl:py-2.5">
                <p className="break-words text-[14.5px] leading-snug text-parchment">{spec}</p>
                {model || partial ? (
                  <p className="text-[12px] leading-snug text-parchment/50">
                    {model}
                    {model && partial ? " · " : ""}
                    {partial ? `${count(v.people)} of ${count(result.people)} people` : ""}
                  </p>
                ) : null}
              </div>
              <span className={`${NUM} text-right text-[14px] font-semibold xl:col-start-5 xl:row-start-1`}>{pct(v.knows)}</span>
              <Plot scale={scale} alone={v.knows} look={v.knows_with_one_look} title={title} />
              <span className={`${NUM} text-[14px] font-semibold xl:col-start-7 xl:row-start-1`}>{pct(v.knows_with_one_look)}</span>
              <div className="col-span-3 flex flex-wrap gap-x-4 gap-y-0.5 pt-1 text-[12.5px] xl:contents">
                <span className={`${NUM} xl:col-start-2 xl:row-start-1 xl:text-right xl:text-[13.5px]`}>
                  <span className={label}>accuracy </span>
                  {fixed(v.accuracy)}
                </span>
                <span className={`${NUM} whitespace-nowrap xl:col-start-3 xl:row-start-1 xl:text-right xl:text-[13.5px]`}>
                  <span className={label}>vs the crowd </span>
                  {signed(v.vs_crowd)}{" "}
                  <span className="text-[12px] text-parchment/50">
                    [{signed(v.vs_crowd_ci95[0])}, {signed(v.vs_crowd_ci95[1])}]
                  </span>
                </span>
                <span className={`${NUM} xl:col-start-4 xl:row-start-1 xl:text-right xl:text-[13.5px]`}>
                  <span className={label}>individual r </span>
                  {fixed(v.r)}
                </span>
                <span className={`${NUM} whitespace-nowrap xl:col-start-8 xl:row-start-1 xl:text-right xl:text-[13.5px]`}>
                  <span className={label}>with one look </span>
                  {fixed(v.with_one_look)} <span className="text-[12px] text-parchment/50">({signed(v.one_look_gain)})</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
