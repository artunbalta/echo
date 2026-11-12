"use client";

/**
 * The twin audit, as a tool (DECISIONS C90): three files for a panel that answered twice, one or more
 * for the twins, and the audit of them, drawn as `/bench` draws the research record's.
 *
 * NOTHING LEAVES THE PAGE, and that is a property of this file, not a promise beside it: it makes no
 * request. A file is read with `File.text()`, parsed and audited in this tab (`lib/knowable`), and the
 * reports are built here and handed to the browser as downloads. The plainest check is the one the
 * page invites: load it, go offline, run it.
 *
 * WHAT IS WRONG IS SAID WHERE IT IS. A file that cannot be read says its row, person and column under
 * its own drop zone. Files that can each be read but do not fit each other (no person in common, an
 * item with no column) say so under the panel, with the counts, before anything runs.
 *
 * THE DEMO IS SYNTHETIC AND SAYS SO: in the file names it fills in, over the result, and inside both
 * reports it can download. So does every template file, and a template dropped back in is still
 * known by its people's ids and labelled the same way.
 */
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import { Leaderboard, type ReferenceRow } from "@/components/bench/Leaderboard";
import { AuditError, auditAsync, panelOf, type AuditProgress, type AuditResult, type Items, type Panel, type Table } from "@/lib/knowable/audit";
import { CsvError, itemsFromCsv, itemsToCsv, tableFromCsv, tableToCsv } from "@/lib/knowable/csv";
import { count, fixed } from "@/lib/knowable/format";
import { reportHtml } from "@/lib/knowable/report";
import { SYNTH_TWINS, isSynthetic, synthPanel, type SynthOptions } from "@/lib/knowable/synth";

type Slot<T> = { file: string; data: T } | { file: string; error: string } | null;
interface TwinSlot {
  key: number;
  file: string;
  name: string;
  table?: Table;
  error?: string;
}
interface Done {
  result: AuditResult;
  synthetic: boolean;
  seconds: number;
  when: string;
}

const LARGE: SynthOptions = { people: 2000, items: 120, groups: 12 };
const said = <T,>(slot: Slot<T>): slot is { file: string; data: T } => slot !== null && "data" in slot;
const few = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "));
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** What the three files make together: the panel, or why they do not make one, and what was left out. */
function fit(items: Items, earlier: Table, truth: Table): { panel?: Panel; error?: string; notes: string[] } {
  let panel: Panel;
  try {
    panel = panelOf(truth, earlier, items);
  } catch (err) {
    return { error: (err as Error).message, notes: [] };
  }
  const notes: string[] = [];
  const kept = new Set(panel.ids);
  const onlyTruth = truth.ids.filter((id) => !kept.has(id)).length;
  const onlyEarlier = earlier.ids.filter((id) => !kept.has(id)).length;
  if (onlyTruth) notes.push(`${plural(onlyTruth, "person", "people")} in the truth file ${onlyTruth === 1 ? "is" : "are"} not in the earlier file, and ${onlyTruth === 1 ? "is" : "are"} left out.`);
  if (onlyEarlier) notes.push(`${plural(onlyEarlier, "person", "people")} in the earlier file ${onlyEarlier === 1 ? "is" : "are"} not in the truth file, and ${onlyEarlier === 1 ? "is" : "are"} left out.`);
  const columns = new Set(panel.columns);
  const unlisted = items.filter((it) => !columns.has(it.item)).map((it) => it.item);
  if (unlisted.length) notes.push(`Listed in the items file but not a column of both waves, and left out: ${few(unlisted)}.`);
  const listed = new Set(items.map((it) => it.item));
  const extra = truth.columns.filter((c) => !listed.has(c));
  if (extra.length) notes.push(`In the truth file but not in the items file, and left out: ${few(extra)}.`);
  const off = outside(items, [truth, earlier]);
  if (off) notes.push(`An answer lies outside its item's scale: "${off.item}" runs from ${off.lo} to ${off.hi}, and holds ${off.value}. Check lo and hi in the items file.`);
  return { panel, notes };
}

/** The first answer that lies outside its item's scale, if any: almost always a wrong lo or hi. */
function outside(items: Items, tables: Table[]): { item: string; lo: number; hi: number; value: number } | null {
  const scale = new Map(items.map((it) => [it.item, it]));
  for (const t of tables) {
    for (let j = 0; j < t.columns.length; j++) {
      const it = scale.get(t.columns[j]!);
      if (!it) continue;
      for (const row of t.values) {
        const v = row[j];
        if (typeof v === "number" && (v < it.lo || v > it.hi)) return { item: it.item, lo: it.lo, hi: it.hi, value: v };
      }
    }
  }
  return null;
}

