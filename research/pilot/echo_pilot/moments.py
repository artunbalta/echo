"""
The village's moments (web decisions C86, C87; registration §5, RQ6–RQ7): what the pilot's participants
met besides the six, and what they did there.

Every moment a person saw is one row of the export's `byPerson[s].moments` (web migration 0039). A row
has the moment's kind, the arm of its experiment, how long it was in view, how near they came, and what
became of it: the verb chosen, walking past, nothing, or how an errand ended. A moment never seen is not
there, so every share below has its denominator: who met the nine-coin purse, not only who took from it.

In the pilot this is exploratory (registration §5): estimates with intervals over people, and the
literature's direction stated beside each, but no tests. Twenty friends cannot power a between-arm effect.

- `exposures`: how many met each moment, in each arm, and what they did.
- `contrasts`: each experiment's registered contrast. It compares the share doing the act in one arm
  against the other, with a bootstrap interval over people, and says whether it ran the literature's way.
  The two communal-work moments also give the effort held, from the act's own event.
- `pressure`: help met while carrying a loaf someone was waiting on, against help met otherwise (Darley &
  Batson's hurry).
- `consistency`: for each family of moments that read one thing (help, honesty, courtesy, conformity,
  order, curiosity), each person's share per visit. It correlates visit against visit (test–retest) and one
  half of the family's kinds against the other (split-half, Spearman–Brown).

`village(export)` gathers all of it. RQ8, what the moments add to the echo, is in `analysis.py`: the
engine echo of *elsewhere*, with and without them.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Optional, Sequence

from . import stats as S

#: What counts as the act in each experiment, by the verbs that are it (the layer's verb ids).
ACT: dict[str, frozenset[str]] = {
    "fallen-elder": frozenset({"help-up"}),
    "asch-boats": frozenset({"agree"}),
    "looking-up": frozenset({"look-up"}),
    "imece-wall": frozenset({"lend-hand"}),
    "net-haul": frozenset({"haul"}),
    "lost-purse": frozenset({"leave"}),
    "honey-stall": frozenset({"three-jars"}),
    "knucklebones": frozenset({"say-tava"}),
    "drunk-or-ill": frozenset({"help-home"}),
    "crying-alone": frozenset({"sit-with"}),
    "litter": frozenset({"tidy"}),
    "stray-ball": frozenset({"laugh"}),
    "greeting": frozenset({"greet-warm"}),
    "narrow-way": frozenset({"aside"}),
    "bench-sit": frozenset({"sit-close"}),
    "unfinished-tale": frozenset({"ask-end", "told"}),
}

#: Every verb a moment offers, so "decided" (a verb was chosen) can be told from walking by.
VERBS: dict[str, frozenset[str]] = {
    "asch-boats": frozenset({"agree", "differ"}),
    "lost-purse": frozenset({"leave", "take-one", "take-all"}),
    "honey-stall": frozenset({"one-jar", "three-jars"}),
    "knucklebones": frozenset({"say-true", "say-tava"}),
    "wrong-basket": frozenset({"not-mine", "take-it"}),
    "bench-sit": frozenset({"sit-close", "sit-far"}),
    "narrow-way": frozenset({"aside", "first"}),
    "greeting": frozenset({"greet-warm", "nod"}),
    "stray-ball": frozenset({"laugh", "scold"}),
}

#: Where the share is among those who chose (a decision: honesty, Asch, the bench), not everyone who saw it.
DECIDED: frozenset[str] = frozenset({"asch-boats", "lost-purse", "honey-stall", "knucklebones", "wrong-basket", "bench-sit", "narrow-way", "stray-ball"})

#: Registered contrasts (registration §5): kind, the arm expected higher, the arm expected lower, the act, the source.
CONTRASTS: tuple[tuple[str, str, str, str, str], ...] = (
    ("fallen-elder", "alone", "onlookers", "helps him up", "the bystander effect (Darley & Latané 1968; Fischer et al. 2011)"),
    ("asch-boats", "unanimous", "dissenter", "goes along with the majority", "conformity, and a dissenting ally (Asch 1956; Allen & Levine 1971)"),
    ("looking-up", "five", "one", "stops to look up", "the drawing power of a crowd (Milgram, Bickman & Berkowitz 1969)"),
    ("imece-wall", "alone", "crew", "joins the work", "social loafing (Latané, Williams & Harkins 1979; Karau & Williams 1993)"),
    ("net-haul", "alone", "crew", "joins the haul", "social loafing (Ingham et al. 1974)"),
    ("lost-purse", "many", "few", "leaves it for its owner", "civic honesty and the money in it (Cohn et al. 2019)"),
    ("honey-stall", "no-eye", "eye", "takes three jars", "watching eyes and norm violations (Dear, Dutton & Fox 2019)"),
    ("knucklebones", "unseen", "seen", "says tava", "lying unobserved (Gneezy, Kajackaite & Sobel 2018)"),
    ("drunk-or-ill", "ill", "drunk", "helps him home", "Piliavin, Rodin & Piliavin (1969)"),
    ("crying-alone", "on-the-way", "aside", "sits with her", "empathy and the ease of escape (Batson et al. 1981)"),
    ("litter", "clean", "littered", "picks it up", "norms in a clean or a littered place (Cialdini et al. 1990; Keizer et al. 2008)"),
    ("stray-ball", "apology", "no-apology", "laughs it off", "apology and forgiveness (Ohbuchi, Kameda & Agarie 1989)"),
    ("greeting", "high", "low", "greets warmly", "courtesy across status (cue G2)"),
    ("unfinished-tale", "short-pause", "long-pause", "waits for, or asks for, the end", "curiosity paid for in time (Kang et al. 2009)"),
)
#: Contrasts with no direction registered: the literature points both ways.
TWO_SIDED: tuple[tuple[str, str, str, str, str], ...] = (
    ("narrow-way", "elder", "porter", "steps aside", "power or burden (Dabbs & Stokes 1975; Willis, Gier & Smith 1979)"),
    ("bench-sit", "peer", "elder", "sits beside them", "personal space and status (Sommer 1959; Hayduk 1983)"),
)
#: Effort held, from the act's event (`thoroughness01`): the social-loafing read proper.
EFFORT: frozenset[str] = frozenset({"imece-wall", "net-haul"})

#: Families of moments that read one thing, and the verbs that are it in each.
FAMILIES: dict[str, dict[str, frozenset[str]]] = {
    "help": {
        "fallen-elder": frozenset({"help-up"}), "spilled-basket": frozenset({"help"}), "stuck-cart": frozenset({"push"}),
        "loose-hen": frozenset({"catch"}), "heavy-jugs": frozenset({"carry"}), "dark-lantern": frozenset({"walk"}),
        "ask-way": frozenset({"walk"}), "drunk-or-ill": frozenset({"help-home"}), "crying-alone": frozenset({"sit-with"}),
        "caught-lamb": frozenset({"free-lamb"}),
    },
    "honesty": {
        "lost-purse": frozenset({"leave"}), "wrong-basket": frozenset({"not-mine"}), "knucklebones": frozenset({"say-true"}),
        "honey-stall": frozenset({"one-jar"}),
    },
    "courtesy": {
        "greeting": frozenset({"greet-warm", "nod"}), "narrow-way": frozenset({"aside"}), "rude-bump": frozenset({"sorry"}),
        "tea-invite": frozenset({"sit-tea", "thank"}),
    },
    "conformity": {
        "asch-boats": frozenset({"agree"}), "looking-up": frozenset({"look-up"}), "well-custom": frozenset({"touch"}),
        "open-gate": frozenset({"shut-gate"}),
    },
    "order": {"litter": frozenset({"tidy"}), "woodpile": frozenset({"stack"}), "banging-door": frozenset({"shut"})},
    "curiosity": {"unfinished-tale": frozenset({"ask-end", "told"})},
}


def moments_of(export: dict) -> list[dict]:
    """Every moment met, with its person: the export's rows, none for a person whose record was unreadable."""
    out = []
    for s, rec in (export.get("byPerson") or {}).items():
        for m in rec.get("moments") or []:
            out.append({**m, "subject": s})
    return out


