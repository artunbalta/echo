"""
Study 4 (PREREG-MM.md): how fast a person becomes knowable, measured on the Moral Machine.

Reads data/mm/{dilemmas,survey_people}.parquet (mm_extract.py) and writes out/mm/results.json.
- M1, the looks curve: the echo after n looks on a fixed panel, against the theory's
  nρ̂² / (nρ̂ + 1 − ρ̂), with ρ̂ fitted on pairs only.
- M2, copying: crowd + one other look's residual, against 2ρ̂ − 1.
- M3, the persona against one look, among survey takers.
- M4, descriptive: within- against across-visit stability, the looks needed for 80%, a country crowd.

Every witness for the people in fold f is fitted on the other folds, the crowd included.

    /opt/anaconda3/bin/python3.13 research/deeds/run_mm.py [--draws 20] [--boot 500]
"""
import deeds  # noqa: F401

import argparse
import json
import pathlib
from dataclasses import dataclass

import numpy as np
import pandas as pd

from deeds.witnesses import _prep, _ridge_group

HERE = pathlib.Path(__file__).resolve().parent
MM = HERE / "data" / "mm"
OUT = HERE / "out" / "mm"
DIMS = ["Utilitarian", "Gender", "Fitness", "Age", "Social Status", "Species"]
FOLDS = 10
MIN_CELL = 100
MIN_PANEL = 2000
MAX_K = 20
SHRINK = 100
MIN_COUNTRY = 500


@dataclass
class Visits:
    """Each visit's two dilemmas of one dimension (indices into the dilemma rows), and who made them."""
    first: np.ndarray
    second: np.ndarray
    user: np.ndarray   # index into the people
    dim: np.ndarray
    fold: np.ndarray
    score: np.ndarray
    country: np.ndarray


def fold_of(user_hash: np.ndarray) -> np.ndarray:
    return (user_hash.view(np.uint64) % FOLDS).astype(np.int8)


def cells(rows: pd.DataFrame) -> list[np.ndarray]:
    """The situation at three grains, finest first: the full cell, (d, intervention, pedped, barrier), d."""
    d, i, p, b = (rows[k].to_numpy(np.int64) for k in ("dim", "intervention", "pedped", "barrier"))
    s, n, df = (rows[k].to_numpy(np.int64) for k in ("signal", "nchar", "diff"))
    assert ((i | p | b) <= 1).all() and (s <= 2).all() and (n <= 5).all() and (df <= 4).all() and (s | n | df).min() >= 0
    coarse = ((d * 2 + i) * 2 + p) * 2 + b
    return [(((coarse * 3 + s) * 6 + n) * 5 + df).astype(np.int32), coarse.astype(np.int32), d.astype(np.int32)]


class Crowd:
    """Mean of y per situation, for every dilemma, from all folds but one."""

    def __init__(self, rows: pd.DataFrame, fold: np.ndarray, min_cell: int = MIN_CELL):
        self.levels = cells(rows)
        self.min_cell = min_cell
        y = rows["saved"].to_numpy(float)
        self.S, self.N = [], []
        for code in self.levels:
            size = int(code.max()) + 1
            self.S.append(np.stack([np.bincount(code[fold == f], weights=y[fold == f], minlength=size) for f in range(FOLDS)]))
            self.N.append(np.stack([np.bincount(code[fold == f], minlength=size) for f in range(FOLDS)]))

    def without(self, f: int) -> np.ndarray:
        out = None
        for code, S, N in reversed(list(zip(self.levels, self.S, self.N))):
            s, n = S.sum(0) - S[f], N.sum(0) - N[f]
            mean = np.divide(s, n, out=np.full(len(s), np.nan), where=n > 0)
            out = mean[code] if out is None else np.where((n >= self.min_cell)[code], mean[code], out)
        return out


