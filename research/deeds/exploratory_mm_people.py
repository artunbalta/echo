"""
Study 2c, exploratory (not registered): is a browser one person? The survey is asked after each session,
so a browser whose stated age, gender or education changes between surveyed sessions is, most likely,
more than one person.

- How often that happens, by how many sessions the browser played.
- The registered quantities (ρ̂ from pairs of visits, within- and across-visit agreement) among browsers
  whose answers never change, against those whose answers do.

Writes out/mm/people.json.

    /opt/anaconda3/bin/python3.13 research/deeds/exploratory_mm_people.py
"""
import deeds  # noqa: F401

import json

import numpy as np
import pandas as pd

import mm_extract as X
import run_mm as R

KEEP = ["ExtendedSessionID", "Review_age", "Review_gender", "Review_education"]


def sessions_surveyed() -> pd.DataFrame:
    parts = []
    for c in X._chunks(X.MM / "SharedResponsesSurvey.csv.tar.gz", KEEP):
        c = c.drop_duplicates("ExtendedSessionID")
        c = c.loc[c["ExtendedSessionID"].str.contains("_")]
        parts.append(pd.DataFrame({"user": X._hash(X._user(c["ExtendedSessionID"])), "session": X._hash(c["ExtendedSessionID"]),
                                   "age": pd.to_numeric(c["Review_age"], errors="coerce").to_numpy(),
                                   "gender": c["Review_gender"].to_numpy(), "education": c["Review_education"].to_numpy()}))
    out = pd.concat(parts, ignore_index=True).drop_duplicates("session")
    out.loc[~out["age"].between(18, 75), "age"] = np.nan
    return out


def changes(s: pd.DataFrame) -> pd.Series:
    """Per browser with two or more surveyed sessions: whether its stated person changes."""
    g = s.groupby("user")
    n = g.size()
    age = g["age"].agg(lambda a: a.dropna().max() - a.dropna().min() if a.notna().sum() >= 2 else 0.0)
    told = lambda col: g[col].agg(lambda v: v[(v != "default") & (v != "")].nunique())  # noqa: E731
    changed = (age > 1) | (told("gender") > 1) | (told("education") > 1)
    return changed[n >= 2]


def main():
    s = sessions_surveyed()
    changed = changes(s)
    rows = pd.read_parquet(R.MM / "dilemmas.parquet", columns=["user", "session"])
    played = rows.drop_duplicates("session").groupby("user").size()
    del rows
    surveyed = s.groupby("user").size()
    out = {"surveyed_sessions": int(len(s)), "browsers_two_surveyed": int(len(changed)), "changed": float(changed.mean())}
    by = pd.DataFrame({"changed": changed, "played": played.reindex(changed.index), "surveyed": surveyed.reindex(changed.index)})
    bins = [(2, 2), (3, 3), (4, 6), (7, 10), (11, 20), (21, 10**9)]
    out["by_sessions_played"] = [{"from": a, "to": b, "browsers": int(((by.played >= a) & (by.played <= b)).sum()),
                                  "changed": float(by.changed[(by.played >= a) & (by.played <= b)].mean())} for a, b in bins]
    # The registered quantities among browsers whose stated person never changes, and those whose does.
    dil = pd.read_parquet(R.MM / "dilemmas.parquet", columns=["user", "session", "dim", "saved", "country", "intervention", "pedped", "barrier", "signal", "nchar", "diff"])
    keep_users = changed.index.to_numpy()
    dil = dil.loc[dil["user"].isin(keep_users)].reset_index(drop=True)
    out["groups"] = {}
    for name, users in (("same_person", changed.index[~changed.to_numpy()]), ("changes", changed.index[changed.to_numpy()])):
        part = dil.loc[dil["user"].isin(users.to_numpy())]
        res = R.analyse(part, None, draws=10, boot=200, only_m1=False, fixed_k=1)
        out["groups"][name] = {
            "browsers": int(len(users)),
            "rho": {k: v["rho"] for k, v in res["M2"].items()},
            "within": {k: v["within"]["value"] for k, v in res["M4"].items()},
            "across": {k: v["across"]["value"] for k, v in res["M4"].items()},
            "copy": {k: v["copy"]["value"] for k, v in res["M2"].items()},
            "theory_copy": {k: v["theory_copy"] for k, v in res["M2"].items()},
        }
        print(name, json.dumps(out["groups"][name], indent=0)[:600], flush=True)
    R.OUT.mkdir(parents=True, exist_ok=True)
    (R.OUT / "people.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: out[k] for k in ("surveyed_sessions", "browsers_two_surveyed", "changed", "by_sessions_played")}, indent=1))


if __name__ == "__main__":
    main()
