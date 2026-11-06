"""
Twin-2K-500 as the study reads it (PREREG §1, §3).

Three things come out of here, all keyed by participant id (1..2058):

- **The persona**, as four kinds of information:
  - facts: demographics;
  - self: what people say they are like;
  - choices: what they chose in economic games and price lists;
  - tests: how they did on cognitive tests.
  Free text is left out. The LLM twins saw it; a regression cannot.
- **The 17 tasks' answers at both times.**
  - "w13" is waves 1–3: outside the persona, never shown to the twins.
  - "w4" is wave 4, two weeks later.
  Both are on the authors' own scoring: their column ranges, their task map, and their anchoring deciles.
- **The released LLM twins' predictions** for the same columns, one table per specification.

The scoring constants are copied from the authors' `evaluation/mad_accuracy_evaluation.py`
(github.com/tianyipeng-lab/Digital-Twin-Simulation), so that the accuracy here is theirs to the digit.
"""
from __future__ import annotations

import functools
import json
import pathlib
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "Twin-2K-500"
CATALOG = DATA / "question_catalog_and_human_response_csv"
SIMS = DATA / "LLM_simulation_results" / "llm_simulations_all_specifications"

KINDS = {"facts": "Demographics", "self": "Personality", "choices": "Economic preferences", "tests": "Cognitive tests"}


# ── The authors' scoring, verbatim in content ────────────────────────────────────────────────────────────


def _minmax() -> dict[str, tuple[float, float]]:
    m: dict[str, tuple[float, float]] = {}
    m.update({f"FALSE CONS. SELF _{i}": (1, 5) for i in range(1, 11)})
    m.update({f"FALSE CONS. OTHERS _{i}": (0, 100) for i in [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]})
    m["Q156_1"] = (0, 100)
    m["FORM A _1"] = (0, 100)
    m.update({f"Q{c}": (1, 6) for c in ["157", "158"] + [f"160_{i}" for i in (1, 2, 3)] + [f"159_{i}" for i in (1, 2, 3)]})
    for c in ("161", "162"):
        m[f"Q{c}"] = (1, 7)
    for c in ("164", "166", "168", "170"):
        m[f"Q{c}"] = (1, 10)
    for c in ("171", "172", "173", "174", "175", "176"):
        m[f"Q{c}"] = (1, 5)
    for c in ("177", "178", "179"):
        m[f"Q{c}"] = (1, 6)
    m["Q181"] = (0, 20)
    m["Q182"] = (0, 20)
    for c in ("183", "184"):
        m[f"Q{c}"] = (1, 2)
    for c in ("189", "190", "191"):
        m[f"Q{c}"] = (1, 10)
    for c in ("192", "193"):
        m[f"Q{c}"] = (1, 2)
    for c in ("194", "195"):
        m[f"Q{c}"] = (1, 6)
    m.update({f"Q198_{i}": (1, 2) for i in range(1, 11)})
    m.update({f"Q203_{i}": (1, 2) for i in range(1, 7)})
    m.update({f"NONSEPARABILTY BENE _{i}": (1, 7) for i in range(1, 5)})
    m.update({f"NONSEPARABILITY RIS _{i}": (1, 7) for i in range(1, 5)})
    m["OMISSION BIAS "] = (1, 4)
    m["DENOMINATOR NEGLECT "] = (1, 2)
    m.update({f"{i}_Q295": (1, 2) for i in range(1, 41)})
    return m


def _tasks() -> dict[str, str]:
    raw = {
        **{f"False Cons. self _{i}": "false consensus" for i in range(1, 11)},
        **{f"False cons. others _{i}": "false consensus" for i in [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]},
        "Q156_1": "base rate", "Form A _1": "base rate",
        "Q157": "framing problem", "Q158": "framing problem",
        **{f"Q160_{i}": "conjunction problem (Linda)" for i in [1, 2, 3]},
        **{f"Q159_{i}": "conjunction problem (Linda)" for i in [1, 2, 3]},
        "Q161": "outcome bias", "Q162": "outcome bias",
        "Q164": "anchoring and adjustment", "Q166": "anchoring and adjustment",
        "Q168": "anchoring and adjustment", "Q170": "anchoring and adjustment",
        **{f"Q17{i}": "less is more" for i in range(1, 10)},
        "Q181": "sunk cost fallacy", "Q182": "sunk cost fallacy",
        "Q183": "absolute vs. relative savings", "Q184": "absolute vs. relative savings",
        "Q189": "WTA/WTP-Thaler", "Q190": "WTA/WTP-Thaler", "Q191": "WTA/WTP-Thaler",
        "Q192": "Allais", "Q193": "Allais",
        "Q194": "myside", "Q195": "myside",
        **{f"Q198_{i}": "prob matching vs. max" for i in range(1, 11)},
        **{f"Q203_{i}": "prob matching vs. max" for i in range(1, 7)},
        **{f"nonseparabilty bene _{i}": "non-separability of risks and benefits" for i in range(1, 5)},
        **{f"nonseparability ris _{i}": "non-separability of risks and benefits" for i in range(1, 5)},
        "Omission bias ": "omission",
        "Denominator neglect ": "denominator neglect",
        **{f"{i}_Q295": "pricing" for i in range(1, 41)},
    }
    return {k.upper(): v for k, v in raw.items()}


