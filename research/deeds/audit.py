"""
A twin audit: what a digital twin knows about individuals, measured the way Study 1 measured it.

It is the first thing ECHO can sell (docs/company/yc-application.md): a team brings its twins'
predictions and a panel that answered the same items twice, and gets back, for each twin:
- **accuracy** on its own cells, and **against the crowd**: the crowd's median answer, which knows
  nobody, scored on the same cells, with the difference's 95% interval over people;
- **individual-level r**: across people, per item, averaged within and then over groups;
- **the knowable ceiling** for these items (ordered latent model, deeds/ceiling.py), and the twin's
  **personal knowledge index**: the share of what is knowable beyond the crowd that it knows;
- **the echo layer**: the same twin read through one earlier answer per person (deeds/witnesses.py,
  echo_on), the accuracy that one look would add.

Inputs are wide CSVs keyed by a person id in the first column, one column per item:

    truth.csv     the answers to predict (the later wave)
    earlier.csv   the same people's earlier answers to the same items (for the ceiling and the echo)
    items.csv     item, group, lo, hi   (the scale; group as tasks are grouped for averaging)
    twin CSVs     the twins' predictions, same layout

    /opt/anaconda3/bin/python3.13 research/deeds/audit.py --truth t.csv --earlier e.csv --items i.csv \\
        --twin "Our twin=preds.csv" [--twin ...] --out out/audit
    /opt/anaconda3/bin/python3.13 research/deeds/audit.py --demo     # Twin-2K-500's 13 released twins
"""
import deeds  # noqa: F401

import argparse
import html
import json
import pathlib
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from deeds.ceiling import Column, base_accuracy, ceiling_accuracy, fit_rho
from deeds.witnesses import echo_on, folds_of, to_admissible

HERE = pathlib.Path(__file__).resolve().parent


class Panel:
    def __init__(self, truth: pd.DataFrame, earlier: pd.DataFrame, items: pd.DataFrame):
        self.items = items.set_index("item")
        self.columns = [c for c in self.items.index if c in truth.columns and c in earlier.columns]
        ids = truth.index.intersection(earlier.index)
        self.truth = truth.loc[ids, self.columns].astype(float)
        self.earlier = earlier.loc[ids, self.columns].astype(float)
        self.group = self.items["group"].to_dict()
        self.span = (self.items["hi"] - self.items["lo"]).astype(float).to_dict()
        self.groups = sorted(set(self.group[c] for c in self.columns))
        self.folds = folds_of(len(ids))
        # what echo_on needs of a "Twin": its columns and its task map
        self.task = self.group

    def person_accuracy(self, guess: pd.DataFrame, mask: pd.DataFrame) -> pd.Series:
        err = (guess[self.columns] - self.truth).abs().div(pd.Series(self.span), axis=1).where(mask)
        per_group = pd.DataFrame({g: err[[c for c in self.columns if self.group[c] == g]].mean(axis=1) for g in self.groups})
        return 1 - per_group.mean(axis=1)

    def r(self, guess: pd.DataFrame, mask: pd.DataFrame) -> float:
        per = {}
        for c in self.columns:
            m = mask[c].to_numpy() & guess[c].notna().to_numpy()
            a, b = guess[c].to_numpy(float)[m], self.truth[c].to_numpy(float)[m]
            per[c] = 0.0 if len(a) < 3 or a.std() == 0 or b.std() == 0 else float(np.corrcoef(a, b)[0, 1])
        return float(np.mean([np.mean([per[c] for c in self.columns if self.group[c] == g]) for g in self.groups]))

    def crowd(self) -> pd.DataFrame:
        out = pd.DataFrame(np.nan, index=self.truth.index, columns=self.columns)
        for c in self.columns:
            y = self.truth[c].to_numpy(float)
            p = np.full(len(y), np.nan)
            for f in np.unique(self.folds):
                tr = (self.folds != f) & ~np.isnan(y)
                p[self.folds == f] = to_admissible(np.array([np.median(y[tr])]), y[tr])[0]
            out[c] = p
        return out


def _ceiling_one(args):
    c, a, b, span = args
    observed = float(np.mean(1 - np.abs(a - b) / span))
    vals = np.concatenate([a, b])
    levels, counts = np.unique(vals, return_counts=True)
    col = fit_rho(Column(levels, counts / counts.sum(), span), observed)
    return c, {"rho": col.rho, "base": base_accuracy(col), "ceiling": ceiling_accuracy(col)}