def efforts_of(export: dict) -> dict[str, float]:
    """How much of a communal act was held (`thoroughness01`), by the moment it was done at (its target)."""
    out: dict[str, float] = {}
    for rec in (export.get("byPerson") or {}).values():
        for row in (rec.get("events") or {}).get("rows", []):
            if row.get("action") not in ("work_shift", "shirk_work"):
                continue
            tid = (row.get("target_json") or {}).get("id")
            th = (row.get("raw_signals_json") or {}).get("thoroughness01")
            if isinstance(tid, str) and isinstance(th, (int, float)):
                out[tid] = float(th)
    return out


def _decided(row: dict) -> bool:
    verbs = VERBS.get(row["kind"])
    return verbs is not None and row["outcome"] in verbs


def _counts(row: dict) -> bool:
    """Whether a row is in its moment's denominator: everyone who saw it, or, where it is a decision, those who chose."""
    return _decided(row) if row["kind"] in DECIDED else True


def wilson(k: int, n: int, z: float = 1.959964) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """A share and its 95% Wilson interval; None for none."""
    if n == 0:
        return None, None, None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, max(0.0, c - h), min(1.0, c + h)


def exposures(rows: Sequence[dict]) -> dict:
    """By moment and arm: how many saw it, how many people, how long it was in view, and what became of it."""
    out: dict[str, dict] = {}
    by: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        by[(r["kind"], r.get("arm") or "-")].append(r)
    for (kind, arm), rs in sorted(by.items()):
        out.setdefault(kind, {})[arm] = {
            "met": len(rs),
            "people": len({r["subject"] for r in rs}),
            "seen_s": S.mean([float(r["seenS"]) for r in rs]),
            "outcomes": dict(Counter(r["outcome"] for r in rs).most_common()),
        }
    return out