function Drop({ title, hint, multiple, state, onFiles, children }: { title: string; hint: string; multiple?: boolean; state: "empty" | "ok" | "bad"; onFiles: (files: File[]) => void; children?: ReactNode }) {
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  const border = over ? "border-echo bg-echo/10" : state === "bad" ? "border-danger/60" : state === "ok" ? "border-parchment/20 border-solid" : "border-parchment/25 hover:border-echo/60";
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`kn-surface block cursor-pointer rounded-xl border border-dashed bg-ink-deep/55 p-4 transition-colors focus-within:border-echo ${border}`}
    >
      <input
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <span className="block font-mono text-[13px] text-parchment">{title}</span>
      <span className="mt-1 block text-[12.5px] leading-snug text-parchment/55">{hint}</span>
      {children ?? <span className="mt-3 block text-[12.5px] text-echo-soft">Drop the file here, or choose it</span>}
    </label>
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const quiet = "rounded-full border border-parchment/20 px-4 py-2 text-[13px] text-parchment/85 transition-colors hover:border-parchment/50 hover:text-parchment disabled:opacity-40";
const primary = "rounded-full bg-parchment px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-parchment/25 disabled:text-parchment/50";

export default function AuditTool() {
  const [items, setItems] = useState<Slot<Items>>(null);
  const [earlier, setEarlier] = useState<Slot<Table>>(null);
  const [truth, setTruth] = useState<Slot<Table>>(null);
  const [twins, setTwins] = useState<TwinSlot[]>([]);
  const [synthetic, setSynthetic] = useState(false);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const nextKey = useRef(1);
  const stop = useRef<AbortController | null>(null);
  const results = useRef<HTMLDivElement>(null);

  const together = useMemo(() => (said(items) && said(earlier) && said(truth) ? fit(items.data, earlier.data, truth.data) : null), [items, earlier, truth]);
  const names = twins.map((t) => t.name.trim());
  const repeated = names.find((n, i) => n && names.indexOf(n) !== i);
  const readyTwins = twins.filter((t) => t.table);
  const blocked = !together?.panel
    ? "Add the three panel files."
    : !readyTwins.length
      ? "Add at least one twin's predictions."
      : twins.some((t) => t.error)
        ? "One of the twin files cannot be read."
        : names.some((n) => !n)
          ? "Give every twin a name."
          : repeated
            ? `Two twins are both named "${repeated}". Give each its own name.`
            : null;

  const touched = () => {
    setSynthetic(false);
    setFailure(null);
  };
  const readTable = async (file: File, set: (s: Slot<Table>) => void) => {
    touched();
    try {
      set({ file: file.name, data: tableFromCsv(await file.text(), file.name) });
    } catch (err) {
      set({ file: file.name, error: err instanceof CsvError ? err.message : `${file.name} could not be read.` });
    }
  };
  const readItems = async (file: File) => {
    touched();
    try {
      setItems({ file: file.name, data: itemsFromCsv(await file.text(), file.name) });
    } catch (err) {
      setItems({ file: file.name, error: err instanceof CsvError ? err.message : `${file.name} could not be read.` });
    }
  };
  const addTwins = async (files: File[]) => {
    touched();
    const read = await Promise.all(
      files.map(async (file): Promise<TwinSlot> => {
        const base = { key: nextKey.current++, file: file.name, name: file.name.replace(/\.(csv|tsv|txt)$/i, "") };
        try {
          return { ...base, table: tableFromCsv(await file.text(), file.name) };
        } catch (err) {
          return { ...base, error: err instanceof CsvError ? err.message : `${file.name} could not be read.` };
        }
      }),
    );
    setTwins((now) => [...now, ...read]);
  };

  async function run(panel: Panel, given: Record<string, Table>, isSynthetic: boolean) {
    stop.current?.abort();
    const mine = new AbortController();
    stop.current = mine;
    setRunning(true);
    setFailure(null);
    setDone(null);
    setProgress({ done: 0, total: 1, label: "the ceiling" });
    // one turn of the loop, so the bar is on screen before the first slice of work
    await new Promise((resolve) => setTimeout(resolve, 0));
    const began = performance.now();
    try {
      const result = await auditAsync(panel, given, { onProgress: setProgress, signal: mine.signal });
      setDone({ result, synthetic: isSynthetic, seconds: (performance.now() - began) / 1000, when: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" });
      requestAnimationFrame(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFailure(err instanceof AuditError ? err.message : "The audit stopped on something it did not expect in these files. Nothing was sent anywhere.");
    } finally {
      if (stop.current === mine) {
        setRunning(false);
        setProgress(null);
      }
    }
  }

  const runMine = () => {
    if (blocked || !together?.panel) return;
    // a template file dropped back in is still the synthetic panel, whatever its twin is now called
    void run(together.panel, Object.fromEntries(readyTwins.map((t) => [t.name.trim(), t.table!])), synthetic || isSynthetic(together.panel.ids));
  };
  const trySynthetic = (opts: SynthOptions, tag: string) => {
    const s = synthPanel(opts);
    const made = (name: string) => `synthetic-${name}.csv (made on this page${tag})`;
    setItems({ file: made("items"), data: s.items });
    setEarlier({ file: made("earlier"), data: s.earlier });
    setTruth({ file: made("truth"), data: s.truth });
    setTwins(Object.entries(s.twins).map(([name, table]) => ({ key: nextKey.current++, file: "made on this page", name, table })));
    setSynthetic(true);
    void run(panelOf(s.truth, s.earlier, s.items), s.twins, true);
  };
  const clear = () => {
    stop.current?.abort();
    setItems(null);
    setEarlier(null);
    setTruth(null);
    setTwins([]);
    setSynthetic(false);
    setDone(null);
    setFailure(null);
    setRunning(false);
    setProgress(null);
  };
  const template = (which: "items" | "earlier" | "truth" | "twin") => {
    const s = synthPanel();
    const text = which === "items" ? itemsToCsv(s.items) : tableToCsv(which === "twin" ? s.twins[SYNTH_TWINS.persona]! : s[which]);
    download(`synthetic-${which}.csv`, text, "text/csv");
  };

  const status = <T,>(slot: Slot<T>, describe: (data: T) => string) =>
    slot === null ? undefined : "error" in slot ? (
      <span role="alert" className="mt-3 block text-[12.5px] leading-snug text-danger">
        {slot.error}
      </span>
    ) : (
      <span className="mt-3 block text-[12.5px] leading-snug text-parchment/80">
        <span className="break-all text-parchment">{slot.file}</span>
        <br />
        {describe(slot.data)}
      </span>
    );
  const state = <T,>(slot: Slot<T>) => (slot === null ? "empty" : "error" in slot ? "bad" : "ok");
  const tableSays = (t: Table) => `${plural(t.ids.length, "person", "people")}, ${plural(t.columns.length, "column")}`;
  const percent = progress ? Math.round((100 * progress.done) / progress.total) : 0;

  return (
    <div data-audit-phase={running ? "running" : done ? "done" : "idle"}>
      <section className="pb-10 pt-12 sm:pt-16">
        <p className="mb-5 text-[11px] uppercase tracking-[.22em] text-echo-soft">The twin audit</p>
        <h1 className="max-w-[18ch] font-serif text-[clamp(2.1rem,5.2vw,3.6rem)] leading-[1.05] tracking-[-.025em] text-parchment">What do your twins know about a person?</h1>
        <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-parchment/75">
          Bring a panel that answered the same items twice, and your twins&rsquo; predictions of the second answers. For each twin you get its accuracy against the crowd, and its share of what is knowable about a
          person.
        </p>
        <p className="mt-5 inline-flex max-w-2xl items-start gap-3 rounded-xl border border-echo/40 bg-echo/[0.08] px-4 py-3 text-[14.5px] leading-snug text-parchment">
          <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-echo-soft" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          <span>
            <b className="font-medium">Nothing leaves this page: the audit runs in your browser.</b> <span className="text-parchment/70">Load the page, go offline, and it still runs.</span>
          </span>
        </p>
      </section>

      <div className="kn-noprint grid gap-x-12 gap-y-10 border-t border-parchment/10 pt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        <div className="min-w-0 space-y-9">
          <div>
            <h2 className="font-serif text-[1.35rem] text-parchment">1. The panel</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Drop title="items.csv" hint="Each item, its group and its scale" state={state(items)} onFiles={(f) => void readItems(f[0]!)}>
                {status(items, (d) => `${plural(d.length, "item")} in ${plural(new Set(d.map((it) => it.group)).size, "group")}`)}
              </Drop>
              <Drop title="earlier.csv" hint="Each person's first answers" state={state(earlier)} onFiles={(f) => void readTable(f[0]!, setEarlier)}>
                {status(earlier, tableSays)}
              </Drop>
              <Drop title="truth.csv" hint="Their later answers: what a twin had to predict" state={state(truth)} onFiles={(f) => void readTable(f[0]!, setTruth)}>
                {status(truth, tableSays)}
              </Drop>
            </div>
            {together?.error ? (
              <p role="alert" className="mt-3 text-[13.5px] leading-snug text-danger">
                {together.error}
              </p>
            ) : together?.panel ? (
              <div className="mt-3 text-[13.5px] leading-snug text-parchment/70">
                <p>
                  Together: {plural(together.panel.ids.length, "person", "people")} in both waves, {plural(together.panel.columns.length, "item")} in {plural(together.panel.groups.length, "group")}.
                </p>
                {together.notes.map((note) => (
                  <p key={note} className="mt-1 text-ember">
                    {note}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <h2 className="font-serif text-[1.35rem] text-parchment">2. Your twins</h2>
            <div className="mt-4">
              <Drop title="twin CSVs" hint="One file per twin, laid out like truth.csv. Leave a cell empty where the twin gave no answer." multiple state="empty" onFiles={(f) => void addTwins(f)} />
            </div>
            {twins.length ? (
              <ul className="mt-3 space-y-2">
                {twins.map((t) => {
                  const covers = t.table && together?.panel ? cover(together.panel, t.table) : null;
                  return (
                    <li key={t.key} className="kn-surface rounded-xl border border-parchment/10 bg-ink-deep/55 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">Name of the twin from {t.file}</span>
                          <input
                            value={t.name}
                            onChange={(e) => {
                              const name = e.target.value;
                              setTwins((now) => now.map((x) => (x.key === t.key ? { ...x, name } : x)));
                            }}
                            className="w-full rounded-lg bg-white/[0.07] px-3 py-1.5 text-[14px] text-parchment outline-none focus:bg-white/[0.12]"
                          />
                        </label>
                        <button type="button" onClick={() => setTwins((now) => now.filter((x) => x.key !== t.key))} className="shrink-0 text-[12.5px] text-parchment/55 hover:text-parchment" aria-label={`Remove ${t.name}`}>
                          Remove
                        </button>
                      </div>
                      {t.error ? (
                        <p role="alert" className="mt-2 text-[12.5px] leading-snug text-danger">
                          {t.error}
                        </p>
                      ) : (
                        <p className="mt-2 text-[12.5px] leading-snug text-parchment/60">
                          <span className="break-all">{t.file}</span>: {tableSays(t.table!)}
                          {covers ? <span className={covers.people && covers.items ? "" : "text-danger"}>. {covers.says}</span> : null}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <button type="button" data-audit-run onClick={runMine} disabled={!!blocked || running} className={primary}>
                Run the audit
              </button>
              <button type="button" data-audit-demo onClick={() => trySynthetic({}, "")} disabled={running} className={quiet}>
                Try it on a synthetic panel
              </button>
              {items || earlier || truth || twins.length ? (
                <button type="button" onClick={clear} className="text-[13px] text-parchment/55 hover:text-parchment">
                  Clear
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-[13px] leading-snug text-parchment/55">
              {blocked && (items || earlier || truth || twins.length) ? `${blocked} ` : ""}
              The synthetic panel is generated on this page and is nobody&rsquo;s data.{" "}
              <button type="button" data-audit-demo-large onClick={() => trySynthetic(LARGE, `, ${count(LARGE.people!)} people`)} disabled={running} className="kn-link underline disabled:opacity-40">
                Or try a large one: {count(LARGE.people!)} people, {count(LARGE.items!)} items
              </button>
              .
            </p>
            {running && progress ? (
              <div className="mt-5" role="status" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded-full bg-parchment/10">
                  <div className="h-full rounded-full bg-echo transition-[width] duration-150" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-2 text-[13px] text-parchment/65">
                  Working on {progress.label}: {percent}%
                </p>
              </div>
            ) : null}
            {failure ? (
              <p role="alert" data-audit-failure className="mt-4 rounded-xl border border-danger/50 px-4 py-3 text-[13.5px] leading-snug text-danger">
                {failure}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 text-[13.5px] leading-relaxed text-parchment/70">
          <h2 className="font-serif text-[1.35rem] text-parchment">The files</h2>
          <p className="mt-3">Plain CSV. The first column is the person&rsquo;s id; every other column is an item. An empty cell is a missing answer.</p>
          <pre className="kn-surface mt-3 overflow-x-auto rounded-xl border border-parchment/10 bg-ink-deep/80 p-3.5 text-[12px] leading-relaxed text-parchment/85">
            <code>{"items.csv\nitem,group,lo,hi\nq1,risk,1,5\nq2,risk,1,5\nq3,trust,1,7\n\nearlier.csv, truth.csv, each twin\nid,q1,q2,q3\np001,4,2,6\np002,,5,3"}</code>
          </pre>
          <ul className="mt-3 space-y-2">
            <li>
              <b className="font-medium text-parchment">group</b> is the task or scale an item belongs to. Items are averaged within a group first, so a long task counts once.
            </li>
            <li>
              <b className="font-medium text-parchment">lo</b> and <b className="font-medium text-parchment">hi</b> are the ends of the item&rsquo;s scale. Accuracy is 1 − |guess − answer| / (hi − lo).
            </li>
            <li>A twin is scored only on the cells it answered. People in one wave and not the other are left out, and you are told how many.</li>
          </ul>
          <h3 className="mt-6 font-serif text-[1.1rem] text-parchment">Template files</h3>
          <p className="mt-2">A synthetic panel in the exact layout, made on this page. Drop the four files back in to see them run.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["items", "earlier", "truth", "twin"] as const).map((which) => (
              <button key={which} type="button" data-audit-template={which} onClick={() => template(which)} className={quiet}>
                synthetic-{which}.csv
              </button>
            ))}
          </div>
        </aside>
      </div>

      {done ? <Results done={done} anchor={results} /> : null}
    </div>
  );
}

/** How much of the panel a twin's file speaks to. */
function cover(panel: Panel, table: Table): { people: number; items: number; says: string } {
  const ids = new Set(table.ids);
  const columns = new Set(table.columns);
  const people = panel.ids.filter((id) => ids.has(id)).length;
  const items = panel.columns.filter((c) => columns.has(c)).length;
  const says = !people
    ? "None of its ids is a person of the panel"
    : !items
      ? "None of its columns is an item of the panel"
      : `Covers ${count(people)} of ${plural(panel.ids.length, "person", "people")} and ${count(items)} of ${plural(panel.columns.length, "item")}`;
  return { people, items, says };
}

/** The finding in a sentence, said as a person would say it for one twin, none, some or all. */
function verdict(below: number, total: number): string {
  if (total === 1) return below ? "This twin is reliably less accurate than the crowd." : "This twin is not reliably less accurate than the crowd.";
  if (!below) return `None of the ${total} twins is reliably less accurate than the crowd.`;
  if (below === total) return `All ${total} twins are reliably less accurate than the crowd.`;
  return `${below} of ${total} twins ${below === 1 ? "is" : "are"} reliably less accurate than the crowd.`;
}

function Results({ done, anchor }: { done: Done; anchor: React.RefObject<HTMLDivElement> }) {
  const { result, synthetic, seconds, when } = done;
  const twins = Object.entries(result.twins);
  const below = twins.filter(([, v]) => v.vs_crowd_ci95[1] < 0).length;
  const lifted = twins.filter(([, v]) => v.one_look_gain_ci95[0] > 0).length;
  // the retest's place, from the twin that speaks for the most people
  const widest = twins.reduce((a, b) => (b[1].people > a[1].people ? b : a))[1];
  const references: ReferenceRow[] = [
    { label: "The person's own retest", note: "their earlier answer as the guess", share: widest.knows_retest, accuracy: widest.retest, r: widest.r_retest },
    { label: "The crowd", note: "everyone else's median answer", share: 0, accuracy: widest.crowd, r: widest.r_crowd },
  ];
  const title = synthetic ? "Twin audit: a synthetic panel" : "Twin audit";
  const stamp = when.slice(0, 10);
  return (
    <div ref={anchor} data-audit-results data-audit-seconds={seconds.toFixed(2)} className="mt-14 scroll-mt-20 border-t border-parchment/10 pt-10">
      <p className="mb-3 text-[11px] uppercase tracking-[.22em] text-echo-soft">The audit</p>
      <h2 className="font-serif text-[1.7rem] leading-tight text-parchment sm:text-[2.1rem]">{verdict(below, twins.length)}</h2>
      {synthetic ? (
        <p data-audit-synthetic className="mt-5 max-w-3xl rounded-xl border border-ember/50 px-4 py-3 text-[14px] leading-snug text-parchment">
          <b className="font-medium text-ember">Synthetic panel.</b> These people and twins were generated on this page from the audit&rsquo;s own model of an answer. They are nobody&rsquo;s data and say nothing about any
          product. They are built to behave as the twins measured on Twin-2K-500 did.
        </p>
      ) : null}
      <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-parchment/75">
        {count(result.people)} people, {count(result.items)} items in {count(result.groups)} groups. One earlier answer per person, read through each twin, reliably lifts {lifted} of {twins.length}. The knowable
        ceiling for these items is {fixed(result.ceiling.overall.ceiling)}; the crowd&rsquo;s best single answer scores {fixed(result.ceiling.overall.base)}.
      </p>
      <p className="mt-2 text-[13px] text-parchment/50">
        Audited in {seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s, in this browser. {when}.
      </p>

      <div className="mt-8">
        <Leaderboard result={result} references={references} />
      </div>
      <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-parchment/55">
        A bar left of the crowd&rsquo;s line: the twin predicts a person worse than the median answer of everyone else. The dot: the same twin after one earlier answer from that person. 100% is the best any guess
        could do given how steadily people answer these items. Accuracy, the intervals and r are defined as on{" "}
        <a className="kn-link" href="/bench#method">
          the results page
        </a>
        .
      </p>

      <h3 className="mt-10 font-serif text-[1.3rem] text-parchment">The ceiling, by group</h3>
      <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-parchment/60">
        ρ is the share of an answer that is the person&rsquo;s steady way and not the day. The crowd&rsquo;s best is what one answer for everyone would score, and the ceiling what knowing each person exactly would.
        Where ρ is low the two are close: little is knowable, and a twin has little to find.
      </p>
      <div className="mt-4 max-w-3xl overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13.5px] tabular-nums">
          <thead>
            <tr className="border-b border-parchment/15 text-[11.5px] text-parchment/50">
              <th className="py-1.5 pr-3 font-medium">Group</th>
              <th className="py-1.5 pr-3 text-right font-medium">ρ</th>
              <th className="py-1.5 pr-3 text-right font-medium">Crowd&rsquo;s best</th>
              <th className="py-1.5 text-right font-medium">Ceiling</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(result.ceiling.by_group).map(([g, c]) => (
              <tr key={g} className="border-b border-parchment/[0.07] text-parchment/80">
                <td className="py-1.5 pr-3">{g}</td>
                <td className="py-1.5 pr-3 text-right">{fixed(c.rho, 2)}</td>
                <td className="py-1.5 pr-3 text-right">{fixed(c.base)}</td>
                <td className="py-1.5 text-right">{fixed(c.ceiling)}</td>
              </tr>
            ))}
            <tr className="font-medium text-parchment">
              <td className="py-1.5 pr-3">All groups</td>
              <td className="py-1.5 pr-3 text-right">{fixed(result.ceiling.overall.rho, 2)}</td>
              <td className="py-1.5 pr-3 text-right">{fixed(result.ceiling.overall.base)}</td>
              <td className="py-1.5 text-right">{fixed(result.ceiling.overall.ceiling)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="kn-noprint mt-10 flex flex-wrap gap-2">
        <button
          type="button"
          data-audit-json
          onClick={() => download(`twin-audit-${stamp}.json`, JSON.stringify(synthetic ? { synthetic: true, note: "Synthetic demo panel. Nobody's data.", ...result } : result, null, 1), "application/json")}
          className={quiet}
        >
          Download report (JSON)
        </button>
        <button type="button" data-audit-html onClick={() => download(`twin-audit-${stamp}.html`, reportHtml(result, { title, synthetic, when }), "text/html")} className={quiet}>
          Download report (HTML)
        </button>
        <button type="button" onClick={() => window.print()} className={quiet}>
          Print
        </button>
      </div>
    </div>
  );
}