def visits_of(rows: pd.DataFrame, user_index: np.ndarray) -> Visits:
    d, s = rows["dim"].to_numpy(), rows["session"].to_numpy()
    start = np.flatnonzero(np.r_[True, (d[1:] != d[:-1]) | (s[1:] != s[:-1])])
    size = np.diff(np.r_[start, len(rows)])
    first = start[size == 2]
    second = first + 1
    y = rows["saved"].to_numpy(float)
    return Visits(first, second, user_index[first], d[first], fold_of(rows["user"].to_numpy())[first],
                  (y[first] + y[second]) / 2, rows["country"].cat.codes.to_numpy().astype(np.int64)[first] + 1)


def kappa(rho: float, n) -> np.ndarray:
    n = np.asarray(n, float)
    return n * rho / (n * rho + 1 - rho)


def theory_echo(rho: float, n) -> np.ndarray:
    return kappa(rho, n) * rho


def draw(users: np.ndarray, take: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """For each person, `take` of their visits in random order; the people (sorted) and a (people × take) index matrix."""
    order = np.lexsort((rng.random(len(users)), users))
    u = users[order]
    start = np.flatnonzero(np.r_[True, u[1:] != u[:-1]])
    rank = np.arange(len(u)) - np.repeat(start, np.diff(np.r_[start, len(u)]))
    keep = rank < take
    people = u[start]
    return people, order[keep].reshape(len(people), take)


def pair_rho(r: np.ndarray, users: np.ndarray, rng: np.random.Generator) -> float:
    """One random pair of looks per person (r and users aligned); the uncentred correlation of their residuals."""
    _, ix = draw(users, 2, rng)
    a, b = r[ix[:, 0]], r[ix[:, 1]]
    return float((a * b).sum() / ((a * a + b * b) / 2).sum())


def with_looks(v: Visits, sel: np.ndarray, at_least: int) -> np.ndarray:
    """Visits in `sel` whose person has at least `at_least` of them."""
    counts = np.bincount(v.user[sel], minlength=v.user.max() + 1)
    return sel & (counts[v.user] >= at_least)


def panel_k(v: Visits, sel: np.ndarray, min_panel: int) -> int:
    counts = np.bincount(np.bincount(v.user[sel]))
    have = counts[::-1].cumsum()[::-1]  # have[m] = people with at least m looks
    ok = [n for n in range(1, MAX_K + 1) if n + 1 < len(have) and have[n + 1] >= min_panel]
    return max(ok) if ok else 0


class Ledger:
    """Per-person sums of squared errors, one row per person, for skills and their bootstrap over people."""

    def __init__(self):
        self.parts: dict[str, list] = {}
        self.crowd_by_fold: dict[str, dict[int, float]] = {}

    def add(self, name: str, people: np.ndarray, se: np.ndarray, se_crowd: np.ndarray, fold: int | None = None):
        self.parts.setdefault(name, []).append((people, se, se_crowd))
        if fold is not None:
            by = self.crowd_by_fold.setdefault(name, {})
            by[fold] = by.get(fold, 0.0) + float(se_crowd.sum())

    def collapse(self):
        for name, chunks in self.parts.items():
            p = np.concatenate([c[0] for c in chunks])
            s = np.concatenate([c[1] for c in chunks])
            c = np.concatenate([c[2] for c in chunks])
            u, inv = np.unique(p, return_inverse=True)
            if s.ndim == 1:
                s2 = np.bincount(inv, weights=s, minlength=len(u))
            else:
                s2 = np.stack([np.bincount(inv, weights=s[:, j], minlength=len(u)) for j in range(s.shape[1])], 1)
            self.parts[name] = (u, s2, np.bincount(inv, weights=c, minlength=len(u)))

    def ratio(self, name: str, w: np.ndarray | None = None) -> np.ndarray:
        p, s, c = self.parts[name]
        ww = np.ones(len(p)) if w is None else w[p]
        return (ww @ s) / (ww @ c)

    def skill(self, name: str, w: np.ndarray | None = None) -> np.ndarray:
        return 1 - self.ratio(name, w)

    def fold_weights(self, name: str, folds: list[int]) -> np.ndarray:
        by = self.crowd_by_fold[name]
        w = np.array([by.get(f, 0.0) for f in folds])
        return w / w.sum()


def persona_matrix(people: pd.DataFrame) -> np.ndarray:
    """Age, gender, education, income, the two sliders and country, coded; out-of-range values missing."""
    age = people["Review_age"].where(people["Review_age"].between(18, 75))
    cols = [age.to_numpy(float)]
    for k in ("Review_political", "Review_religious"):
        x = people[k].where(people[k].between(0, 1))
        cols += [x.to_numpy(float), (x == 0.5).to_numpy(float)]
    country = people["country"].where(people["country"].map(people["country"].value_counts()) >= MIN_COUNTRY, "other")
    dummies = pd.get_dummies(pd.DataFrame({"g": people["Review_gender"], "e": people["Review_education"],
                                           "i": people["Review_income"], "c": country}).astype(str), dtype=float)
    return np.column_stack(cols + [dummies.to_numpy()])


def analyse(rows: pd.DataFrame, people: pd.DataFrame | None, draws: int = 20, boot: int = 500, seed: int = 0,
            min_panel: int = MIN_PANEL, min_cell: int = MIN_CELL, fixed_k: int | None = None, only_m1: bool = False) -> dict:
    """
    The registered analysis. Exploratory, not registered: `fixed_k` sets every panel's K instead of the rule
    (people with more than K looks), and `only_m1` skips M2–M4.
    """
    rows = rows.sort_values(["dim", "session"], kind="stable").reset_index(drop=True)
    uniq, user_index = np.unique(rows["user"].to_numpy(), return_inverse=True)
    v = visits_of(rows, user_index)
    crowd = Crowd(rows, fold_of(rows["user"].to_numpy()), min_cell)
    rng = np.random.default_rng(seed)
    y = rows["saved"].to_numpy(float)
    out: dict = {"counts": {"dilemmas": int(len(rows)), "people": int(len(uniq)), "sessions": int(rows["session"].nunique()),
                            "visits": {DIMS[d]: int((v.dim == d).sum()) for d in range(len(DIMS))}}}

    # Survey takers: their row in the persona matrix, by person.
    persona_row = np.full(len(uniq), -1)
    X = None
    if people is not None:
        X = persona_matrix(people)
        pos = np.searchsorted(uniq, people["user"].to_numpy())
        pos = np.clip(pos, 0, len(uniq) - 1)
        hit = uniq[pos] == people["user"].to_numpy()
        persona_row[pos[hit]] = np.flatnonzero(hit)
        out["counts"]["survey_takers"] = int(len(people))
        out["counts"]["survey_takers_matched"] = int(hit.sum())

    led = Ledger()
    plan = {}
    for d in range(len(DIMS)):
        dsel = v.dim == d
        k = fixed_k if fixed_k is not None else panel_k(v, dsel, min_panel)
        plan[d] = {"K": k, "panel": with_looks(v, dsel, k + 1) if k else None, "two": with_looks(v, dsel, 2), "one": dsel}
    rhos: dict = {d: {"M1": [], "M2": [], "M3": [], "f1": [], "f2": [], "f3": [], "stack": []} for d in range(len(DIMS))}

    for f in range(FOLDS):
        c = crowd.without(f)
        r = v.score - (c[v.first] + c[v.second]) / 2
        e1, e2 = y[v.first] - c[v.first], y[v.second] - c[v.second]
        test, train = v.fold == f, v.fold != f
        for d in range(len(DIMS)):
            P = plan[d]
            # M1: the looks curve on the panel.
            if P["K"]:
                K = P["K"]
                m = P["panel"] & train
                rho = pair_rho(r[m], v.user[m], rng) if m.any() else np.nan
                rho = float(np.clip(rho, 1e-6, 1 - 1e-6))
                sel = np.flatnonzero(P["panel"] & test)
                if len(sel):
                    kap = kappa(rho, np.arange(1, K + 1))
                    for _ in range(draws):
                        people_, ix = draw(v.user[sel], K + 1, rng)
                        R = r[sel][ix]
                        target, looks = R[:, 0], R[:, 1:]
                        mean = np.cumsum(looks, 1) / np.arange(1, K + 1)
                        led.add(f"M1:{d}", people_, (target[:, None] - kap * mean) ** 2, target ** 2, f)
                    rhos[d]["M1"].append(rho)
                    rhos[d]["f1"].append(f)
            if only_m1:
                continue
            # M2: copying and one look, everyone with two or more looks.
            m = P["two"] & train
            rho2 = float(np.clip(pair_rho(r[m], v.user[m], rng), 1e-6, 1 - 1e-6))
            sel = np.flatnonzero(P["two"] & test)
            for _ in range(draws):
                people_, ix = draw(v.user[sel], 2, rng)
                t, o = sel[ix[:, 0]], sel[ix[:, 1]]
                led.add(f"M2:copy:{d}", people_, (r[t] - r[o]) ** 2, r[t] ** 2, f)
                led.add(f"M2:echo1:{d}", people_, (r[t] - rho2 * r[o]) ** 2, r[t] ** 2)
                led.add(f"M2:raw:{d}", people_, (v.score[t] - v.score[o]) ** 2, r[t] ** 2)
                # M4: within a visit against across visits, single choices.
                pick = rng.random(len(t)) < 0.5
                ea = np.where(pick, e1[t], e2[t])
                eb = np.where(rng.random(len(o)) < 0.5, e1[o], e2[o])
                led.add(f"M4:within:{d}", people_, e1[t] * e2[t], (e1[t] ** 2 + e2[t] ** 2) / 2)
                led.add(f"M4:across:{d}", people_, ea * eb, (ea ** 2 + eb ** 2) / 2)
            rhos[d]["M2"].append(rho2)
            rhos[d]["f2"].append(f)
            # M4: a country crowd, everyone with a look.
            one_tr, one_te = np.flatnonzero(P["one"] & train), np.flatnonzero(P["one"] & test)
            nc = int(v.country.max()) + 1
            s_c = np.bincount(v.country[one_tr], weights=r[one_tr], minlength=nc)
            n_c = np.bincount(v.country[one_tr], minlength=nc)
            shift = np.divide(s_c, n_c + SHRINK)
            for _ in range(max(1, draws // 4)):
                people_, ix = draw(v.user[one_te], 1, rng)
                t = one_te[ix[:, 0]]
                led.add(f"M4:country:{d}", people_, (r[t] - shift[v.country[t]]) ** 2, r[t] ** 2)
            # M3: the persona against one look, survey takers with two or more looks.
            if X is not None:
                surv = P["two"] & (persona_row[v.user] >= 0)
                tr_sel, te_sel = np.flatnonzero(surv & train), np.flatnonzero(surv & test)
                if len(te_sel) and len(tr_sel):
                    tr_people, tr_inv = np.unique(v.user[tr_sel], return_inverse=True)
                    target = np.bincount(tr_inv, weights=r[tr_sel]) / np.bincount(tr_inv)
                    te_people = np.unique(v.user[te_sel])
                    A, B = _prep(X[persona_row[tr_people]], X[persona_row[te_people]])
                    both = _ridge_group(A, np.vstack([A, B]), target[:, None])[:, 0]
                    p_tr, p_te = both[:len(tr_people)], both[len(tr_people):]
                    persona_of = np.zeros(len(uniq))
                    persona_of[tr_people], persona_of[te_people] = p_tr, p_te
                    rho3 = float(np.clip(pair_rho(r[tr_sel], v.user[tr_sel], rng), 1e-6, 1 - 1e-6))
                    _, ix = draw(v.user[tr_sel], 2, rng)
                    t, o = tr_sel[ix[:, 0]], tr_sel[ix[:, 1]]
                    D = np.column_stack([np.ones(len(t)), persona_of[v.user[t]], r[o]])
                    coef = np.linalg.lstsq(D, r[t], rcond=None)[0]
                    for _ in range(draws):
                        people_, ix = draw(v.user[te_sel], 2, rng)
                        t, o = te_sel[ix[:, 0]], te_sel[ix[:, 1]]
                        p = persona_of[v.user[t]]
                        led.add(f"M3:persona:{d}", people_, (r[t] - p) ** 2, r[t] ** 2)
                        led.add(f"M3:echo1:{d}", people_, (r[t] - rho3 * r[o]) ** 2, r[t] ** 2, f)
                        led.add(f"M3:both:{d}", people_, (r[t] - (coef[0] + coef[1] * p + coef[2] * r[o])) ** 2, r[t] ** 2)
                    rhos[d]["M3"].append(rho3)
                    rhos[d]["f3"].append(f)
                    rhos[d]["stack"].append([float(x) for x in coef])
        print(f"fold {f} done", flush=True)

    led.collapse()
    quantities: dict[str, callable] = {}
    for name in led.parts:
        if name.startswith("M4:within") or name.startswith("M4:across"):
            quantities[name] = (lambda n: lambda w: led.ratio(n, w))(name)
        else:
            quantities[name] = (lambda n: lambda w: led.skill(n, w))(name)
    m3_dims = [d for d in range(len(DIMS)) if f"M3:persona:{d}" in led.parts]
    if m3_dims:
        quantities["M3:gap"] = lambda w: np.mean([led.skill(f"M3:echo1:{d}", w) - led.skill(f"M3:persona:{d}", w) for d in m3_dims])
    point = {k: fn(None) for k, fn in quantities.items()}
    reps: dict[str, list] = {k: [] for k in quantities}
    brng = np.random.default_rng(seed + 1)
    for _ in range(boot):
        w = np.bincount(brng.integers(0, len(uniq), len(uniq)), minlength=len(uniq)).astype(float)
        for k, fn in quantities.items():
            reps[k].append(fn(w))

    def interval(key: str) -> dict:
        x = np.array(reps[key]) if boot else None
        tolist = lambda a: a.tolist() if np.ndim(a) else float(a)  # noqa: E731
        res = {"value": tolist(point[key])}
        if boot:
            res.update(lo=tolist(np.quantile(x, 0.025, axis=0)), hi=tolist(np.quantile(x, 0.975, axis=0)))
        return res

    m1, m2, m3, m4 = {}, {}, {}, {}
    for d, name in enumerate(DIMS):
        K = plan[d]["K"]
        if K and f"M1:{d}" in led.parts:
            wf = led.fold_weights(f"M1:{d}", rhos[d]["f1"])
            rho = float(wf @ np.array(rhos[d]["M1"]))
            predicted = wf @ np.array([theory_echo(rf, np.arange(1, K + 1)) for rf in rhos[d]["M1"]])
            res = interval(f"M1:{d}")
            m1[name] = {"K": K, "people": int(len(led.parts[f"M1:{d}"][0])), "rho": rho, "rho_by_fold": rhos[d]["M1"],
                        "n": list(range(1, K + 1)), "observed": res["value"], "lo": res.get("lo"), "hi": res.get("hi"),
                        "predicted": predicted.tolist()}
        if only_m1:
            continue
        wf = led.fold_weights(f"M2:copy:{d}", rhos[d]["f2"])
        r2 = np.array(rhos[d]["M2"])
        rho2 = float(wf @ r2)
        m2[name] = {"people": int(len(led.parts[f"M2:copy:{d}"][0])), "rho": rho2, "rho_by_fold": rhos[d]["M2"],
                    "theory_copy": float(wf @ (2 * r2 - 1)), "theory_echo1": float(wf @ r2 ** 2),
                    "copy": interval(f"M2:copy:{d}"), "echo1": interval(f"M2:echo1:{d}"), "raw_copy": interval(f"M2:raw:{d}")}
        m2[name]["holds"] = bool(np.sign(m2[name]["copy"]["value"]) == np.sign(m2[name]["theory_copy"])
                                 and abs(m2[name]["copy"]["value"] - m2[name]["theory_copy"]) < 0.03)
        m4[name] = {"within": interval(f"M4:within:{d}"), "across": interval(f"M4:across:{d}"),
                    "looks_for_80": 4 * (1 - rho2) / rho2,
                    "looks_for_80_panel": (4 * (1 - m1[name]["rho"]) / m1[name]["rho"]) if name in m1 else None,
                    "country": interval(f"M4:country:{d}"), "country_people": int(len(led.parts[f"M4:country:{d}"][0]))}
        if d in m3_dims:
            wf = led.fold_weights(f"M3:echo1:{d}", rhos[d]["f3"])
            m3[name] = {"people": int(len(led.parts[f"M3:persona:{d}"][0])), "rho": float(wf @ np.array(rhos[d]["M3"])),
                        "persona": interval(f"M3:persona:{d}"), "echo1": interval(f"M3:echo1:{d}"),
                        "both": interval(f"M3:both:{d}"), "stack_by_fold": rhos[d]["stack"]}

    if m1:
        pred = np.concatenate([m1[k]["predicted"] for k in m1])
        obs = np.concatenate([m1[k]["observed"] for k in m1])
        later = np.concatenate([np.array(m1[k]["n"]) >= 2 for k in m1])
        m1["pooled"] = {"corr": float(np.corrcoef(pred, obs)[0, 1]) if len(pred) > 1 else float("nan"),
                        "mad": float(np.abs(pred - obs).mean()),
                        "mad_n2plus": float(np.abs(pred - obs)[later].mean()) if later.any() else float("nan"),
                        "max_abs": float(np.abs(pred - obs).max())}
        m1["pooled"]["holds"] = bool(m1["pooled"]["corr"] > 0.95 and m1["pooled"]["mad"] < 0.01)
    if m3_dims:
        m3["mean_gap"] = interval("M3:gap")
        m3["holds"] = bool(all(m3[DIMS[d]]["persona"]["value"] < m3[DIMS[d]]["echo1"]["value"] for d in m3_dims)
                           and (not boot or m3["mean_gap"]["lo"] > 0))
    out.update({"M1": m1, "M2": m2, "M3": m3, "M4": m4,
                "M2_holds": bool(m2) and bool(all(m2[k]["holds"] for k in m2)), "draws": draws, "boot": boot,
                "exploratory": {"fixed_k": fixed_k, "only_m1": only_m1} if (fixed_k is not None or only_m1) else None})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=20)
    ap.add_argument("--boot", type=int, default=500)
    ap.add_argument("--k", type=int, default=None, help="exploratory: every panel's K (people with more than K looks)")
    ap.add_argument("--m1-only", action="store_true", help="exploratory: the looks curve alone")
    args = ap.parse_args()
    # Only what the analysis reads, and no second copy held here (the machine is shared).
    cols = ["user", "session", "dim", "saved", "country", "intervention", "pedped", "barrier", "signal", "nchar", "diff"]
    res = analyse(pd.read_parquet(MM / "dilemmas.parquet", columns=cols), pd.read_parquet(MM / "survey_people.parquet"),
                  draws=args.draws, boot=args.boot, fixed_k=args.k, only_m1=args.m1_only)
    OUT.mkdir(parents=True, exist_ok=True)
    name = "results.json" if args.k is None and not args.m1_only else f"exploratory_k{args.k}.json"
    (OUT / name).write_text(json.dumps(res, indent=1))
    print(json.dumps({k: res[k] for k in ("counts", "M2_holds")}, indent=1))
    if "pooled" in res["M1"]:
        print("M1 pooled:", res["M1"]["pooled"])
    if "holds" in res["M3"]:
        print("M3 holds:", res["M3"]["holds"], res["M3"]["mean_gap"])


if __name__ == "__main__":
    main()
