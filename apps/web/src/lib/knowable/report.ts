/**
 * The audit as one file to keep or send (DECISIONS C90): a self-contained HTML page, no script, no
 * font or image fetched from anywhere, that prints on paper as it reads on a screen.
 *
 * It says the same things as `research/deeds/audit.py`'s report, in the same order: the panel, the
 * ceiling, how many twins fall under the crowd, then one row per twin. Twin names are a stranger's
 * text and are escaped.
 *
 * A report made from the synthetic demo panel says so at its top, in the file itself, so that it
 * cannot be passed on as a result about anyone.
 *
 * Pure.
 */
import type { AuditResult } from "./audit";
import { count, fixed, pct, ranked, scaleFor, signed } from "./format";

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export interface ReportOptions {
  title?: string;
  /** True when the panel is the page's synthetic demo. */
  synthetic?: boolean;
  /** When the audit ran, as text. */
  when?: string;
}

export function reportHtml(res: AuditResult, opts: ReportOptions = {}): string {
  const title = opts.title ?? "Twin audit";
  const rows = ranked(res);
  const cap = res.ceiling.overall;
  const scale = scaleFor(rows.flatMap(([, v]) => [v.knows, v.knows_with_one_look, v.knows_retest]));
  const zero = scale.at(0);
  const below = rows.filter(([, v]) => v.vs_crowd_ci95[1] < 0).length;
  const lifted = rows.filter(([, v]) => v.one_look_gain_ci95[0] > 0).length;
  // the page's own marks: a bar from the crowd's line for the twin alone, a dot for the twin with one look
  const bar = (share: number) => {
    if (!Number.isFinite(share)) return "";
    const at = scale.at(share);
    return `<i class="alone ${at < zero ? "under" : "over"}" style="left:${Math.min(at, zero).toFixed(2)}%;width:${Math.abs(at - zero).toFixed(2)}%"></i>`;
  };
  const dot = (share: number) => (Number.isFinite(share) ? `<i class="look" style="left:${scale.at(share).toFixed(2)}%"></i>` : "");
  const trs = rows
    .map(
      ([name, v]) => `<tr>
<td class="name">${esc(name)}<small>${count(v.people)} people</small></td>
<td class="num">${fixed(v.accuracy)}</td>
<td class="num">${signed(v.vs_crowd)} <small>[${signed(v.vs_crowd_ci95[0])}, ${signed(v.vs_crowd_ci95[1])}]</small></td>
<td class="num">${fixed(v.r)}</td>
<td class="num strong">${pct(v.knows)}</td>
<td class="plot"><div><b style="left:${zero.toFixed(2)}%"></b>${bar(v.knows)}${dot(v.knows_with_one_look)}</div></td>
<td class="num strong">${pct(v.knows_with_one_look)}</td>
<td class="num">${fixed(v.with_one_look)} <small>(${signed(v.one_look_gain)})</small></td>
</tr>`,
    )
    .join("\n");
  const groups = [...Object.entries(res.ceiling.by_group), ["All groups", cap] as const]
    .map(([g, c]) => `<tr><td>${esc(g)}</td><td class="num">${fixed(c.rho, 2)}</td><td class="num">${fixed(c.base)}</td><td class="num">${fixed(c.ceiling)}</td></tr>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --paper: #fbf7ee; --ink: #1c1326; --muted: #5f5568; --rule: #ddd3c0; --alone: #c8603b; --look: #7a4fb3; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 1080px; margin: 0 auto; padding: 36px 20px 64px; }
h1 { font: 600 30px/1.2 ui-serif, Georgia, Cambria, "Times New Roman", serif; margin: 0 0 6px; }
h2 { font: 600 19px/1.3 ui-serif, Georgia, Cambria, "Times New Roman", serif; margin: 36px 0 8px; }
p { margin: 0 0 10px; max-width: 76ch; }
.meta, small, .note { color: var(--muted); }
.meta { font-size: 13px; margin-bottom: 18px; }
.flag { border: 1px solid var(--alone); border-radius: 8px; padding: 10px 14px; margin: 0 0 18px; max-width: none; }
.wrap { overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; background: #fffdf8; margin-top: 14px; }
.wrap.narrow { max-width: 620px; }
.narrow tr:last-child td { font-weight: 650; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { padding: 9px 10px; border-bottom: 1px solid var(--rule); text-align: left; vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
th { color: var(--muted); font-weight: 600; font-size: 12px; line-height: 1.3; vertical-align: bottom; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
td.num { white-space: nowrap; }
td.name { min-width: 150px; }
td.strong { font-weight: 650; }
td.name small { display: block; }
small { font-size: 12px; font-weight: 400; }
td.plot { min-width: 200px; width: 26%; padding-left: 10px; padding-right: 10px; }
td.plot div { position: relative; height: 16px; }
td.plot b { position: absolute; top: -9px; bottom: -9px; width: 1px; background: var(--ink); }
td.plot i { position: absolute; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
td.plot i.alone { top: 3px; height: 10px; background: var(--alone); }
td.plot i.under { border-radius: 3px 0 0 3px; }
td.plot i.over { border-radius: 0 3px 3px 0; }
td.plot i.look { top: 3px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: var(--look); box-shadow: 0 0 0 2px #fffdf8; }
.key { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px; color: var(--muted); margin: 12px 0 0; }
.key span::before { content: ""; display: inline-block; width: 14px; height: 10px; border-radius: 2px; margin-right: 6px; background: var(--c); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.key span.dot::before { width: 10px; border-radius: 50%; }
.key span.line::before { width: 1px; height: 12px; border-radius: 0; vertical-align: -2px; }
.key span.plain::before { display: none; }
.note { font-size: 13px; margin-top: 14px; }
@media print { body { background: #fff; } main { padding: 0; } .wrap { background: #fff; break-inside: avoid; } }
</style>
<main>
<h1>${esc(title)}</h1>
<p class="meta">${opts.when ? `${esc(opts.when)} · ` : ""}${count(res.people)} people, ${count(res.items)} items in ${count(res.groups)} groups</p>
${opts.synthetic ? `<p class="flag"><b>Synthetic panel.</b> These people and twins were generated by the audit's demo from its own model of an answer. They are nobody's data and say nothing about any product.</p>` : ""}
<p>The crowd's median answer, which knows nobody, is scored on the same cells as each twin. The knowable ceiling for these items is <b>${fixed(cap.ceiling)}</b> (the crowd's best single answer: ${fixed(cap.base)}), from each item's answer shares and its test–retest agreement.</p>
<p><b>${below} of ${rows.length}</b> twin${rows.length === 1 ? " is" : "s are"} reliably less accurate than the crowd. One earlier answer per person, read through each twin, reliably lifts <b>${lifted} of ${rows.length}</b>.</p>
<div class="key"><span style="--c:var(--alone)">the twin alone</span><span class="dot" style="--c:var(--look)">the same twin, given one earlier answer per person</span><span class="line" style="--c:var(--ink)">the crowd, 0%</span><span class="plain">Each plot runs from ${pct(scale.lo)} to ${pct(scale.hi)} of the knowable. 100% is the ceiling.</span></div>
<div class="wrap"><table>
<thead><tr><th>Twin</th><th class="num">Accuracy</th><th class="num">vs the crowd [95% CI]</th><th class="num">Individual r</th><th class="num">Share of the knowable</th><th></th><th class="num">Share, with one look</th><th class="num">Accuracy, with one look (gain)</th></tr></thead>
<tbody>
${trs}
</tbody></table></div>
<h2>The ceiling, by group</h2>
<div class="wrap narrow"><table>
<thead><tr><th>Group</th><th class="num">Reliability ρ</th><th class="num">The crowd's best answer</th><th class="num">Knowable ceiling</th></tr></thead>
<tbody>
${groups}
</tbody></table></div>
<p class="note">Accuracy is 1 − |guess − answer| / range, averaged within groups, then over groups, then over people, on the cells each twin answered. The share of the knowable is (accuracy − crowd) / (ceiling − crowd): below zero, a twin knows less about a person than a guess that knows nobody. The ceiling is the best any guess could score given each item's test–retest reliability; it comes from a model of the answers, while the crowd is measured. "With one look" fits ŷ = a + b·twin + c·earlier answer on other people and rounds to an answer other people gave. Individual r is across people, per item, averaged within and then over groups. Intervals are bootstrap intervals over people.</p>
<p class="note">Made by the twin audit at echovirtualworld.com/audit, in the browser: the panel was not sent anywhere. Method and code: research/deeds/audit.py, github.com/artunbalta/echo.</p>
</main>
</html>
`;
}