MINMAX = _minmax()
TASK_OF = _tasks()
DECILE_GROUPS = (("Q164", "Q166"), ("Q168", "Q170"))  # pooled for the thresholds, as the authors do
# The between-subject experiments (one condition each) and the within-subject ones (every person answers).
WITHIN = {"false consensus", "conjunction problem (Linda)", "less is more", "WTA/WTP-Thaler", "prob matching vs. max",
          "non-separability of risks and benefits", "omission", "denominator neglect", "pricing"}


def _read_formatted(path: pathlib.Path) -> pd.DataFrame:
    """One of the authors' formatted CSVs: the second line is a description row; columns upper-cased, numeric."""
    df = pd.read_csv(path, skiprows=[1], low_memory=False)
    df.columns = df.columns.str.upper()
    df = df.drop(columns=[c for c in df.columns if c == "WAVE"], errors="ignore")
    df = df.set_index("TWIN_ID")
    df.index = df.index.astype(int)
    return df.apply(pd.to_numeric, errors="coerce").sort_index()


def _decile(values: pd.Series, thresholds: np.ndarray) -> pd.Series:
    """The authors' `assign_decile`: the first threshold a value is at or below, 1..10; above all is 10."""
    out = np.searchsorted(thresholds, values.to_numpy(dtype=float), side="left") + 1.0
    out = np.minimum(out, 10.0)
    out[values.isna().to_numpy()] = np.nan
    return pd.Series(out, index=values.index)


# ── The tables ────────────────────────────────────────────────────────────────────────────────────────────


@dataclass
class Twin:
    ids: np.ndarray                      # participant ids, sorted
    columns: list[str]                   # the 126 → scored columns (upper-case formatted names)
    task: dict[str, str]                 # column → task
    lo: dict[str, float]                 # column → min of the scale
    hi: dict[str, float]                 # column → max of the scale
    w13: pd.DataFrame                    # waves 1–3 answers to the scored columns (deciles for anchoring)
    w4: pd.DataFrame                     # wave 4 answers, same scoring
    llm: dict[str, pd.DataFrame]         # specification → its predictions, same scoring
    persona: dict[str, pd.DataFrame]     # kind → raw persona columns (catalog CSV columns)
    catalog_of: dict[str, str] = field(default_factory=dict)  # scored column → catalog CSV column

    @property
    def tasks(self) -> list[str]:
        return sorted(set(self.task[c] for c in self.columns))

    def range_of(self, col: str) -> float:
        return float(self.hi[col] - self.lo[col])


@functools.lru_cache(maxsize=1)
def load() -> Twin:
    """Everything, read once. The default specification's folder duplicates "Text Persona - GPT4.1-mini" byte for byte."""
    specs = sorted(p.name for p in SIMS.iterdir() if (p / "csv_comparison" / "csv_formatted" / "responses_llm_imputed_formatted.csv").exists())
    first = SIMS / specs[0] / "csv_comparison" / "csv_formatted"
    w13 = _read_formatted(first / "responses_wave1_3_formatted.csv")
    w4 = _read_formatted(first / "responses_wave4_formatted.csv")
    llm = {s: _read_formatted(SIMS / s / "csv_comparison" / "csv_formatted" / "responses_llm_imputed_formatted.csv") for s in specs}
    # Every specification ships the same human files (some for a subset of people: the fine-tuned twin was
    # scored on the people it was not trained on); the study reads them once, and checks that it may.
    for s in specs:
        other = _read_formatted(SIMS / s / "csv_comparison" / "csv_formatted" / "responses_wave1_3_formatted.csv")
        if len(other) > len(w13):
            w13, w4 = other, _read_formatted(SIMS / s / "csv_comparison" / "csv_formatted" / "responses_wave4_formatted.csv")
    for s in specs:
        other = _read_formatted(SIMS / s / "csv_comparison" / "csv_formatted" / "responses_wave1_3_formatted.csv")
        cols = [c for c in w13.columns if c in other.columns and c in MINMAX]
        both = other.index.intersection(w13.index)
        assert other.loc[both, cols].equals(w13.loc[both, cols]), f"{s}: waves 1–3 differ"

    columns = [c for c in w13.columns if c in MINMAX and c in w4.columns and c in TASK_OF]
    thresholds = {}
    for group in DECILE_GROUPS:
        pooled = pd.concat([w13[c] for c in group if c in w13.columns]).dropna()
        thresholds.update({c: np.percentile(pooled, np.arange(10, 100, 10)) for c in group})
    tables = [w13, w4, *llm.values()]
    for t in tables:
        for c, th in thresholds.items():
            if c in t.columns:
                t[c] = _decile(t[c], th)

    mapping = json.loads((DATA / "LLM_simulation_results" / "wave4_formatted_to_catalog_mapping.json").read_text())
    catalog_of = {m["formatted_column"].upper(): m["catalog_csv_column"] for m in mapping}

    cat = json.loads((CATALOG / "question_catalog.json").read_text())
    raw = pd.read_csv(CATALOG / "wave1_3_response.csv", low_memory=False).set_index("pid").sort_index()
    persona = {}
    for kind, block in KINDS.items():
        cols = [c for q in cat if (q.get("BlockName") or "").strip() == block for c in q.get("csv_columns", [])]
        persona[kind] = raw[[c for c in cols if c in raw.columns]]

    ids = np.array(sorted(set(w13.index) & set(w4.index) & set(raw.index)))
    return Twin(
        ids=ids,
        columns=columns,
        task={c: TASK_OF[c] for c in columns},
        lo={c: float(MINMAX[c][0]) for c in columns},
        hi={c: float(MINMAX[c][1]) for c in columns},
        w13=w13.loc[ids, columns],
        w4=w4.loc[ids, columns],
        llm={s: t.reindex(index=ids, columns=columns) for s, t in llm.items()},
        persona={k: v.loc[ids] for k, v in persona.items()},
        catalog_of=catalog_of,
    )