def ceilings(panel: Panel, mask: pd.DataFrame) -> dict:
    jobs = []
    for c in panel.columns:
        m = mask[c] & panel.truth[c].notna() & panel.earlier[c].notna()
        jobs.append((c, panel.earlier.loc[m, c].to_numpy(float), panel.truth.loc[m, c].to_numpy(float), panel.span[c]))
    with ProcessPoolExecutor(4) as pool:
        per = dict(pool.map(_ceiling_one, jobs))
    by_group = {g: {k: float(np.mean([per[c][k] for c in panel.columns if panel.group[c] == g])) for k in ("rho", "base", "ceiling")} for g in panel.groups}
    overall = {k: float(np.mean([v[k] for v in by_group.values()])) for k in ("rho", "base", "ceiling")}
    return {"overall": overall, "by_group": by_group}


def boot_ci(d: np.ndarray, draws: int = 2000, seed: int = 0) -> list[float]:
    d = d[~np.isnan(d)]
    rng = np.random.default_rng(seed)
    means = d[rng.integers(0, len(d), (draws, len(d)))].mean(1)
    return [float(np.quantile(means, 0.025)), float(np.quantile(means, 0.975))]


def audit(panel: Panel, twins: dict[str, pd.DataFrame]) -> dict:
    crowd = panel.crowd()
    both = panel.truth.notna() & panel.earlier.notna()
    cap = ceilings(panel, both)
    out = {"people": int(len(panel.truth)), "items": len(panel.columns), "groups": len(panel.groups), "ceiling": cap, "twins": {}}
    for name, raw in twins.items():
        guess = raw.reindex(index=panel.truth.index, columns=panel.columns).astype(float)
        mask = both & guess.notna()
        people = mask.any(axis=1)
        acc_t = panel.person_accuracy(guess, mask)[people]
        acc_c = panel.person_accuracy(crowd, mask)[people]
        acc_a = panel.person_accuracy(panel.earlier, mask)[people]
        prior = guess.where(guess.notna(), crowd)
        ep, es, _ = echo_on(panel, panel.truth, panel.earlier, panel.folds, prior)
        acc_e = panel.person_accuracy(ep, mask)[people]
        base, ceil = float(acc_c.mean()), cap["overall"]["ceiling"]
        know = lambda a: (a - base) / (ceil - base) if ceil > base else float("nan")  # noqa: E731
        out["twins"][name] = {
            "people": int(people.sum()),
            "accuracy": float(acc_t.mean()), "crowd": base, "retest": float(acc_a.mean()), "with_one_look": float(acc_e.mean()),
            "vs_crowd": float((acc_t - acc_c).mean()), "vs_crowd_ci95": boot_ci((acc_t - acc_c).to_numpy()),
            "one_look_gain": float((acc_e - acc_t).mean()), "one_look_gain_ci95": boot_ci((acc_e - acc_t).to_numpy(), seed=1),
            "r": panel.r(guess, mask), "r_crowd": 0.0, "r_retest": panel.r(panel.earlier, mask), "r_with_one_look": panel.r(es, mask),
            "knows": know(float(acc_t.mean())), "knows_with_one_look": know(float(acc_e.mean())), "knows_retest": know(float(acc_a.mean())),
        }
    return out


# ── The demo: Twin-2K-500 and its authors' released twins ───────────────────────────────────────────────


def demo_panel():
    from deeds.data import load

    tw = load()
    items = pd.DataFrame({"item": tw.columns, "group": [tw.task[c] for c in tw.columns], "lo": [tw.lo[c] for c in tw.columns], "hi": [tw.hi[c] for c in tw.columns]})
    return Panel(tw.w4, tw.w13, items), dict(tw.llm)


# ── The report ───────────────────────────────────────────────────────────────────────────────────────────