def _share(rows: Sequence[dict], act: frozenset[str]) -> Optional[float]:
    rs = [r for r in rows if _counts(r)]
    return None if not rs else sum(1 for r in rs if r["outcome"] in act) / len(rs)


def _arm_rows(rows: Sequence[dict], kind: str, arm: str) -> list[dict]:
    return [r for r in rows if r["kind"] == kind and r.get("arm") == arm]


def _by_person(rows: Sequence[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        out[r["subject"]].append(r)
    return out


def _contrast(rows: Sequence[dict], efforts: dict[str, float], kind: str, hi: str, lo: str, what: str, source: str, ci: bool, directed: bool) -> dict:
    act = ACT[kind]
    a, b = _arm_rows(rows, kind, hi), _arm_rows(rows, kind, lo)
    ka, na = sum(1 for r in a if _counts(r) and r["outcome"] in act), sum(1 for r in a if _counts(r))
    kb, nb = sum(1 for r in b if _counts(r) and r["outcome"] in act), sum(1 for r in b if _counts(r))
    pa, la, ha = wilson(ka, na)
    pb, lb, hb = wilson(kb, nb)
    diff = None if pa is None or pb is None else pa - pb
    people = sorted({r["subject"] for r in a} | {r["subject"] for r in b})
    by_a, by_b = _by_person(a), _by_person(b)

    def stat(group: Sequence[str]) -> Optional[float]:
        # A person drawn twice counts twice: their rows are taken as often as they were drawn.
        sa, sb = _share([r for s in group for r in by_a.get(s, [])], act), _share([r for s in group for r in by_b.get(s, [])], act)
        return None if sa is None or sb is None else sa - sb

    lo_ci, hi_ci = S.bootstrap(people, stat) if (ci and diff is not None and len(people) >= 3) else (None, None)
    out = {
        "kind": kind, "act": what, "source": source, "arms": [hi, lo], "directed": directed,
        hi: {"k": ka, "n": na, "share": pa, "lo": la, "hi": ha},
        lo: {"k": kb, "n": nb, "share": pb, "lo": lb, "hi": hb},
        "difference": diff, "ci": [lo_ci, hi_ci], "people": len(people),
        # Ran the literature's way: the arm expected higher was higher (no claim, in the pilot).
        "as_expected": None if (diff is None or not directed) else diff > 0,
    }
    if kind in EFFORT:
        # Social loafing proper: of those who joined, how much of the work they held, alone or in a crew.
        ea = [efforts[r["ref"]] for r in a if r["outcome"] in act and r["ref"] in efforts]
        eb = [efforts[r["ref"]] for r in b if r["outcome"] in act and r["ref"] in efforts]
        out["effort"] = {hi: {"n": len(ea), "mean": S.mean(ea)}, lo: {"n": len(eb), "mean": S.mean(eb)}, "difference": None if not ea or not eb else S.mean(ea) - S.mean(eb)}
    return out


def contrasts(rows: Sequence[dict], efforts: dict[str, float], ci: bool = True) -> list[dict]:
    """Every registered contrast, directed and two-sided."""
    return [_contrast(rows, efforts, *c, ci=ci, directed=True) for c in CONTRASTS] + [_contrast(rows, efforts, *c, ci=ci, directed=False) for c in TWO_SIDED]


def pressure(rows: Sequence[dict], ci: bool = True) -> dict:
    """Help met while carrying a loaf someone waited on (time pressure), against help met otherwise (Darley & Batson 1973)."""
    helps = FAMILIES["help"]
    rs = [r for r in rows if r["kind"] in helps]
    under = [r for r in rs if (r.get("armRaw") or {}).get("time_pressure")]
    free = [r for r in rs if not (r.get("armRaw") or {}).get("time_pressure")]

    def share(group: Sequence[dict]) -> tuple[int, int]:
        return sum(1 for r in group if r["outcome"] in helps[r["kind"]]), len(group)

    (ku, nu), (kf, nf) = share(under), share(free)
    pu, pf = wilson(ku, nu), wilson(kf, nf)
    people = sorted({r["subject"] for r in under})
    by_u, by_f = _by_person(under), _by_person(free)

    def stat(group: Sequence[str]) -> Optional[float]:
        a, b = share([r for s in group for r in by_u.get(s, [])]), share([r for s in group for r in by_f.get(s, [])])
        return None if not a[1] or not b[1] else a[0] / a[1] - b[0] / b[1]

    diff = None if pu[0] is None or pf[0] is None else pu[0] - pf[0]
    lo, hi = S.bootstrap(people, stat) if (ci and diff is not None and len(people) >= 3) else (None, None)
    return {"under": {"k": ku, "n": nu, "share": pu[0]}, "free": {"k": kf, "n": nf, "share": pf[0]}, "difference": diff, "ci": [lo, hi], "people": len(people), "as_expected": None if diff is None else diff < 0}


def _family_score(rows: Sequence[dict], family: dict[str, frozenset[str]]) -> Optional[float]:
    rs = [r for r in rows if r["kind"] in family and _counts(r)]
    return None if not rs else sum(1 for r in rs if r["outcome"] in family[r["kind"]]) / len(rs)


def consistency(rows: Sequence[dict]) -> dict:
    """Per family: each person's share per visit, visit against visit, and half the kinds against the other half."""
    out = {}
    by_person: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_person[r["subject"]].append(r)
    for name, family in FAMILIES.items():
        kinds = sorted(family)
        per_visit = {s: {v: _family_score([r for r in rs if r["visit"] == v], family) for v in (1, 2, 3)} for s, rs in by_person.items()}
        pairs = [(per_visit[s][1], per_visit[s][2]) for s in per_visit if per_visit[s][1] is not None and per_visit[s][2] is not None]
        retest = S.pearson([a for a, _ in pairs], [b for _, b in pairs]) if len(pairs) >= 3 else {"r": None, "lo": None, "hi": None}
        halves = None
        # The kinds of the family that were met, split alternately: one half against the other.
        met = sorted({r["kind"] for r in rows if r["kind"] in family})
        if len(met) >= 2:
            first = {k: family[k] for k in met[0::2]}
            second = {k: family[k] for k in met[1::2]}
            hs = [(_family_score(rs, first), _family_score(rs, second)) for rs in by_person.values()]
            hs = [(a, b) for a, b in hs if a is not None and b is not None]
            if len(hs) >= 3:
                r = S.pearson([a for a, _ in hs], [b for _, b in hs])["r"]
                halves = {"pairs": len(hs), "r": r, "spearman_brown": None if r is None or r <= -1 else 2 * r / (1 + r)}
        out[name] = {
            "kinds": kinds,
            "met": sum(1 for r in rows if r["kind"] in family),
            "mean": S.mean([sc for s in per_visit for sc in per_visit[s].values() if sc is not None]),
            "retest": {"pairs": len(pairs), "r": retest["r"], "lo": retest["lo"], "hi": retest["hi"]},
            "split_half": halves,
        }
    return out


def village(export: dict, ci: bool = True) -> dict:
    """Everything the moments say (RQ6–RQ7), from an export; exploratory in the pilot (registration §5)."""
    rows = moments_of(export)
    unreadable = [s for s, rec in (export.get("byPerson") or {}).items() if rec.get("moments") is None]
    return {
        "exploratory": True,
        "met": len(rows),
        "people": len({r["subject"] for r in rows}),
        "unreadable": unreadable,
        "exposures": exposures(rows),
        "contrasts": contrasts(rows, efforts_of(export), ci),
        "pressure": pressure(rows, ci),
        "consistency": consistency(rows),
    }