# ── The persona as numbers ───────────────────────────────────────────────────────────────────────────────


def _is_text_field(col: str, cat_type: dict[str, tuple[str, str]]) -> bool:
    qtype, sel = cat_type.get(col, ("", ""))
    return qtype == "TE" and sel in ("ML", "FORM")


@functools.lru_cache(maxsize=None)
def features(kinds: tuple[str, ...]) -> tuple[np.ndarray, list[str]]:
    """
    The design matrix for some kinds of persona information, rows in `load().ids` order, NaN where missing.

    Encoding, decided before any target was looked at (PREREG §3):
    - multiple-choice answers are one-hot (an answer's position carries no order in a test or a religion);
    - Likert rows, price-list rows and sliders are numbers as answered;
    - a numeric text field (a test's typed answer) becomes indicators of its five most frequent answers,
      so a model can learn the right answer without the study coding a key.
    The catalog's free-text fields are dropped. Nothing here reads a target.
    """
    tw = load()
    cat = json.loads((CATALOG / "question_catalog.json").read_text())
    cat_type: dict[str, tuple[str, str]] = {}
    for q in cat:
        for c in q.get("csv_columns", []):
            cat_type[c] = (q.get("QuestionType", ""), q.get("Settings", {}).get("Selector", ""))
    blocks, names = [], []
    for kind in kinds:
        raw = tw.persona[kind]
        for col in raw.columns:
            if _is_text_field(col, cat_type):
                continue
            qtype, sel = cat_type.get(col, ("", ""))
            s = raw[col]
            if qtype == "TE":
                v = pd.to_numeric(s, errors="coerce")
                top = v.value_counts().index[:5]
                for val in top:
                    blocks.append(np.where(v.isna(), np.nan, (v == val).astype(float)))
                    names.append(f"{kind}:{col}=={val:g}")
                continue
            v = pd.to_numeric(s, errors="coerce")
            if qtype == "MC" and sel in ("SAVR", "SAHR"):
                levels = sorted(v.dropna().unique())
                for val in levels[1:] if len(levels) > 1 else []:
                    blocks.append(np.where(v.isna(), np.nan, (v == val).astype(float)))
                    names.append(f"{kind}:{col}=={val:g}")
                continue
            if qtype == "MC" and sel in ("MAVR", "MAHR"):
                blocks.append(v.notna().astype(float).to_numpy())  # a ticked option is 1, unticked is NaN in the CSV
                names.append(f"{kind}:{col}")
                continue
            if v.notna().sum() == 0 or v.nunique() < 2:
                continue
            blocks.append(v.to_numpy(dtype=float))
            names.append(f"{kind}:{col}")
    X = np.column_stack(blocks) if blocks else np.zeros((len(tw.ids), 0))
    return X, names


def others_matrix(exclude_task: str, wave: str = "w13") -> tuple[np.ndarray, list[str]]:
    """The person's answers to the OTHER tasks (deeds elsewhere), at one wave: NaN where a condition was not shown."""
    tw = load()
    table = tw.w13 if wave == "w13" else tw.w4
    cols = [c for c in tw.columns if tw.task[c] != exclude_task]
    return table[cols].to_numpy(dtype=float), [f"others:{c}" for c in cols]