def report_html(res: dict, title: str) -> str:
    esc = html.escape
    rows = sorted(res["twins"].items(), key=lambda kv: -kv[1]["accuracy"])
    cap = res["ceiling"]["overall"]

    def pct(x):
        return f"{round(100 * x)}%".replace("-", "−")

    def f3(x):
        return f"{x:.3f}".replace("-", "−")

    def sg(x):
        return f"{x:+.3f}".replace("-", "−")

    trs = "".join(
        f"<tr><td>{esc(n)}</td><td class=num>{v['people']}</td><td class=num>{f3(v['accuracy'])}</td><td class='num {'bad' if v['vs_crowd_ci95'][1] < 0 else ''}'>{sg(v['vs_crowd'])}"
        f"<small> [{sg(v['vs_crowd_ci95'][0])}, {sg(v['vs_crowd_ci95'][1])}]</small></td><td class=num>{v['r']:.3f}</td><td class='num {'bad' if v['knows'] < 0 else ''}'>{pct(v['knows'])}</td>"
        f"<td class='num good'>{f3(v['with_one_look'])} <small>({sg(v['one_look_gain'])})</small></td><td class='num good'>{pct(v['knows_with_one_look'])}</td></tr>"
        for n, v in rows
    )
    worst = min(v["vs_crowd"] for v in res["twins"].values())
    best = max(v["vs_crowd"] for v in res["twins"].values())
    below = sum(1 for v in res["twins"].values() if v["vs_crowd_ci95"][1] < 0)
    return f"""<title>{esc(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root {{ --paper: #f2f5f4; --sheet: #fbfcfb; --ink: #17262a; --muted: #56676b; --rule: #d2dbd8; --accent: #0d7f73; --bad: #9b3d2a; --sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif; --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --paper: #0e1517; --sheet: #141d20; --ink: #e2eae8; --muted: #9aaaa8; --rule: #26343a; --accent: #3cc3b1; --bad: #f19a83; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --paper: #0e1517; --sheet: #141d20; --ink: #e2eae8; --muted: #9aaaa8; --rule: #26343a; --accent: #3cc3b1; --bad: #f19a83; color-scheme: dark; }}
body {{ background: var(--paper); color: var(--ink); font: 15px/1.55 var(--sans); }}
.page {{ max-width: 1080px; margin: 0 auto; padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 16px; }}
h1 {{ font-size: 28px; margin: 0; }} p {{ margin: 0; max-width: 78ch; }}
.wrap {{ overflow-x: auto; background: var(--sheet); border: 1px solid var(--rule); border-radius: 8px; }}
table {{ border-collapse: collapse; width: 100%; font-size: 13.5px; }}
th, td {{ padding: 8px 10px; border-bottom: 1px solid var(--rule); text-align: left; vertical-align: top; }}
th {{ color: var(--muted); font-weight: 600; font-size: 12px; }}
td.num {{ font-family: var(--mono); white-space: nowrap; }} small {{ color: var(--muted); }}
.bad {{ color: var(--bad); }} .good {{ color: var(--accent); }}
.note {{ color: var(--muted); font-size: 13.5px; }}
</style>
<main class="page">
<h1>{esc(title)}</h1>
<p>{res['people']:,} people, {res['items']} items in {res['groups']} groups. The crowd's median answer, which knows nobody, scores the same cells as each twin. The knowable ceiling for these items is <b>{f3(cap['ceiling'])}</b> (crowd {f3(cap['base'])}), from each item's answer shares and its retest.</p>
<p><b>{below} of {len(rows)}</b> twins are reliably less accurate than the crowd (differences from {sg(worst)} to {sg(best)}). One earlier answer per person, read through each twin by the echo, lifts every one of them.</p>
<div class="wrap"><table>
<thead><tr><th>Twin</th><th>People</th><th>Accuracy</th><th>vs the crowd [95% CI]</th><th>Individual r</th><th>Knows of the knowable</th><th>With one look (gain)</th><th>Knows, with one look</th></tr></thead>
<tbody>{trs}</tbody></table></div>
<p class="note">Accuracy is 1 − |guess − answer| / range, averaged within groups, then over groups, then over people, on the cells each twin answered. "Knows of the knowable" is (accuracy − crowd) / (ceiling − crowd): below zero, the twin knows less than nobody. "With one look" is the two-layer echo with the twin as its prior and the person's earlier answer as its one observation, fitted out of fold. Method: research/deeds (ECHO).</p>
</main>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--truth"), ap.add_argument("--earlier"), ap.add_argument("--items")
    ap.add_argument("--twin", action="append", default=[], help="NAME=path.csv")
    ap.add_argument("--out", default=str(HERE / "out" / "audit"))
    ap.add_argument("--title", default="Twin audit")
    args = ap.parse_args()
    if args.demo:
        panel, twins = demo_panel()
        title = "Twin audit: Twin-2K-500's released twins"
    else:
        read = lambda p: pd.read_csv(p, index_col=0)  # noqa: E731
        panel = Panel(read(args.truth), read(args.earlier), pd.read_csv(args.items))
        twins = {spec.split("=", 1)[0]: read(spec.split("=", 1)[1]) for spec in args.twin}
        title = args.title
    res = audit(panel, twins)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "audit.json").write_text(json.dumps(res, indent=1))
    (out / "index.html").write_text(report_html(res, title))
    for name, v in sorted(res["twins"].items(), key=lambda kv: -kv[1]["accuracy"]):
        print(f"{name:55s} acc {v['accuracy']:.4f} vs crowd {v['vs_crowd']:+.4f} r {v['r']:.3f} knows {v['knows']:+.0%} | one look {v['with_one_look']:.4f} knows {v['knows_with_one_look']:+.0%}")
    print("ceiling", res["ceiling"]["overall"])


if __name__ == "__main__":
    main()
