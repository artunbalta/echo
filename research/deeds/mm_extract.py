"""
Study 4 (PREREG-MM.md): the Moral Machine's responses, reduced to what the registered analysis reads.

The compressed files are streamed, never unpacked to disk.
- **The responses.** For each dilemma of the six character dimensions (`ScenarioType` =
  `ScenarioTypeStrict`), the row of its default side is kept: who answered, in which session, the
  situation, and whether that side was spared.
- **The survey.** Each survey taker's answers are kept once, from their first session in the file.

A person is the user part of `ExtendedSessionID`. The `UserID` column was written as a float rounded to
15 digits; the session id carries the user's fingerprint in full.

    /opt/anaconda3/bin/python3.13 research/deeds/mm_extract.py [--survey-only]
"""
import deeds  # noqa: F401

import io
import pathlib
import sys
import tarfile

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
MM = HERE / "data" / "mm"
DIMS = ["Utilitarian", "Gender", "Fitness", "Age", "Social Status", "Species"]
SITUATION = ["Intervention", "PedPed", "Barrier", "CrossingSignal", "NumberOfCharacters", "DiffNumberOFCharacters"]
COLS = ["ResponseID", "ExtendedSessionID", "ScenarioOrder", "AttributeLevel", "ScenarioTypeStrict", "ScenarioType",
        "DefaultChoice", "Saved", "UserCountry3"] + SITUATION
SURVEY = ["Review_age", "Review_education", "Review_gender", "Review_income", "Review_political", "Review_religious"]
CHUNK = 2_000_000


def _hash(values: pd.Series) -> np.ndarray:
    return pd.util.hash_array(values.to_numpy(dtype=object)).view(np.int64)


def _user(sessions: pd.Series) -> pd.Series:
    return sessions.str.split("_", n=1).str[1]


class _Stream(io.RawIOBase):
    """A tar member read front to back, which is all pandas needs (the tar stream cannot say so itself)."""

    def __init__(self, f):
        self.f = f

    def readable(self):
        return True

    def readinto(self, b):
        data = self.f.read(len(b))
        b[:len(data)] = data
        return len(data)


def _chunks(path: pathlib.Path, cols: list[str]):
    with tarfile.open(path, "r|gz") as tar:
        for member in tar:
            f = tar.extractfile(member)
            if f is None:
                continue
            stream = io.BufferedReader(_Stream(f), 1 << 22)
            yield from pd.read_csv(stream, usecols=cols, chunksize=CHUNK, dtype=str, keep_default_na=False)


def responses(path: pathlib.Path) -> pd.DataFrame:
    parts, seen, kept = [], 0, 0
    for c in _chunks(path, COLS):
        seen += len(c)
        t = c["ScenarioType"]
        c = c.loc[(t == c["ScenarioTypeStrict"]) & t.isin(DIMS) & (c["AttributeLevel"] == c["DefaultChoice"])]
        num = c[SITUATION + ["Saved", "ScenarioOrder"]].apply(pd.to_numeric, errors="coerce")
        ok = num.notna().all(axis=1).to_numpy() & c["ExtendedSessionID"].str.contains("_").to_numpy()
        c, num = c.loc[ok], num.loc[ok]
        part = pd.DataFrame({
            "rid": _hash(c["ResponseID"]),
            "user": _hash(_user(c["ExtendedSessionID"])),
            "session": _hash(c["ExtendedSessionID"]),
            "dim": pd.Categorical(c["ScenarioType"], categories=DIMS).codes.astype(np.int8),
            "order": num["ScenarioOrder"].astype(np.int8),
            "saved": num["Saved"].astype(np.int8),
            "country": c["UserCountry3"].to_numpy(),
        })
        for col, name in zip(SITUATION, ("intervention", "pedped", "barrier", "signal", "nchar", "diff")):
            part[name] = num[col].astype(np.int8).to_numpy()
        parts.append(part)
        kept += len(part)
        print(f"  {seen:>12,} rows read, {kept:>11,} dilemmas kept", flush=True)
    out = pd.concat(parts, ignore_index=True)
    out["country"] = out["country"].astype("category")
    before = len(out)
    out = out.drop_duplicates("rid")
    print(f"  {before - len(out):,} duplicate dilemmas dropped")
    return out


def survey(path: pathlib.Path) -> pd.DataFrame:
    parts = []
    for c in _chunks(path, ["ExtendedSessionID", "UserCountry3"] + SURVEY):
        c = c.drop_duplicates("ExtendedSessionID")
        c = c.loc[c["ExtendedSessionID"].str.contains("_")]
        parts.append(pd.DataFrame({"user": _hash(_user(c["ExtendedSessionID"])), "country": c["UserCountry3"].to_numpy(),
                                   **{k: c[k].to_numpy() for k in SURVEY}}))
    out = pd.concat(parts, ignore_index=True).drop_duplicates("user")
    for k in ("Review_age", "Review_political", "Review_religious"):
        out[k] = pd.to_numeric(out[k], errors="coerce")
    return out


def main():
    people = survey(MM / "SharedResponsesSurvey.csv.tar.gz")
    people.to_parquet(MM / "survey_people.parquet")
    print(f"survey takers: {len(people):,}")
    if "--survey-only" in sys.argv:
        return
    rows = responses(MM / "SharedResponses.csv.tar.gz")
    rows.to_parquet(MM / "dilemmas.parquet")
    print(f"dilemmas: {len(rows):,} from {rows['user'].nunique():,} people in {rows['session'].nunique():,} sessions")


if __name__ == "__main__":
    main()
